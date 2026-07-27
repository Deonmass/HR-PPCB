'use client';

import { useRef, useState } from 'react';
import { showError, showSuccess } from '@/lib/swal';

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function FacturesSuiviImportModal({ open, onClose, onImported }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  if (!open) return null;

  const handleUpload = async () => {
    if (!file) {
      await showError('Sélectionnez un fichier Excel');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/factures-suivi/import', { method: 'POST', body: form });
      const json = (await res.json()) as {
        error?: string;
        imported?: number;
        skipped?: number;
        totalRows?: number;
      };
      if (!res.ok) {
        await showError(json.error || 'Import impossible');
        return;
      }
      await showSuccess(
        `${json.imported ?? 0} facture(s) importée(s)` +
          (json.skipped ? ` · ${json.skipped} ignorée(s)` : ''),
      );
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
      onImported();
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Import impossible');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Importer des factures (Excel)</h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="factures-suivi-assign-hint">
            Colonnes attendues : DATE, SOCIETE, FACTURE, MONTANT, Echeance, PR, DATE PR, P.O,
            DATE PO, GRN, DATE GRN, Statut.
            <br />
            Les PR / PO / GRN sont alimentés ; le statut principal devient{' '}
            <strong>Posted and unpaid</strong> dès qu’un GRN est présent. La colonne Statut du
            fichier est conservée en commentaire (sous-titre).
          </p>
          <div className="form-group">
            <label>Fichier Excel</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          {file ? (
            <p className="factures-suivi-toolbar-meta">Fichier : {file.name}</p>
          ) : null}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={uploading || !file}
            onClick={() => void handleUpload()}
          >
            {uploading ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {uploading ? 'Import…' : 'Importer'}
          </button>
        </div>
      </div>
    </div>
  );
}
