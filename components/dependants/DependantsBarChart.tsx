'use client';

import { useState, type ReactNode } from 'react';
import EnlargeableChartPanel, { type ChartDeptFilterSource } from '@/components/EnlargeableChartPanel';
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
  /** Active le filtre départements dans la vue agrandie. */
  deptFilter?: ChartDeptFilterSource;
}

export function DependantsBarChartBody({
  items,
  valueSuffix = '',
  barClassName = 'dependants-bar-fill',
  fitAll = false,
  compact = false,
  formatValue,
  formatCount = (n) => `(${n})`,
  onItemClick,
}: Omit<Props, 'title' | 'deptFilter'>): ReactNode {
  const [hover, setHover] = useState<string | null>(null);
  const fmt = formatValue ?? ((v: number) => `${v}${valueSuffix}`);

  if (!items.length) {
    return <p className="empty-state">Aucune donnée disponible.</p>;
  }

  const barLabel = (item: BarChartItem) => {
    const base = fmt(item.value);
    if (item.count == null) return base;
    return `${base} ${formatCount(item.count)}`;
  };

  const maxValue = Math.max(...items.map((item) => item.value), 1);
  /** Réserve le haut du plot pour coller les valeurs au sommet des barres (sans débordement). */
  const HEADROOM_PCT = 14;
  const plotScale = (100 - HEADROOM_PCT) / 100;
  const dataTicks = [0, 25, 50, 75, 100];
  const gridTicks = dataTicks.map((tick) => tick * plotScale);
  const colMin = fitAll ? '0' : '56px';

  return (
    <div className={`travel-history-chart-area${compact ? ' is-compact' : ''}${fitAll ? ' is-fit-all' : ''}`}>
      <div className="travel-history-dept-chart-layout">
        <div className="travel-history-dept-plot-row">
          <div className="chart-y-axis travel-history-dept-y-axis is-pinned">
            {dataTicks.map((tick, index) => (
              <span
                key={tick}
                className={`chart-y-label${tick === 0 ? ' is-zero' : ''}${tick === 100 ? ' is-max' : ''}`}
                style={{ bottom: `${gridTicks[index]}%` }}
              >
                {tick === 0 ? fmt(0) : fmt(Math.round((maxValue * tick) / 100))}
              </span>
            ))}
          </div>
          <div className="travel-history-plot-body travel-history-dept-plot-body">
            <ChartHorizontalGrid ticks={gridTicks} />
            <div
              className={`travel-history-chart-cols travel-history-chart-cols-bars dash-chart-bars${hover ? ' has-hover' : ''}`}
              style={{ gridTemplateColumns: `repeat(${items.length}, minmax(${colMin}, 1fr))` }}
            >
              {items.map((item, index) => {
                const barHeightPct = item.value > 0
                  ? Math.max((item.value / maxValue) * 100 * plotScale, 3)
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
                      style={{ ['--bar-h' as string]: `${barHeightPct}%` }}
                    >
                      <span
                        className={`travel-history-bar-value travel-history-bar-value-count dash-bar-value${isActive ? ' is-active' : ''}`}
                      >
                        {label}
                      </span>
                      <div
                        className={`travel-history-bar dash-bar-fill ${barClassName}${isActive ? ' is-active' : ''}`}
                        style={{ height: `${barHeightPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="travel-history-dept-label-row">
          <div className="travel-history-dept-y-spacer" aria-hidden />
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
  deptFilter,
}: Props) {
  return (
    <EnlargeableChartPanel
      title={title}
      className={`travel-history-chart-panel employees-bar-panel${compact ? ' is-compact' : ''}${fitAll ? ' is-fit-all' : ''}`}
      clickToEnlarge={!onItemClick}
      deptFilter={deptFilter}
    >
      <DependantsBarChartBody
        items={items}
        valueSuffix={valueSuffix}
        barClassName={barClassName}
        fitAll={fitAll}
        compact={compact}
        formatValue={formatValue}
        formatCount={formatCount}
        onItemClick={onItemClick}
      />
    </EnlargeableChartPanel>
  );
}
