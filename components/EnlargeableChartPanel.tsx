'use client';

import { useState, type ReactNode } from 'react';
import ChartEnlargeModal, { ChartEnlargeButton } from '@/components/ChartEnlargeModal';

interface Props {
  title: string;
  className?: string;
  /** Contenu additionnel dans l’en-tête (légende, filtre…). */
  headExtra?: ReactNode;
  /** Clic sur le panneau entier → agrandir (désactiver si interactions internes). */
  clickToEnlarge?: boolean;
  children: ReactNode;
}

/**
 * Enveloppe un graphique dashboard : bouton + modal plein écran au clic.
 * Le même contenu est réaffiché en grand dans le modal.
 */
export default function EnlargeableChartPanel({
  title,
  className = '',
  headExtra,
  clickToEnlarge = true,
  children,
}: Props) {
  const [enlarged, setEnlarged] = useState(false);
  const open = () => setEnlarged(true);

  return (
    <>
      <div
        className={`panel ${className}${clickToEnlarge ? ' is-chart-enlargeable' : ''}`.trim()}
        onClick={clickToEnlarge ? open : undefined}
        onKeyDown={clickToEnlarge ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            open();
          }
        } : undefined}
        role={clickToEnlarge ? 'button' : undefined}
        tabIndex={clickToEnlarge ? 0 : undefined}
        title={clickToEnlarge ? 'Cliquer pour agrandir' : undefined}
      >
        <div className="panel-head travel-history-chart-head">
          <h3>{title}</h3>
          <div className="chart-panel-head-actions" onClick={(event) => event.stopPropagation()}>
            {headExtra}
            <ChartEnlargeButton onClick={open} />
          </div>
        </div>
        {children}
      </div>

      {enlarged ? (
        <ChartEnlargeModal title={title} onClose={() => setEnlarged(false)}>
          <div className={`panel ${className} is-enlarged`.trim()}>
            {children}
          </div>
        </ChartEnlargeModal>
      ) : null}
    </>
  );
}
