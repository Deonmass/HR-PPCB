'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadSkippedFacturesImport } from '@/lib/factures-fournisseurs/import-report';
import type { FactureImportSkippedRow } from '@/lib/factures-fournisseurs/import-types';
import { showError, showSuccess } from '@/lib/swal';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

interface ImportReport {
  imported: number;
  skipped: number;
  sourceRowCount: number;
  uniqueRowCount: number;
  skippedRows: FactureImportSkippedRow[];
}

export default function FacturesSuiviImportModal({ open, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');
  const [report, setReport] = useState<ImportReport | null>(null);

  useEffect(() => {
    if (!open) {
      xhrRef.current?.abort();
      xhrRef.current = null;
      setFile(null);
      setPhase('idle');
      setProgress(0);
      setStatusText('');
      setReport(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  if (!open) return null;

  const busy = phase === 'uploading' || phase === 'processing';
  const skippedRows = report?.skippedRows ?? [];

  const handleUpload = () => {
    if (!file) {
      void showError('Sélectionnez un fichier Excel');
      return;
    }

    const form = new FormData();
    form.append('file', file);

    setPhase('uploading');
    setProgress(5);
    setStatusText('Envoi du fichier…');
    setReport(null);

    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    const startedAt = Date.now();

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        setProgress((p) => Math.min(45, p + 5));
        return;
      }
      const ratio = event.loaded / event.total;
      setProgress(Math.round(5 + ratio * 45));
    };

    xhr.upload.onload = () => {
      setPhase('processing');
      setProgress(55);
      setStatusText('Traitement des lignes…');
    };

    const tick = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p;
        const elapsed = Date.now() - startedAt;
        const target = Math.min(92, 55 + (elapsed / 8000) * 37);
        return Math.max(p, Math.round(target));
      });
    }, 200);

    xhr.onerror = () => {
      window.clearInterval(tick);
      setPhase('error');
      setStatusText('Échec réseau');
      void showError('Import impossible');
    };

    xhr.onabort = () => {
      window.clearInterval(tick);
      setPhase('idle');
      setProgress(0);
      setStatusText('');
    };

    xhr.onload = () => {
      window.clearInterval(tick);
      let json: {
        error?: string;
        imported?: number;
        skipped?: number;
        sourceRowCount?: number;
        uniqueRowCount?: number;
        totalRows?: number;
        skippedRows?: FactureImportSkippedRow[];
      } = {};
      try {
        json = JSON.parse(xhr.responseText || '{}') as typeof json;
      } catch {
        json = {};
      }

      if (xhr.status < 200 || xhr.status >= 300) {
        setPhase('error');
        setStatusText(json.error || 'Import impossible');
        void showError(json.error || 'Import impossible');
        return;
      }

      const nextReport: ImportReport = {
        imported: json.imported ?? 0,
        skipped: json.skipped ?? json.skippedRows?.length ?? 0,
        sourceRowCount: json.sourceRowCount ?? json.totalRows ?? 0,
        uniqueRowCount: json.uniqueRowCount ?? 0,
        skippedRows: json.skippedRows ?? [],
      };

      setPhase('done');
      setProgress(100);
      setStatusText(
        `${nextReport.imported} facture(s) importée(s) sur ${nextReport.sourceRowCount}` +
          (nextReport.skipped ? ` · ${nextReport.skipped} non importée(s)` : ''),
      );
      setReport(nextReport);
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onImported();
      void showSuccess(
        `${nextReport.imported} facture(s) importée(s) sur ${nextReport.sourceRowCount}` +
          (nextReport.skipped ? ` · ${nextReport.skipped} non importée(s)` : ''),
      );
      if (!nextReport.skipped) {
        window.setTimeout(() => onClose(), 450);
      }
    };

    xhr.open('POST', '/api/factures-suivi/import');
    xhr.send(form);
  };

  return (
    <div className="modal-overlay open" onClick={busy ? undefined : onClose}>
      <div
        className={`modal modal-form${skippedRows.length ? ' factures-import-modal-wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Importer des factures (Excel)</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            disabled={busy}
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="factures-suivi-assign-hint">
            Colonnes attendues : <strong>DATE</strong>, <strong>SOCIETE</strong>,{' '}
            <strong>FACTURE</strong>, <strong>MONTANT</strong>, <strong>PR</strong>,{' '}
            <strong>P.O</strong>, <strong>PYTMT</strong>.
            <br />
            <strong>PYTMT</strong> = Unpaid / vide → non payée ; PAID ou une référence de paiement → payée.
            <br />
            Même n° de facture avec un PR ou un P.O différent = deux lignes distinctes.
            Une seconde importation des mêmes données n’enregistre pas de doublon.
          </p>
          <div className="form-group">
            <label>Fichier Excel</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              disabled={busy}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {file && !busy ? (
            <p className="factures-suivi-toolbar-meta">Fichier : {file.name}</p>
          ) : null}

          {(busy || phase === 'done' || phase === 'error') && (
            <div className="factures-import-progress">
              <div className="permissions-progress-track">
                <div
                  className={`permissions-progress-fill${phase === 'error' ? ' is-error' : ''}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="factures-import-progress-meta">
                <span>{statusText || 'Import…'}</span>
                <strong>{progress}%</strong>
              </div>
            </div>
          )}

          {report && phase === 'done' ? (
            <div className="factures-import-report">
              <p className="factures-suivi-toolbar-meta">
                {report.imported} insérée(s) · {report.sourceRowCount} ligne(s) dans le fichier
                {report.uniqueRowCount && report.uniqueRowCount !== report.sourceRowCount
                  ? ` · ${report.uniqueRowCount} ligne(s) unique(s)`
                  : ''}
                {report.skipped ? ` · ${report.skipped} non importée(s)` : ''}
              </p>
              {skippedRows.length > 0 ? (
                <>
                  <div className="factures-import-skipped-head">
                    <strong>Lignes non importées</strong>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => downloadSkippedFacturesImport(skippedRows)}
                    >
                      Exporter pour traitement
                    </button>
                  </div>
                  <div className="factures-import-skipped-wrap">
                    <table className="data-table factures-import-skipped-table">
                      <thead>
                        <tr>
                          <th>DATE</th>
                          <th>SOCIETE</th>
                          <th>FACTURE</th>
                          <th>PR</th>
                          <th>P.O</th>
                          <th>COMMENTAIRE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skippedRows.map((row, index) => (
                          <tr key={`${row.facture}-${row.pr}-${row.po}-${index}`}>
                            <td>{row.date || '—'}</td>
                            <td>{row.societe || '—'}</td>
                            <td>{row.facture || '—'}</td>
                            <td>{row.pr || '—'}</td>
                            <td>{row.po || '—'}</td>
                            <td>{row.comment}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            {phase === 'done' ? 'Fermer' : 'Annuler'}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || !file}
            onClick={handleUpload}
          >
            {busy ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {busy ? 'Import…' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
