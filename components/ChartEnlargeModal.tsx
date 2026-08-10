'use client';

import type { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  /** Actions à gauche du bouton fermer (export, onglets…). */
  headerActions?: ReactNode;
  /** Classe additionnelle sur le modal (ex. largeur spécifique). */
  className?: string;
}

/** Modal plein écran pour afficher un graphique agrandi. */
export default function ChartEnlargeModal({
  title,
  subtitle,
  onClose,
  children,
  headerActions,
  className = '',
}: Props) {
  return (
    <div
      className="modal-overlay open chart-enlarge-overlay"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`modal chart-enlarge-modal${className ? ` ${className}` : ''}`}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal
        aria-label={title}
      >
        <div className="modal-header chart-enlarge-header">
          <div className="chart-enlarge-header-text">
            <h3>{title}</h3>
            {subtitle ? <p className="chart-enlarge-subtitle">{subtitle}</p> : null}
          </div>
          <div className="chart-enlarge-header-actions">
            {headerActions}
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </div>
        <div className="chart-enlarge-body">{children}</div>
      </div>
    </div>
  );
}

interface EnlargeButtonProps {
  onClick: () => void;
}

export function ChartEnlargeButton({ onClick }: EnlargeButtonProps) {
  return (
    <button
      type="button"
      className="chart-enlarge-btn"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      title="Agrandir le graphique"
      aria-label="Agrandir le graphique"
    >
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
