'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import { DECLARATION_BATCH_LIMIT } from '@/lib/declaration-dmt-motif';
import { downloadDeclarationResponse } from '@/lib/declaration-download-client';
import {
  computeDependantAge,
  familyGroupKey,
  formatDependantBirthDateDisplay,
  isBornFromMonth,
  isChildStatut,
  isEmployeeStatut,
  listFamilyDependants,
  parseDependantBirthDate,
  resolveDependantAge,
} from '@/lib/dependants-utils';
import type { Dependant } from '@/lib/dependants-types';
import { formatFetchFailure } from '@/lib/http-error';
import {
  DEFAULT_LOCALISATIONS,
  mergeLocalisationOptions,
  normalizeLocalisation,
} from '@/lib/localisations';
import { PPC_EMPLOYER_INSS } from '@/lib/ppc-letterhead-address';
import { showError } from '@/lib/swal';
import type { Employee } from '@/lib/types';

const MONTHS_FR = [
  { value: 1, label: 'Janvier' },
  { value: 2, label: 'Février' },
  { value: 3, label: 'Mars' },
  { value: 4, label: 'Avril' },
  { value: 5, label: 'Mai' },
  { value: 6, label: 'Juin' },
  { value: 7, label: 'Juillet' },
  { value: 8, label: 'Août' },
  { value: 9, label: 'Septembre' },
  { value: 10, label: 'Octobre' },
  { value: 11, label: 'Novembre' },
  { value: 12, label: 'Décembre' },
];

interface F6DraftRow {
  key: string;
  employee: Employee | null;
  exitOnly: boolean;
  selectedIds: number[];
}

