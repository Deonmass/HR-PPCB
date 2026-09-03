'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  DECLARATION_BATCH_LIMIT,
  formatDmtSalary,
  suggestDmtMotif,
  type DmtMotifId,
} from '@/lib/declaration-dmt-motif';
import { DEFAULT_LOCALISATIONS } from '@/lib/localisations';
import { downloadDeclarationResponse } from '@/lib/declaration-download-client';
import { formatFetchFailure } from '@/lib/http-error';
import { showError } from '@/lib/swal';
import type { Employee } from '@/lib/types';

const MOTIF_OPTIONS: Array<{ id: DmtMotifId; label: string }> = [
  { id: 'embauche', label: '(1) Embauchage' },
  { id: 'expiration', label: '(2) Expiration' },
  { id: 'licenciement', label: '(3) Licenciement' },
  { id: 'demission', label: '(4) Démission' },
  { id: 'deces', label: '(5) Décès' },
];

interface DmtDraftRow {
  key: string;
  employee: Employee | null;
  exitOnly: boolean;
  motif: DmtMotifId;
  salary: string;
  lieu: string;
  documentDate: string;
}

function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function newRow(documentDate = todayIso()): DmtDraftRow {
  return {
    key: `dmt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    employee: null,
    exitOnly: false,
    motif: 'embauche',
    salary: '',
    lieu: '',
    documentDate,
  };
}

export default function MouvementTravailleurPage() {
  const { can, isLoading } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [exits, setExits] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<DmtDraftRow[]>(() => [newRow()]);
  const [generating, setGenerating] = useState(false);
  const filled = useMemo(
    () => rows.filter((row) => row.employee).map((row) => row.employee as Employee),
    [rows],
  );
  const taken = useMemo(
    () => new Set(filled.map((employee) => employee.matricule)),
    [filled],
  );
  const availableActive = useMemo(
    () => employees.filter((employee) => !taken.has(employee.matricule)),
    [employees, taken],
  );
  const availableExits = useMemo(
    () => exits.filter((employee) => !taken.has(employee.matricule)),
    [exits, taken],
  );

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/employees').then(async (res) => (res.ok ? res.json() : [])),
      fetch('/api/employees/exits').then(async (res) => (res.ok ? res.json() : [])),
    ])
      .then(([active, left]) => {
        if (cancelled) return;
        setEmployees(Array.isArray(active) ? active : []);
        setExits(Array.isArray(left) ? left : []);
      })
      .catch(() => {
        if (cancelled) return;
        setEmployees([]);
        setExits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const assignEmployee = (key: string, employee: Employee) => {
    setRows((prev) => {
      if (prev.some((row) => row.employee?.matricule === employee.matricule && row.key !== key)) {
        return prev;
      }
      const next = prev.map((row) => (
        row.key === key
          ? {
              ...row,
              employee,
              exitOnly: row.exitOnly || exits.some((item) => item.matricule === employee.matricule),
              motif: suggestDmtMotif(employee),
              lieu: employee.localisation || row.lieu,
            }
          : row
      ));
      if (next.every((row) => row.employee)) {
        next.push(newRow(next[next.length - 1]?.documentDate || todayIso()));
      }
      return next;
    });
  };

  const updateRow = (key: string, patch: Partial<DmtDraftRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const removeRow = (key: string) => {
    setRows((prev) => {
      const next = prev.filter((row) => row.key !== key);
      return next.some((row) => !row.employee) ? next : [...next, newRow()];
    });
  };

  const handleDownload = async () => {
    const items = rows
      .filter((row) => row.employee)
      .map((row) => ({
        matricule: row.employee!.matricule,
        motif: row.motif,
        salary: formatDmtSalary(row.salary),
        lieu: row.lieu.trim(),
        documentDate: row.documentDate,
      }));
    if (items.length === 0) return;
    if (items.length > DECLARATION_BATCH_LIMIT) {
      await showError(`Maximum ${DECLARATION_BATCH_LIMIT} agents par téléchargement.`);
      return;
    }
    setGenerating(true);
    try {
      await downloadDeclarationResponse(
        '/api/documents/mouvement-travailleur',
        { items },
        'DECLARATION DE MOUVEMENT DE TRAVAILLEUR.pdf',
      );
    } catch (err) {
      await showError(formatFetchFailure(err));
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || loading) return <div className="loading">Chargement...</div>;

  if (!can('documents.mouvement-travailleur', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  const canCreate = can('documents.mouvement-travailleur', 'create');
  const addedCount = filled.length;

  return (
    <div className="docs-dmt-page">
      <div className="page-header">
        <div>
          <h2>Déclaration de mouvement de travailleur</h2>
          <p>
            Formulaire ONEM (DMT) — saisissez l’agent, le salaire et la date sur chaque ligne. Un
            seul PDF est généré, avec une page par agent.
          </p>
        </div>
        <Link href="/documents" className="btn btn-secondary btn-sm docs-dmt-back" prefetch={false}>
          ← Documents
        </Link>
      </div>

      <div className="panel mvt-table-panel docs-declaration-table-panel docs-dmt-table-panel">
        <div className="table-wrap">
          <table className="data-table mvt-table docs-declaration-table docs-dmt-table">
            <thead>
              <tr>
                <th className="is-num">N°</th>
                <th>Agent</th>
                <th>Motif</th>
                <th>Salaire</th>
                <th>Lieu</th>
                <th>Date</th>
                <th className="docs-declaration-col-action"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const employee = row.employee;
                return (
                  <tr key={row.key}>
                    <td className="is-num">{index + 1}</td>
                    <td className="docs-dmt-agent-cell">
                      <div className="docs-dmt-agent-line">
                        <div className="docs-dmt-agent-pick">
                          {employee ? (
                            <>
                              <strong className="docs-dmt-agent-name">{employee.nom}</strong>
                              <span className="docs-dmt-matricule">{employee.matricule}</span>
                              <span className="docs-dmt-poste">
                                {employee.jobTitle || employee.position || '—'}
                              </span>
                              {employee.localisation ? (
                                <span className="docs-dmt-poste">{employee.localisation}</span>
                              ) : null}
                            </>
                          ) : (
                            <EmployeeSuggestInput
                              employees={row.exitOnly ? availableExits : availableActive}
                              value=""
                              onChange={() => undefined}
                              onEmployeeSelect={(picked) => assignEmployee(row.key, picked)}
                              placeholder={
                                row.exitOnly
                                  ? 'Nom ou matricule (sorti)…'
                                  : 'Nom ou matricule…'
                              }
                            />
                          )}
                        </div>
                        <label className="form-checkbox docs-dmt-exit-only">
                          <input
                            type="checkbox"
                            checked={row.exitOnly}
                            disabled={generating}
                            onChange={(event) => {
                              updateRow(row.key, { exitOnly: event.target.checked });
                            }}
                          />
                          exit only
                        </label>
                      </div>
                    </td>
                    <td>
                      <select
                        className="docs-declaration-motif-select"
                        value={row.motif}
                        disabled={generating || !employee}
                        aria-label={employee ? `Motif pour ${employee.nom}` : 'Motif'}
                        onChange={(event) => {
                          updateRow(row.key, { motif: event.target.value as DmtMotifId });
                        }}
                      >
                        {MOTIF_OPTIONS.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <input
                        type="text"
                        className="docs-dmt-salary"
                        value={row.salary}
                        disabled={generating || !employee}
                        placeholder="ex. 2.809.843 FC"
                        aria-label={employee ? `Salaire de ${employee.nom}` : 'Salaire'}
                        onChange={(event) => updateRow(row.key, { salary: formatDmtSalary(event.target.value) })}
                      />
                    </td>
                    <td>
                      <select
                        className="docs-dmt-lieu"
                        value={row.lieu}
                        disabled={generating || !employee}
                        aria-label={employee ? `Lieu pour ${employee.nom}` : 'Lieu'}
                        onChange={(event) => updateRow(row.key, { lieu: event.target.value })}
                      >
                        <option value="">—</option>
                        {DEFAULT_LOCALISATIONS.map((site) => (
                          <option key={site} value={site}>{site}</option>
                        ))}
                        {row.lieu && !(DEFAULT_LOCALISATIONS as readonly string[]).includes(row.lieu) ? (
                          <option value={row.lieu}>{row.lieu}</option>
                        ) : null}
                      </select>
                    </td>
                    <td>
                      <input
                        type="date"
                        className="docs-dmt-date"
                        value={row.documentDate}
                        disabled={generating || !employee}
                        aria-label={employee ? `Date du document pour ${employee.nom}` : 'Date du document'}
                        onChange={(event) => updateRow(row.key, { documentDate: event.target.value })}
                      />
                    </td>
                    <td className="docs-declaration-col-action">
                      {employee ? (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={generating}
                          onClick={() => removeRow(row.key)}
                          aria-label={`Retirer ${employee.nom}`}
                        >
                          Retirer
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canCreate ? (
          <div className="docs-dmt-footer">
            <span className="docs-declaration-count">
              {addedCount} agent{addedCount > 1 ? 's' : ''}
            </span>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={generating || addedCount === 0}
              onClick={() => void handleDownload()}
            >
              {generating ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Génération…
                </>
              ) : addedCount > 1 ? (
                `Télécharger le PDF (${addedCount})`
              ) : (
                'Télécharger le PDF'
              )}
            </button>
          </div>
        ) : (
          <p className="docs-hub-empty">Vous n’avez pas la permission de générer ce document.</p>
        )}
      </div>
    </div>
  );
}
