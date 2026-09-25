'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import { filterAttestationSignatories } from '@/lib/attestation-signatories';
import {
  buildBailPropertyAddress,
  emptyContratBailForm,
  type ContratBailFormData,
} from '@/lib/contrat-bail-types';
import { formatFetchFailure, readResponseError } from '@/lib/http-error';
import { showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ContratBailPage() {
  const { can, isLoading } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [villaByMatricule, setVillaByMatricule] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<ContratBailFormData>(emptyContratBailForm);
  const [selected, setSelected] = useState<Employee | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/employees').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/documents/residence-attestation/villa-lookup').then((r) =>
        r.ok ? r.json() : { byMatricule: {} },
      ),
    ])
      .then(([emps, villa]) => {
        if (cancelled) return;
        setEmployees(Array.isArray(emps) ? (emps as Employee[]) : []);
        setVillaByMatricule(
          (villa as { byMatricule?: Record<string, string> })?.byMatricule || {},
        );
      })
      .catch(() => {
        if (!cancelled) {
          setEmployees([]);
          setVillaByMatricule({});
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signatories = useMemo(() => filterAttestationSignatories(employees), [employees]);

  const applyEmployee = (employee: Employee) => {
    setSelected(employee);
    const maison = villaByMatricule[employee.matricule] || '';
    setForm((prev) => ({
      ...prev,
      occupantName: employee.nom,
      occupantMatricule: employee.matricule,
      occupantIdentityNumber: employee.matricule,
      maisonNumero: maison,
      propertyAddress: buildBailPropertyAddress(maison),
    }));
  };

  const handleGenerate = async () => {
    if (!form.occupantName.trim()) {
      await showError('Sélectionnez l’occupant (employé)');
      return;
    }
    if (!form.propertyAddress.trim()) {
      await showError('Indiquez l’adresse des locaux');
      return;
    }
    if (!form.signerName.trim()) {
      await showError('Sélectionnez le signataire société (RH)');
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch('/api/documents/contrat-bail', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        await showError(await readResponseError(res));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
      const fileName = match?.[1]
        ? decodeURIComponent(match[1].replace(/"/g, ''))
        : `Contrat de bail - ${form.occupantName}.docx`;
      triggerDownload(blob, fileName);
      await showSuccess('Contrat de bail généré');
    } catch (err) {
      await showError(formatFetchFailure(err));
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || loading) {
    return <div className="loading">Chargement…</div>;
  }

  if (!can('documents.contrat-bail', 'view')) {
    return <div className="alert alert-danger">Accès refusé</div>;
  }

  return (
    <>
      <div className="page-header contrat-standard-header">
        <div>
          <h2>Contrat de bail</h2>
          <p>
            Accord d’hébergement village (FR) — occupant, locaux, dates et signataire RH.
          </p>
        </div>
        <Link href="/documents" className="btn btn-ghost btn-sm">
          ← Documents
        </Link>
      </div>

      <div className="panel panel-padded docs-generator-panel contrat-standard-panel">
        <h3 className="contrat-section-title">Occupant (employé)</h3>
        <div className="form-group">
          <label>Agent</label>
          <EmployeeSuggestInput
            employees={employees}
            value={form.occupantName}
            onChange={(value) => {
              setForm((p) => ({ ...p, occupantName: value }));
              setSelected(null);
            }}
            onEmployeeSelect={applyEmployee}
            placeholder="Rechercher un employé…"
            required
          />
          {selected ? (
            <p className="field-hint">
              {selected.matricule}
              {selected.jobTitle ? ` · ${selected.jobTitle}` : ''}
              {selected.departement ? ` · ${selected.departement}` : ''}
            </p>
          ) : null}
        </div>

        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label>Matricule / n° d’identité</label>
            <input
              className="filter-select"
              value={form.occupantIdentityNumber}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  occupantIdentityNumber: e.target.value,
                  occupantMatricule: p.occupantMatricule || e.target.value,
                }))
              }
              required
            />
          </div>
          <div className="form-group">
            <label>N° maison village</label>
            <input
              className="filter-select"
              value={form.maisonNumero}
              onChange={(e) => {
                const maisonNumero = e.target.value;
                setForm((p) => ({
                  ...p,
                  maisonNumero,
                  propertyAddress: buildBailPropertyAddress(maisonNumero),
                }));
              }}
              placeholder="ex. 32"
            />
          </div>
        </div>

        <div className="form-group">
          <label>Adresse des locaux</label>
          <input
            className="filter-select"
            value={form.propertyAddress}
            onChange={(e) => setForm((p) => ({ ...p, propertyAddress: e.target.value }))}
            required
          />
        </div>

        <h3 className="contrat-section-title">Durée</h3>
        <div className="form-grid form-grid-2">
          <div className="form-group">
            <label>Début d’occupation</label>
            <input
              type="date"
              value={form.occupationStartDate}
              onChange={(e) => setForm((p) => ({ ...p, occupationStartDate: e.target.value }))}
              required
            />
          </div>
          <div className="form-group">
            <label>Date du document (signature)</label>
            <input
              type="date"
              value={form.documentDate}
              onChange={(e) => setForm((p) => ({ ...p, documentDate: e.target.value }))}
              required
            />
          </div>
        </div>

        <h3 className="contrat-section-title">Signataire société (RH)</h3>
        <div className="form-group">
          <label>Responsable</label>
          <select
            className="filter-select"
            value={
              signatories.find((s) => s.nom === form.signerName)?.matricule
              || ''
            }
            onChange={(e) => {
              const mat = e.target.value;
              const mgr = signatories.find((s) => s.matricule === mat);
              setForm((p) => ({
                ...p,
                signerName: mgr?.nom || p.signerName,
                signerTitle:
                  mgr?.jobTitle || mgr?.position || 'Directrice des Ressources Humaines',
              }));
            }}
          >
            <option value="">— Sélectionner —</option>
            {signatories.map((m) => (
              <option key={m.matricule} value={m.matricule}>
                {m.nom} — {m.jobTitle || m.position || 'RH'}
              </option>
            ))}
          </select>
          {form.signerName ? (
            <p className="field-hint">
              {form.signerName}
              {form.signerTitle ? ` · ${form.signerTitle}` : ''}
            </p>
          ) : null}
        </div>

        {can('documents.contrat-bail', 'create') ? (
          <div className="exit-docs-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleGenerate()}
              disabled={generating || !form.occupantName.trim()}
            >
              {generating ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Génération…
                </>
              ) : (
                'Générer le contrat de bail'
              )}
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