function newRow(): F6DraftRow {
  return {
    key: `f6-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    employee: null,
    exitOnly: false,
    selectedIds: [],
  };
}

function yearOptions(): number[] {
  const current = new Date().getFullYear();
  const years: number[] = [];
  for (let year = current; year >= current - 25; year -= 1) years.push(year);
  return years;
}

function sortedFamilyMembers(family: { spouse: Dependant | null; children: Dependant[] }): Dependant[] {
  const members = [
    ...(family.spouse ? [family.spouse] : []),
    ...family.children,
  ];
  return members.sort((a, b) => {
    const first = parseDependantBirthDate(a.dateNaissance)?.getTime() ?? Number.POSITIVE_INFINITY;
    const second = parseDependantBirthDate(b.dateNaissance)?.getTime() ?? Number.POSITIVE_INFINITY;
    return first - second;
  });
}

function matchesLocalisation(employee: { localisation?: string | null }, site: string): boolean {
  if (!site) return true;
  return normalizeLocalisation(employee.localisation) === normalizeLocalisation(site);
}

function infantChildIds(family: { spouse: Dependant | null; children: Dependant[] }): number[] {
  return family.children
    .filter((child) => {
      const fromBirth = computeDependantAge(child.dateNaissance);
      const age = fromBirth ?? resolveDependantAge(child.age, child.dateNaissance);
      return age === 0;
    })
    .map((child) => child.id);
}

export default function CompositionFamilialePage() {
  const { can, isLoading } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [exits, setExits] = useState<Employee[]>([]);
  const [dependants, setDependants] = useState<Dependant[]>([]);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<F6DraftRow[]>(() => [newRow()]);
  const [generating, setGenerating] = useState(false);
  const [birthMonth, setBirthMonth] = useState(0);
  const [birthYear, setBirthYear] = useState(0);
  const [localisation, setLocalisation] = useState('');
  const localisationOptions = useMemo(
    () => mergeLocalisationOptions(
      DEFAULT_LOCALISATIONS,
      employees.map((row) => row.localisation),
      exits.map((row) => row.localisation),
      dependants.map((row) => row.localisation),
    ),
    [dependants, employees, exits],
  );
  const filled = useMemo(
    () => rows.filter((row) => row.employee).map((row) => row.employee as Employee),
    [rows],
  );
  const taken = useMemo(
    () => new Set(filled.map((employee) => employee.matricule)),
    [filled],
  );
  const availableActive = useMemo(
    () => employees.filter((employee) => (
      !taken.has(employee.matricule) && matchesLocalisation(employee, localisation)
    )),
    [employees, localisation, taken],
  );
  const availableExits = useMemo(
    () => exits.filter((employee) => (
      !taken.has(employee.matricule) && matchesLocalisation(employee, localisation)
    )),
    [exits, localisation, taken],
  );
  const allEmployees = useMemo(() => [...employees, ...exits], [employees, exits]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/employees').then(async (res) => (res.ok ? res.json() : [])),
      fetch('/api/employees/exits').then(async (res) => (res.ok ? res.json() : [])),
      fetch('/api/documents/composition-familiale').then(async (res) => (res.ok ? res.json() : {})),
    ])
      .then(([active, left, docs]) => {
        if (cancelled) return;
        setEmployees(Array.isArray(active) ? active : []);
        setExits(Array.isArray(left) ? left : []);
        const list = Array.isArray(docs?.dependants) ? docs.dependants as Dependant[] : [];
        setDependants(list);
      })
      .catch(() => {
        if (cancelled) return;
        setEmployees([]);
        setExits([]);
        setDependants([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!birthMonth || !birthYear) return;
    const matchingKeys = new Set(
      dependants
        .filter((row) => (
          !isEmployeeStatut(row.statut)
          && isBornFromMonth(row.dateNaissance, birthYear, birthMonth)
        ))
        .map((row) => familyGroupKey(row))
        .filter(Boolean),
    );
    const matches = allEmployees.filter((employee) => (
      matchingKeys.has(employee.matricule.trim())
      && matchesLocalisation(employee, localisation)
    ));
    setRows([
      ...matches.map((employee) => ({
        key: `f6-${employee.matricule}`,
        employee,
        exitOnly: exits.some((item) => item.matricule === employee.matricule),
        selectedIds: infantChildIds(listFamilyDependants(dependants, employee)),
      })),
      newRow(),
    ]);
  }, [allEmployees, birthMonth, birthYear, dependants, exits, localisation]);

  const assignEmployee = (key: string, employee: Employee) => {
    const selectedIds = infantChildIds(listFamilyDependants(dependants, employee));
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
              selectedIds,
            }
          : row
      ));
      if (next.every((row) => row.employee)) {
        next.push(newRow());
      }
      return next;
    });
  };

  const updateRow = (key: string, patch: Partial<F6DraftRow>) => {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  };

  const toggleMember = (key: string, id: number) => {
    setRows((prev) => prev.map((row) => {
      if (row.key !== key) return row;
      const selected = row.selectedIds.includes(id)
        ? row.selectedIds.filter((item) => item !== id)
        : [...row.selectedIds, id];
      return { ...row, selectedIds: selected };
    }));
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
        memberIds: row.selectedIds,
      }));
    if (items.length === 0) return;
    if (items.length > DECLARATION_BATCH_LIMIT) {
      await showError(`Maximum ${DECLARATION_BATCH_LIMIT} agents par téléchargement.`);
      return;
    }
    setGenerating(true);
    try {
      await downloadDeclarationResponse(
        '/api/documents/composition-familiale',
        { items },
        'DECLARATION-DE-COMPOSITION-FAMILIALE-DU-TRAVAILLEUR.pdf',
      );
    } catch (err) {
      await showError(formatFetchFailure(err));
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || loading) return <div className="loading">Chargement...</div>;

  if (!can('documents.composition-familiale', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  const canCreate = can('documents.composition-familiale', 'create');
  const addedCount = filled.length;

  return (
    <div className="docs-dmt-page">
      <div className="page-header">
        <div>
          <h2>Déclaration de composition familiale du travailleur</h2>
          <p>
            Formulaire CNSS (MOD. F6) — cochez les dépendants à faire figurer. Un seul PDF est
            généré, avec une fiche (2 pages) par agent.
          </p>
        </div>
        <div className="docs-f6-header-actions">
          <span className="docs-f6-affiliation" title="Numéro d’affiliation CNSS de l’employeur">
            N° INSS
            {' '}
            <strong>{PPC_EMPLOYER_INSS}</strong>
          </span>
          <label className="docs-f6-period">
            <span>Nés à partir de</span>
            <select
              value={birthMonth || ''}
              aria-label="Mois de naissance"
              onChange={(event) => setBirthMonth(Number(event.target.value) || 0)}
            >
              <option value="">Mois</option>
              {MONTHS_FR.map((month) => (
                <option key={month.value} value={month.value}>{month.label}</option>
              ))}
            </select>
            <select
              value={birthYear || ''}
              aria-label="Année de naissance"
              onChange={(event) => setBirthYear(Number(event.target.value) || 0)}
            >
              <option value="">Année</option>
              {yearOptions().map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            <select
              value={localisation}
              aria-label="Localisation"
              onChange={(event) => setLocalisation(event.target.value)}
            >
              <option value="">Localisation</option>
              {localisationOptions.map((site) => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>
          </label>
          <Link href="/documents" className="btn btn-secondary btn-sm docs-dmt-back" prefetch={false}>
            ← Documents
          </Link>
        </div>
      </div>

      <div className="panel mvt-table-panel docs-declaration-table-panel docs-dmt-table-panel">
        <div className="table-wrap">
          <table className="data-table mvt-table docs-declaration-table docs-dmt-table docs-f6-table">
            <thead>
              <tr>
                <th className="is-num">N°</th>
                <th>Agent</th>
                <th>Famille</th>
                <th>CNSS</th>
                <th className="docs-declaration-col-action"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const employee = row.employee;
                const members = employee
                  ? sortedFamilyMembers(listFamilyDependants(dependants, employee))
                  : [];
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
                    <td className="docs-f6-family-cell">
                      {employee ? (
                        members.length > 0 ? (
                          <div className="docs-f6-family">
                            {members.map((member) => {
                              const recent = Boolean(
                                birthMonth
                                && birthYear
                                && isBornFromMonth(member.dateNaissance, birthYear, birthMonth),
                              );
                              const kind = isChildStatut(member.statut) ? 'Enfant' : 'Conjoint';
                              return (
                                <label
                                  key={member.id}
                                  className={`docs-f6-member${recent ? ' is-recent' : ''}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={row.selectedIds.includes(member.id)}
                                    disabled={generating}
                                    onChange={() => toggleMember(row.key, member.id)}
                                  />
                                  <span>
                                    <strong>{kind}</strong>
                                    {' '}
                                    {member.nom}
                                    <span className="docs-f6-member-meta">
                                      {formatDependantBirthDateDisplay(member.dateNaissance) || '—'}
                                    </span>
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        ) : (
                          <span className="docs-f6-family-empty">Aucun dépendant</span>
                        )
                      ) : (
                        <span className="docs-f6-family-empty">—</span>
                      )}
                    </td>
                    <td>{employee?.cnss || '—'}</td>
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
