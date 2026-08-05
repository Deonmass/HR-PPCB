'use client';

import { useMemo, useState, type FormEvent } from 'react';
import type { CharroiDocKind, CharroiDocPaiement, CharroiVehicule } from '@/lib/charroi-types';
import {
  CHARROI_DOC_LABELS,
  CHARROI_EXPIRY_SOON_DAYS,
  charroiDaysRemaining,
  charroiExpiryStatus,
  formatCharroiDate,
  formatCharroiRemaining,
  getVehiculeDocHistorique,
} from '@/lib/charroi-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

interface Props {
  vehicle: CharroiVehicule;
  kind: CharroiDocKind;
  canEdit: boolean;
  onClose: () => void;
  onSaved: (vehicle: CharroiVehicule) => void;
}

type TabId = 'historique' | 'paiement';

export default function CharroiDocHistoryModal({
  vehicle,
  kind,
  canEdit,
  onClose,
  onSaved,
}: Props) {
  const label = CHARROI_DOC_LABELS[kind];
  const historique = useMemo(
    () => getVehiculeDocHistorique(vehicle, kind),
    [vehicle, kind],
  );

  const [tab, setTab] = useState<TabId>('historique');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');
  const [preuveUrl, setPreuveUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setEditingId(null);
    setDateDebut('');
    setDateFin('');
    setPreuveUrl('');
  };

  const openNew = () => {
    resetForm();
    setTab('paiement');
  };

  const openEdit = (entry: CharroiDocPaiement) => {
    setEditingId(entry.id);
    setDateDebut(entry.dateDebut || '');
    setDateFin(entry.dateFin || '');
    setPreuveUrl(entry.preuveUrl || '');
    setTab('paiement');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    if (!dateFin.trim()) {
      await showError('La date de fin est requise');
      return;
    }
    if (dateDebut && dateFin && dateFin < dateDebut) {
      await showError('La date de fin doit être postérieure ou égale à la date de début');
      return;
    }

    setSaving(true);
    try {
      const isEdit = Boolean(editingId);
      const res = await fetch(`/api/charroi/vehicules/${encodeURIComponent(vehicle.id)}/docs`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          entryId: editingId || undefined,
          dateDebut: dateDebut.trim(),
          dateFin: dateFin.trim(),
          preuveUrl: preuveUrl.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess(isEdit ? `${label} mise à jour` : `${label} enregistrée`);
      resetForm();
      setTab('historique');
      onSaved(json as CharroiVehicule);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entry: CharroiDocPaiement) => {
    if (!canEdit) return;
    const range = `${entry.dateDebut ? formatCharroiDate(entry.dateDebut) : '—'} → ${formatCharroiDate(entry.dateFin)}`;
    if (!(await confirmDelete(`Supprimer cette période ${label.toLowerCase()} ?`, range))) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/charroi/vehicules/${encodeURIComponent(vehicle.id)}/docs`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, entryId: entry.id }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Période supprimée');
      if (editingId === entry.id) resetForm();
      onSaved(json as CharroiVehicule);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div
        className="modal modal-lg charroi-doc-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="charroi-doc-modal-title"
      >
        <div className="modal-header">
          <h3 id="charroi-doc-modal-title">
            {label} — {vehicle.plaque || vehicle.marque || vehicle.id}
          </h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </div>

        <div className="modal-body charroi-doc-modal-body">
          <div className="charroi-doc-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'historique'}
              className={`charroi-doc-tab${tab === 'historique' ? ' active' : ''}`}
              onClick={() => setTab('historique')}
            >
              Historique
              <span className="charroi-doc-hist-count">{historique.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'paiement'}
              className={`charroi-doc-tab${tab === 'paiement' ? ' active' : ''}`}
              onClick={() => {
                if (!editingId && tab !== 'paiement') resetForm();
                setTab('paiement');
              }}
            >
              {editingId ? 'Modifier' : 'Nouveau paiement'}
            </button>
          </div>

          {tab === 'historique' && (
            <section className="charroi-doc-hist-col" role="tabpanel">
              <div className="charroi-doc-hist-toolbar">
                <p className="charroi-doc-hint text-muted" style={{ margin: 0 }}>
                  Alerte rouge ≤ {CHARROI_EXPIRY_SOON_DAYS} jours avant la date de fin.
                </p>
                {canEdit && (
                  <button type="button" className="btn btn-accent btn-sm" onClick={openNew}>
                    + Nouveau
                  </button>
                )}
              </div>
              <div className="charroi-doc-hist-list">
                {historique.length === 0 ? (
                  <div className="text-muted charroi-doc-hist-empty">
                    Aucun paiement enregistré.
                  </div>
                ) : (
                  historique.map((entry) => {
                    const status = charroiExpiryStatus(entry.dateFin);
                    const days = charroiDaysRemaining(entry.dateFin);
                    const isAlert = status === 'soon' || status === 'expired';
                    return (
                      <article
                        key={entry.id}
                        className={`charroi-doc-card${isAlert ? ' is-alert' : ''}${status === 'expired' ? ' is-expired' : ''}`}
                      >
                        <div className="charroi-doc-card-dates">
                          <span className="charroi-doc-card-range">
                            {entry.dateDebut
                              ? formatCharroiDate(entry.dateDebut)
                              : '—'}
                            {' → '}
                            {formatCharroiDate(entry.dateFin)}
                          </span>
                          <span className={`charroi-doc-card-remain is-${status}`}>
                            {formatCharroiRemaining(days)}
                          </span>
                          {entry.preuveUrl ? (
                            <a
                              href={entry.preuveUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="charroi-doc-card-proof"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Voir la preuve
                            </a>
                          ) : (
                            <span className="charroi-doc-card-proof is-none">Sans preuve</span>
                          )}
                        </div>
                        {canEdit && (
                          <div className="charroi-doc-card-actions">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => openEdit(entry)}
                              disabled={saving}
                            >
                              Modifier
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm charroi-doc-btn-danger"
                              onClick={() => void handleDelete(entry)}
                              disabled={saving}
                            >
                              Supprimer
                            </button>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          )}

          {tab === 'paiement' && (
            <section className="charroi-doc-form-col" role="tabpanel">
              <h4 className="charroi-doc-col-title">
                {editingId ? 'Modifier la période' : 'Nouveau paiement'}
              </h4>
              {canEdit ? (
                <form className="charroi-doc-form" onSubmit={(e) => void handleSubmit(e)}>
                  <div className="form-group">
                    <label htmlFor="charroi-doc-debut">Date début</label>
                    <input
                      id="charroi-doc-debut"
                      type="date"
                      value={dateDebut}
                      onChange={(e) => setDateDebut(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="charroi-doc-fin">Date fin</label>
                    <input
                      id="charroi-doc-fin"
                      type="date"
                      value={dateFin}
                      onChange={(e) => setDateFin(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="charroi-doc-preuve">URL preuve</label>
                    <input
                      id="charroi-doc-preuve"
                      type="url"
                      inputMode="url"
                      placeholder="https://…"
                      value={preuveUrl}
                      onChange={(e) => setPreuveUrl(e.target.value)}
                    />
                  </div>
                  <div className="charroi-doc-form-actions">
                    {editingId && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          resetForm();
                          setTab('historique');
                        }}
                        disabled={saving}
                      >
                        Annuler
                      </button>
                    )}
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving
                        ? 'Enregistrement…'
                        : editingId
                          ? 'Enregistrer'
                          : 'Ajouter la période'}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-muted charroi-doc-readonly">
                  Consultation seule — droits d&apos;édition requis.
                </p>
              )}
            </section>
          )}
        </div>

        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
