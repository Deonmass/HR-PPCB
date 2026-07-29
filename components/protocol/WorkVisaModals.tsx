'use client';

import { useEffect, useState } from 'react';
import type { WorkVisaDocKind, WorkVisaDocumentInput, WorkVisaDossierView } from '@/lib/work-visa-types';
import { WORK_VISA_DOC_LABELS } from '@/lib/work-visa-types';
import { formatDateFr } from '@/lib/work-visa-validity';

interface RenewProps {
  open: boolean;
  dossier: WorkVisaDossierView | null;
  kind: WorkVisaDocKind | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (kind: WorkVisaDocKind, document: WorkVisaDocumentInput) => Promise<void>;
}

export function WorkVisaRenewModal({ open, dossier, kind, saving, onClose, onSubmit }: RenewProps) {
  const [number, setNumber] = useState('');
  const [type, setType] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !dossier || !kind) return;
    setError(null);
    const current =
      kind === 'passport'
        ? dossier.passport.current
        : kind === 'workVisa'
          ? dossier.workVisa.current
          : kind === 'workCard'
            ? dossier.workCard.current
            : dossier.vsr.current;
    setNumber(current?.number || '');
    setType(current?.type || '');
    setIssueDate('');
    setStartDate('');
    setExpiryDate('');
  }, [open, dossier, kind]);

  if (!open || !dossier || !kind) return null;

  const handleSubmit = async () => {
    setError(null);
    if (!expiryDate) {
      setError('Date d’expiration requise');
      return;
    }
    try {
      await onSubmit(kind, {
        number: number.trim() || '—',
        type: type.trim() || undefined,
        issueDate: issueDate || undefined,
        startDate: startDate || undefined,
        expiryDate,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <div className="modal-overlay open" role="presentation" onClick={onClose}>
      <div className="modal modal-form" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            Renouveler — {WORK_VISA_DOC_LABELS[kind]}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-muted">
            {dossier.displayName} ({dossier.matricule}). L’ancien document sera archivé dans l’historique.
          </p>
          {error ? <div className="alert alert-danger">{error}</div> : null}
          <div className="form-grid">
            <div className="form-group">
              <label>Numéro</label>
              <input value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            {kind === 'passport' ? (
              <div className="form-group">
                <label>Type</label>
                <input value={type} onChange={(e) => setType(e.target.value)} />
              </div>
            ) : null}
            <div className="form-group">
              <label>Délivrance</label>
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </div>
            {kind === 'workVisa' ? (
              <div className="form-group">
                <label>Début</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
            ) : null}
            <div className="form-group">
              <label>Expiration *</label>
              <input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} required />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={() => void handleSubmit()} disabled={saving}>
            {saving ? 'Renouvellement…' : 'Renouveler'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface HistoryProps {
  open: boolean;
  dossier: WorkVisaDossierView | null;
  onClose: () => void;
}

export function WorkVisaHistoryModal({ open, dossier, onClose }: HistoryProps) {
  if (!open || !dossier) return null;

  const sections: { kind: WorkVisaDocKind; slot: WorkVisaDossierView['passport'] }[] = [
    { kind: 'passport', slot: dossier.passport },
    { kind: 'workVisa', slot: dossier.workVisa },
    { kind: 'workCard', slot: dossier.workCard },
    { kind: 'vsr', slot: dossier.vsr },
  ];

  return (
    <div className="modal-overlay open" role="presentation" onClick={onClose}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Historique — {dossier.displayName}</h3>
          <button type="button" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {sections.map(({ kind, slot }) => (
            <div key={kind} className="work-visa-history-block">
              <h4>{WORK_VISA_DOC_LABELS[kind]}</h4>
              {slot.current ? (
                <p>
                  <strong>Actuel :</strong>
                  {' '}
                  {slot.current.number}
                  {' · '}
                  {formatDateFr(slot.current.startDate || slot.current.issueDate)}
                  {' → '}
                  {formatDateFr(slot.current.expiryDate)}
                </p>
              ) : (
                <p className="text-muted">Aucun document actuel</p>
              )}
              {slot.history.length === 0 ? (
                <p className="text-muted">Pas d’historique</p>
              ) : (
                <ul className="work-visa-history-list">
                  {slot.history.map((item, index) => (
                    <li key={item.id}>
                      <strong>
                        {WORK_VISA_DOC_LABELS[kind]}
                        {' '}
                        {slot.history.length - index}
                      </strong>
                      {' · '}
                      {item.number}
                      {' · '}
                      {formatDateFr(item.startDate || item.issueDate)}
                      {' → '}
                      {formatDateFr(item.expiryDate)}
                      {item.archivedAt ? (
                        <span className="text-muted">
                          {' '}
                          (archivé
                          {' '}
                          {formatDateFr(item.archivedAt.slice(0, 10))}
                          )
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
