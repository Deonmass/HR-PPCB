'use client';

import { useEffect, useRef, useState } from 'react';
import { showError, showSuccess } from '@/lib/swal';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

type Phase = 'idle' | 'uploading' | 'processing' | 'done' | 'error';

export default function FacturesSuiviImportModal({ open, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    if (!open) {
      xhrRef.current?.abort();
      xhrRef.current = null;
      setFile(null);
      setPhase('idle');
      setProgress(0);
      setStatusText('');
      if (inputRef.current) inputRef.current.value = '';
    }
  }, [open]);

  if (!open) return null;

  const busy = phase === 'uploading' || phase === 'processing';

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

    // Soft progress while the server parses / writes JSON (target < 10s).
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
        totalRows?: number;
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

      setPhase('done');
      setProgress(100);
      setStatusText(
        `${json.imported ?? 0} facture(s) importée(s)` +
          (json.skipped ? ` · ${json.skipped} ignorée(s)` : ''),
      );
      void showSuccess(
        `${json.imported ?? 0} facture(s) importée(s)` +
          (json.skipped ? ` · ${json.skipped} ignorée(s)` : ''),
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onImported();
      window.setTimeout(() => onClose(), 450);
    };

    xhr.open('POST', '/api/factures-suivi/import');
    xhr.send(form);
  };

  return (
    <div className="modal-overlay open" onClick={busy ? undefined : onClose}>
      <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
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
            Une valeur dans <strong>PYTMT</strong> (ex. PAID) marque la facture comme payée ;
            vide = unpaid.
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
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={busy}
          >
            Annuler
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
