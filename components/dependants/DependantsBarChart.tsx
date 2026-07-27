'use client';

import { useState, type ReactNode } from 'react';
import ChartEnlargeModal, { ChartEnlargeButton } from '@/components/ChartEnlargeModal';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import type { DependantChartItem } from '@/lib/dependants-types';

export type BarChartItem = DependantChartItem & {
  /** Affiché à côté de la valeur (ex. nombre de factures). */
  count?: number;
};

interface Props {
  title: string;
  items: BarChartItem[];
  valueSuffix?: string;
  barClassName?: string;
  /** Toutes les barres visibles sans scroll horizontal (colonnes flexibles). */
  fitAll?: boolean;
  /** Hauteur / largeur réduites. */
  compact?: boolean;
  /** Formate les valeurs affichées (barre + axe Y). Défaut : nombre + suffixe. */
  formatValue?: (value: number) => string;
  /** Formate le compteur affiché à côté (ex. "(6)"). Défaut : "(n)". */
  formatCount?: (count: number) => string;
  /** Clic sur une barre → détail de ce segment. */
  onItemClick?: (label: string) => void;
}

export default function DependantsBarChart({
  title,
  items,
  valueSuffix = '',
  barClassName = 'dependants-bar-fill',
  fitAll = false,
  compact = false,
  formatValue,
  formatCount = (n) => `(${n})`,
  onItemClick,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const [enlarged, setEnlarged] = useState(false);
  const fmt = formatValue ?? ((v: number) => `${v}${valueSuffix}`);

  const barLabel = (item: BarChartItem) => {
    const base = fmt(item.value);
    if (item.count == null) return base;
    return `${base} ${formatCount(item.count)}`;
  };

  const renderBody = (opts: { compact?: boolean; fitAll?: boolean }): ReactNode => {
    if (!items.length) {
      return <p className="empty-state">Aucune donnée disponible.</p>;
    }

    const maxValue = Math.max(...items.map((item) => item.value), 1);
    const gridTicks = [0, 25, 50, 75, 100];
    const colMin = opts.fitAll ? '0' : '56px';
    const isCompact = Boolean(opts.compact);

    return (
      <div className={`travel-history-chart-area${isCompact ? ' is-compact' : ''}${opts.fitAll ? ' is-fit-all' : ''}`}>
        <div className="travel-monthly-chart-layout travel-history-dept-chart-layout">
          <div className="chart-y-axis travel-monthly-chart-y-axis travel-history-dept-y-axis">
            {[...gridTicks].reverse().map((tick) => (
              <span key={tick} className="chart-y-label">
                {tick === 0 ? fmt(0) : fmt(Math.round((maxValue * tick) / 100))}
              </span>
            ))}
          </div>
          <div className="travel-history-plot-wrap">
            <div className="travel-history-plot-body travel-history-dept-plot-body">
              <ChartHorizontalGrid ticks={gridTicks} />
              <div
                className={`travel-history-chart-cols travel-history-chart-cols-bars dash-chart-bars${hover ? ' has-hover' : ''}`}
                style={{ gridTemplateColumns: `repeat(${items.length}, minmax(${colMin}, 1fr))` }}
              >
                {items.map((item, index) => {
                  const barHeightPct = item.value > 0
                    ? Math.max((item.value / maxValue) * 88, 4)
                    : 0;
                  const isActive = hover === item.label;
                  const label = barLabel(item);
                  const canDrill = Boolean(onItemClick);
                  return (
                    <div
                      key={item.label}
                      role={canDrill ? 'button' : undefined}
                      tabIndex={canDrill ? 0 : undefined}
                      className={`travel-history-chart-col dash-bar-col${isActive ? ' is-active' : ''}${hover && !isActive ? ' is-dimmed' : ''}${canDrill ? ' is-clickable' : ''}`}
                      style={{ animationDelay: `${index * 45}ms` }}
                      onMouseEnter={() => setHover(item.label)}
                      onMouseLeave={() => setHover(null)}
                      onClick={canDrill ? (event) => {
                        event.stopPropagation();
                        onItemClick?.(item.label);
                      } : undefined}
                      onKeyDown={canDrill ? (event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          onItemClick?.(item.label);
                        }
                      } : undefined}
                      title={canDrill ? `Voir la liste — ${item.label}` : `${item.label}: ${label}`}
                    >
                      <div
                        className={`travel-history-bar-wrap dash-bar-wrap${isActive ? ' is-active' : ''}`}
                        title={`${item.label}: ${label}`}
                      >
                        <span
                          className={`travel-history-bar-value travel-history-bar-value-count dash-bar-value${isActive ? ' is-active' : ''}`}
                          style={{ bottom: `calc(${barHeightPct}% + 4px)` }}
                        >
                          {label}
                        </span>
                        <div
                          className={`travel-history-bar dash-bar-fill ${barClassName}${isActive ? ' is-active' : ''}`}
                          style={{ height: `${barHeightPct}%`, ['--bar-h' as string]: `${barHeightPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              className="travel-history-chart-cols travel-history-chart-cols-labels"
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(${colMin}, 1fr))` }}
            >
              {items.map((item) => (
                <span
                  key={`${item.label}-label`}
                  className={`travel-history-chart-label${hover === item.label ? ' is-active' : ''}`}
                  title={item.label}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const openEnlarge = () => setEnlarged(true);
  const panelClickable = !onItemClick;

  return (
    <>
      <div
        className={`panel travel-history-chart-panel${compact ? ' is-compact' : ''}${fitAll ? ' is-fit-all' : ''}${panelClickable ? ' is-chart-enlargeable' : ''}`}
        onClick={panelClickable ? openEnlarge : undefined}
        role={panelClickable ? 'button' : undefined}
        tabIndex={panelClickable ? 0 : undefined}
        onKeyDown={panelClickable ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openEnlarge();
          }
        } : undefined}
        title={panelClickable ? 'Cliquer pour agrandir' : undefined}
      >
        <div className="panel-head travel-history-chart-head">
          <h3>{title}</h3>
          <ChartEnlargeButton onClick={openEnlarge} />
        </div>
        {renderBody({ compact, fitAll })}
      </div>

      {enlarged && (
        <ChartEnlargeModal title={title} onClose={() => setEnlarged(false)}>
          <div className="panel travel-history-chart-panel is-enlarged is-fit-all">
            {renderBody({ compact: false, fitAll: true })}
          </div>
        </ChartEnlargeModal>
      )}
    </>
  );
}
