'use client';

import { BtnSpinner } from '@/components/overtime/TimesheetIcons';
import { useEffect, useMemo, useState } from 'react';

const DEFAULT_LOCALISATIONS = ['Kinshasa', 'Zamba', 'Lubudi', 'Lubumbashi'];

interface Props {
  matricule: string;
  employeeName: string;
  currentLocalisation: string;
  knownLocalisations: string[];
  onClose: () => void;
  onApply: (localisation: string) => Promise<void>;
}

export default function FamilyLocalisationModal({
  matricule,
  employeeName,
  currentLocalisation,
  knownLocalisations,
  onClose,
  onApply,
}: Props) {
  const options = useMemo(() => {
    const set = new Set(
      [...DEFAULT_LOCALISATIONS, ...knownLocalisations, currentLocalisation]
        .map((value) => value.trim())
        .filter(Boolean),
    );
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [knownLocalisations, currentLocalisation]);

  const [localisation, setLocalisation] = useState(currentLocalisation || options[0] || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocalisation(currentLocalisation || options[0] || '');
  }, [currentLocalisation, options]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = localisation.trim();
    if (!value) return;
    setSaving(true);
    try {
      await onApply(value);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal dependant-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>Localisation de la famille</h3>
          <button type="button" className="modal-close" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className="modal-body">
            <p className="dependants-family-loc-intro">
              Appliquer une localisation à toute la famille de{' '}
              <strong>{employeeName}</strong> ({matricule}).
            </p>
            <div className="form-group">
              <label>Localisation *</label>
              <input
                type="text"
                list="family-localisation-list"
                value={localisation}
                onChange={(event) => setLocalisation(event.target.value)}
                placeholder="Ex. Kinshasa"
                required
                autoFocus
              />
              <datalist id="family-localisation-list">
                {options.map((value) => (
                  <option key={value} value={value} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
              Annuler
            </button>
            <button type="submit" className="btn btn-primary btn-with-icon" disabled={saving || !localisation.trim()}>
              {saving && <BtnSpinner />}
              {saving ? 'Application…' : 'Appliquer à la famille'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
