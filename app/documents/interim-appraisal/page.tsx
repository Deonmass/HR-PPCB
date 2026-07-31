'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import { usePermissions } from '@/contexts/PermissionContext';
import { showError } from '@/lib/swal';
import type { Employee } from '@/lib/types';

export default function InterimAppraisalPage() {
  const { can, isLoading } = usePermissions();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch('/api/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(Array.isArray(json) ? json : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (!selected) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/documents/interim-appraisal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricule: selected.matricule }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || 'Génération impossible');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `Interim appraisal evaluation - ${selected.nom}.docx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Génération impossible');
    } finally {
      setGenerating(false);
    }
  };

  if (isLoading || loading) return <div className="loading">Chargement...</div>;

  if (!can('documents.appraisal', 'view')) {
    return <p className="docs-hub-empty">Vous n’avez pas accès à ce document.</p>;
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Interim appraisal evaluation</h2>
          <p>
            Évaluation de période d’essai — le nom et la fonction de l’agent sont remplis
            automatiquement. Le document est téléchargé directement.
          </p>
        </div>
        <Link href="/documents" className="btn btn-secondary btn-sm" prefetch={false}>
          ← Documents
        </Link>
      </div>

      <div className="panel docs-generator-panel">
        <div className="form-group docs-generator-picker">
          <label>Agent concerné</label>
          <EmployeeSuggestInput
            employees={employees}
            value={query}
            onChange={(value) => {
              setQuery(value);
              if (selected && value !== selected.nom) setSelected(null);
            }}
            onEmployeeSelect={(employee) => {
              setSelected(employee);
              setQuery(employee.nom);
            }}
            placeholder="Rechercher un agent (nom ou matricule)…"
          />
        </div>

        {selected ? (
          can('documents.appraisal', 'create') ? (
            <>
              <div className="exit-docs-employee">
                <strong>{selected.nom}</strong>
                <span>
                  {selected.matricule} · {selected.jobTitle || selected.position || '—'} ·{' '}
                  {selected.departement || '—'}
                </span>
              </div>
              <div className="exit-docs-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleGenerate()}
                  disabled={generating}
                >
                  {generating ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      Génération…
                    </>
                  ) : (
                    'Générer le document'
                  )}
                </button>
              </div>
            </>
          ) : (
            <p className="docs-hub-empty">
              Vous n’avez pas la permission de générer ce document.
            </p>
          )
        ) : (
          <p className="docs-generator-placeholder">
            Sélectionnez un agent pour générer son évaluation.
          </p>
        )}
      </div>
    </>
  );
}
