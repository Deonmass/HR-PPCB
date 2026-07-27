'use client';

import type { ProjectExpense } from '@/lib/project-types';
import { formatUsd } from '@/lib/projects';

interface Props {
  expense: ProjectExpense;
  onClose: () => void;
}

export default function ExpenseDetailModal({ expense, onClose }: Props) {
  const rows = [
    { label: 'N°', value: expense.numero },
    { label: 'Date', value: expense.date },
    { label: 'Projet', value: expense.projet },
    { label: 'Motif', value: expense.motif },
    { label: 'Budget dépensé', value: formatUsd(expense.montant) },
  ];

  return (
    <div className="modal-overlay open" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Détails de la dépense</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="detail-grid">
            {rows.map((row) => (
              <div className="detail-row" key={row.label}>
                <span className="detail-label">{row.label}</span>
                <span className="detail-value">{row.value}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-outline" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}
