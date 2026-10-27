'use client';

import { useEffect, useState } from 'react';

type Props = {
  count: number;
  departments: string[];
  onClose: () => void;
  onSave: (departement: string) => Promise<void>;
};

export default function OrganigrammeDepartmentDialog({
  count,
  departments,
  onClose,
  onSave,
}: Props) {
  const [departement, setDepartement] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const save = async () => {
    if (!departement || saving) return;
    setSaving(true);
    try {
      await onSave(departement);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="org-dialog-backdrop" onClick={() => { if (!saving) onClose(); }}>
      <div
        className="org-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="org-dept-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="org-dept-title">Changer le département</h3>
        <p className="org-dialog-who">
          {count === 1 ? '1 agent' : `${count} agents`}
        </p>
        <p className="org-dialog-hint">
          Le département choisi s’applique à tous les agents des cartes sélectionnées.
        </p>
        <label className="org-filter">
          <span>Département</span>
          <select
            autoFocus
            value={departement}
            onChange={(event) => setDepartement(event.target.value)}
          >
            <option value="">Choisir…</option>
            {departments.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </label>
        {saving ? (
          <p className="org-dialog-saving" role="status">
            <span className="btn-spinner" aria-hidden="true" />
            Enregistrement du département…
          </p>
        ) : null}
        <div className="org-dialog-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose} disabled={saving}>
            Annuler
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void save()}
            disabled={saving || !departement}
          >
            {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
