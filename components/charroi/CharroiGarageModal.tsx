'use client';

import { useState } from 'react';
import type { CharroiGaragePassage, CharroiVehicule } from '@/lib/charroi-types';
import { formatCharroiDate, garagePassageOuvert } from '@/lib/charroi-types';
import { showError } from '@/lib/swal';

type Mode = 'entree' | 'sortie' | 'historique';

interface Props {
  vehicle: CharroiVehicule;
  mode: Mode;
  onClose: () => void;
  onSaved: (vehicle: CharroiVehicule) => void;
}

function todayIso(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function joursEntre(debut: string, fin: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut)) return null;
  const end = /^\d{4}-\d{2}-\d{2}$/.test(fin) ? fin : todayIso();
  const startMs = new Date(`${debut}T00:00:00`).getTime();
  const endMs = new Date(`${end}T00:00:00`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return null;
  return Math.max(0, Math.round((endMs - startMs) / 86_400_000));
}

export default function CharroiGarageModal({ vehicle, mode, onClose, onSaved }: Props) {
  const ouvert = garagePassageOuvert(vehicle);
  const [dateEntree, setDateEntree] = useState(todayIso());
  const [dateSortie, setDateSortie] = useState(todayIso());
  const [raison, setRaison] = useState('');
  const [saving, setSaving] = useState(false);
  const titleVehicule = vehicle.plaque || vehicle.marque || vehicle.id;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/charroi/vehicules/${encodeURIComponent(vehicle.id)}/garage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mode === 'entree'
            ? { action: 'entree', dateEntree, raison }
            : { action: 'sortie', dateSortie },
        ),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Enregistrement impossible');
        return;
      }
      onSaved(json as CharroiVehicule);
      onClose();
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const historique = [...(vehicle.garageHistorique || [])].reverse();

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-form" onClick={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {mode === 'entree' && `Envoyer au garage — ${titleVehicule}`}
            {mode === 'sortie' && `Remettre en service — ${titleVehicule}`}
            {mode === 'historique' && `Historique garage — ${titleVehicule}`}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {mode === 'entree' && (
            <>
              <div className="form-group">
                <label htmlFor="charroi-garage-entree">Date d’entrée</label>
                <input
                  id="charroi-garage-entree"
                  type="date"
                  value={dateEntree}
                  onChange={(event) => setDateEntree(event.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="charroi-garage-raison">Raison</label>
                <textarea
                  id="charroi-garage-raison"
                  rows={3}
                  value={raison}
                  onChange={(event) => setRaison(event.target.value)}
                  placeholder="Panne, entretien, accident…"
                  required
                />
              </div>
            </>
          )}
          {mode === 'sortie' && ouvert && (
            <>
              <p className="form-hint">
                Entrée le {formatCharroiDate(ouvert.dateEntree)} — {ouvert.raison}
              </p>
              <div className="form-group">
                <label htmlFor="charroi-garage-sortie">Date de remise en service</label>
                <input
                  id="charroi-garage-sortie"
                  type="date"
                  value={dateSortie}
                  min={ouvert.dateEntree}
                  onChange={(event) => setDateSortie(event.target.value)}
                  required
                />
              </div>
            </>
          )}
          {mode === 'historique' && (
            historique.length === 0 ? (
              <p className="empty-state">Aucun passage au garage.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Entrée</th>
                      <th>Sortie</th>
                      <th>Durée</th>
                      <th>Raison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historique.map((passage: CharroiGaragePassage) => {
                      const jours = joursEntre(passage.dateEntree, passage.dateSortie);
                      return (
                        <tr key={passage.id}>
                          <td>{formatCharroiDate(passage.dateEntree)}</td>
                          <td>{passage.dateSortie ? formatCharroiDate(passage.dateSortie) : 'En cours'}</td>
                          <td>{jours == null ? '—' : `${jours} j`}</td>
                          <td>{passage.raison || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
            {mode === 'historique' ? 'Fermer' : 'Annuler'}
          </button>
          {mode !== 'historique' && (
            <button type="button" className="btn btn-primary" onClick={() => void submit()} disabled={saving}>
              {saving && <span className="btn-spinner" aria-hidden="true" />}
              {saving ? 'Enregistrement…' : mode === 'entree' ? 'Envoyer au garage' : 'Remettre en service'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
