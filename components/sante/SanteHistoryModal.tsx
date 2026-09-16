'use client';

import { formatSanteDateFr, santeDisplayName, santePathologieBadgeStyle } from '@/lib/sante-utils';
import type { SantePersonHistory } from '@/lib/sante-types';

interface Props {
  history: SantePersonHistory | null;
  onClose: () => void;
}

export default function SanteHistoryModal({ history, onClose }: Props) {
  if (!history) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form sante-history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Historique médical</h3>
            <p className="sante-history-sub">{history.label}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">
          <div className="sante-history-meta">
            <span>{history.typeMalade}</span>
            {history.employeeMatricule ? (
              <span>
                Agent {history.employeeNom} · {history.employeeMatricule}
              </span>
            ) : null}
            <span>{history.visits.length} consultation(s)</span>
          </div>
          <ol className="sante-timeline">
            {history.visits.map((visit) => {
              const pathoTone = santePathologieBadgeStyle(visit.pathologie);
              return (
              <li key={visit.id} className="sante-timeline-item">
                <div className="sante-timeline-dot" />
                <div className="sante-timeline-card">
                  <div className="sante-timeline-date">{formatSanteDateFr(visit.date)}</div>
                  <strong>{santeDisplayName(visit)}</strong>
                  <p>
                    <span className="text-muted">Pathologie</span>{' '}
                    {pathoTone ? (
                      <span className="sante-patho-pill" style={pathoTone}>
                        {visit.pathologie}
                      </span>
                    ) : (
                      visit.pathologie || '—'
                    )}
                  </p>
                  <p>
                    <span className="text-muted">Traitement</span> {visit.traitement || '—'}
                  </p>
                  <p>
                    <span className="text-muted">Référence</span> {visit.reference || 'NON'}
                  </p>
                </div>
              </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}
