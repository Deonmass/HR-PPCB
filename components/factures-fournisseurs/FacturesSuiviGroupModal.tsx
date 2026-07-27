'use client';

import type { MouseEvent } from 'react';
import type { FactureGroupNode, FactureSuivi } from '@/lib/factures-fournisseurs/types';
import { formatUsdLike } from '@/lib/factures-fournisseurs/utils';

interface Props {
  group: FactureGroupNode;
  onClose: () => void;
  onContextMenuFacture: (event: MouseEvent, facture: FactureSuivi) => void;
}

export default function FacturesSuiviGroupModal({
  group,
  onClose,
  onContextMenuFacture,
}: Props) {
  const factures = group.factures ?? [];

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal modal-form modal-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            {group.label} {group.ref}
            {group.date ? ` · ${group.date}` : ''}
          </h3>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="factures-suivi-assign-hint">
            {group.count} facture{group.count > 1 ? 's' : ''} · {formatUsdLike(group.montant)} $
            {' · '}Clic droit sur une ligne pour les actions
          </p>
          {factures.length === 0 ? (
            <p className="empty-state">Aucune facture dans ce groupe.</p>
          ) : (
            <div className="factures-suivi-table-wrap factures-suivi-modal-table">
              <table className="factures-suivi-table">
                <thead>
                  <tr>
                    <th className="col-row-num">#</th>
                    <th>Facture</th>
                    <th>Société</th>
                    <th>Montant</th>
                    <th>Date</th>
                    <th>Échéance</th>
                    <th>Statut</th>
                    <th>Commentaire</th>
                  </tr>
                </thead>
                <tbody>
                  {factures.map((f, index) => (
                    <tr
                      key={f.id}
                      className="factures-suivi-row-context"
                      onContextMenu={(event) => onContextMenuFacture(event, f)}
                    >
                      <td className="col-row-num is-num">{index + 1}</td>
                      <td>
                        <strong>{f.facture}</strong>
                      </td>
                      <td>{f.societe}</td>
                      <td className="is-num">
                        {f.montant != null ? formatUsdLike(f.montant) : '—'}
                      </td>
                      <td>{f.date || '—'}</td>
                      <td>{f.echeance || '—'}</td>
                      <td>
                        <span className={`factures-suivi-status status-${f.statut}`}>
                          {f.statutLabel}
                        </span>
                      </td>
                      <td className="factures-suivi-comment">{f.commentaire || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
