'use client';

import { useMemo, useState } from 'react';
import { showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

export const EXIT_DOCS = [
  { id: 'clearance', label: 'Employee exit clearance form' },
  { id: 'interview', label: 'Exit interview form' },
  { id: 'attestation-fin-service', label: 'Attestation de fin de service' },
  { id: 'user-removal', label: 'User removal form' },
] as const;

type ExitDocId = (typeof EXIT_DOCS)[number]['id'];
type DocProgress = 'idle' | 'running' | 'done' | 'error';

/** jj/mm/aaaa (ou ISO) → valeur input[type=date]. */
function toInputDate(display: string): string {
  const raw = (display ?? '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return '';
  return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
}

function todayInputDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function fileNameFromResponse(response: Response, fallback: string): string {
  const header = response.headers.get('X-File-Name');
  if (header) {
    try {
      return decodeURIComponent(header);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

interface Props {
  employee: Employee;
  /** Appelé après une génération réussie (fermeture de modal, etc.). */
  onGenerated?: () => void;
}

export default function ExitDocsGenerator({ employee, onGenerated }: Props) {
  const [checked, setChecked] = useState<Record<ExitDocId, boolean>>({
    clearance: true,
    interview: true,
    'attestation-fin-service': true,
    'user-removal': true,
  });
  const [exitDate, setExitDate] = useState(() => toInputDate(employee.dateFinContrat));
  const [documentDate, setDocumentDate] = useState(todayInputDate);
  const [progress, setProgress] = useState<Partial<Record<ExitDocId, DocProgress>>>({});
  const [generating, setGenerating] = useState(false);

  const selectedDocs = useMemo(() => EXIT_DOCS.filter((doc) => checked[doc.id]), [checked]);

  const toggleDoc = (id: ExitDocId) => {
    setChecked((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleGenerate = async () => {
    if (!selectedDocs.length) {
      await showError('Sélectionnez au moins un document');
      return;
    }

    setGenerating(true);
    setProgress({});
    try {
      // Les documents sont téléchargés directement (dossier Téléchargements).
      let errors = 0;
      for (const doc of selectedDocs) {
        setProgress((prev) => ({ ...prev, [doc.id]: 'running' }));
        try {
          const res = await fetch('/api/documents/exit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              matricule: employee.matricule,
              doc: doc.id,
              exitDate,
              documentDate,
            }),
          });
          if (!res.ok) {
            const json = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(json?.error || `Erreur génération ${doc.label}`);
          }
          const blob = await res.blob();
          const fileName = fileNameFromResponse(res, `${doc.label} - ${employee.nom}.docx`);
          triggerBrowserDownload(blob, fileName);
          setProgress((prev) => ({ ...prev, [doc.id]: 'done' }));
        } catch (err) {
          errors += 1;
          setProgress((prev) => ({ ...prev, [doc.id]: 'error' }));
          const message = err instanceof Error ? err.message : 'Erreur';
          await showError(`${doc.label} : ${message}`);
        }
      }

      if (!errors) {
        await showSuccess(`${selectedDocs.length} document(s) téléchargé(s)`);
        onGenerated?.();
      }
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="exit-docs-generator">
      <div className="exit-docs-employee">
        <strong>{employee.nom}</strong>
        <span>
          {employee.matricule} · {employee.jobTitle || employee.position || '—'} ·{' '}
          {employee.departement || '—'}
        </span>
      </div>

      <div className="exit-docs-list">
        {EXIT_DOCS.map((doc) => {
          const state = progress[doc.id] ?? 'idle';
          return (
            <label key={doc.id} className={`exit-docs-item is-${state}`}>
              <input
                type="checkbox"
                checked={Boolean(checked[doc.id])}
                onChange={() => toggleDoc(doc.id)}
                disabled={generating}
              />
              <span className="exit-docs-item-label">{doc.label}</span>
              <span className="exit-docs-item-state" aria-hidden="true">
                {state === 'running' && <span className="btn-spinner" />}
                {state === 'done' && '✓'}
                {state === 'error' && '✕'}
              </span>
            </label>
          );
        })}
      </div>

      <div className="form-grid exit-docs-dates">
        <div className="form-group">
          <label>Dernier jour de travail / sortie</label>
          <input
            type="date"
            className="input-date"
            value={exitDate}
            onChange={(e) => setExitDate(e.target.value)}
            disabled={generating}
          />
        </div>
        <div className="form-group">
          <label>Date du document</label>
          <input
            type="date"
            className="input-date"
            value={documentDate}
            onChange={(e) => setDocumentDate(e.target.value)}
            disabled={generating}
          />
        </div>
      </div>

      <p className="exit-docs-hint">
        Les documents sont remplis avec les informations de l’agent (nom, matricule, fonction,
        département, dates, CNSS, manager, centre de coût) et téléchargés directement.
      </p>

      <div className="exit-docs-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleGenerate}
          disabled={generating || !selectedDocs.length}
        >
          {generating ? (
            <>
              <span className="btn-spinner" aria-hidden="true" /> Génération…
            </>
          ) : (
            `Générer ${selectedDocs.length} document${selectedDocs.length > 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  );
}
