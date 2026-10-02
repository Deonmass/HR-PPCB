'use client';

import { useState, type ReactNode } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';

export interface VoyageMonthRow {
  key: string;
  label: string;
  demande: number;
  pending: number;
  effectue: number;
  annule: number;
  total: number;
}

const SERIES = [
  { key: 'demande' as const, label: 'Demandes', color: '#f59e0b' },
  { key: 'pending' as const, label: 'Pending', color: '#0ea5e9' },
  { key: 'effectue' as const, label: 'Effectués', color: '#22c55e' },
  { key: 'annule' as const, label: 'Annulés', color: '#f43f5e' },
];

export function VoyageMonthlyChartBody({
  rows,
  selectedKey = null,
  onItemClick,
}: {
  rows: VoyageMonthRow[];
  selectedKey?: string | null;
  onItemClick?: (key: string) => void;
}): ReactNode {
  const [hover, setHover] = useState<string | null>(null);
  const maxValue = Math.max(...rows.map((row) => row.total), 1);
  const headroom = 14;
  const plotScale = (100 - headroom) / 100;
  const dataTicks = [0, 25, 50, 75, 100];
  const gridTicks = dataTicks.map((tick) => tick * plotScale);

  return (
    <div className="travel-history-chart-area">
      <div className="travel-history-dept-chart-layout">
        <div className="travel-history-dept-plot-row">
          <div className="chart-y-axis travel-history-dept-y-axis is-pinned">
            {dataTicks.map((tick, index) => (
              <span
                key={tick}
                className={`chart-y-label${tick === 0 ? ' is-zero' : ''}${tick === 100 ? ' is-max' : ''}`}
                style={{ bottom: `${gridTicks[index]}%` }}
              >
                {tick === 0 ? '0' : Math.round((maxValue * tick) / 100)}
              </span>
            ))}
          </div>
          <div className="travel-history-plot-body travel-history-dept-plot-body employees-exit-plot-body charroi-voyage-year-plot">
            <ChartHorizontalGrid ticks={gridTicks} />
            <div
              className={`travel-history-chart-cols travel-history-chart-cols-bars dash-chart-bars${hover ? ' has-hover' : ''}`}
              style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
            >
              {rows.map((row, index) => {
                const isActive = hover === row.key;
                const isSelected = Boolean(selectedKey && row.key === selectedKey);
                const barHeightPct = row.total > 0
                  ? Math.max((row.total / maxValue) * 100 * plotScale, 3)
                  : 0;
                return (
                  <div
                    key={row.key}
                    role="button"
                    tabIndex={0}
                    className={`travel-history-chart-col dash-bar-col employees-exit-month-col is-clickable${isSelected ? ' is-selected' : ''}${isActive ? ' is-active' : ''}${hover && !isActive ? ' is-dimmed' : ''}`}
                    style={{ animationDelay: `${index * 40}ms` }}
                    title={`Voir la liste — ${row.label}`}
                    onMouseEnter={() => setHover(row.key)}
                    onMouseLeave={() => setHover(null)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onItemClick?.(row.key);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onItemClick?.(row.key);
                      }
                    }}
                  >
                    <div className="employees-exit-stack-wrap" style={{ ['--bar-h' as string]: `${barHeightPct}%` }}>
                      {row.total > 0 ? (
                        <span className="travel-history-bar-value dash-bar-value">{row.total}</span>
                      ) : null}
                      <div
                        className="employees-exit-stack"
                        style={{ height: `${barHeightPct}%`, minHeight: row.total > 0 ? undefined : 0 }}
                      >
                        {SERIES.map((series) => {
                          const value = row[series.key];
                          if (!value || !row.total) return null;
                          return (
                            <div
                              key={series.key}
                              className="employees-exit-stack-seg"
                              style={{
                                height: `${Math.max((value / row.total) * 100, 2)}%`,
                                background: series.color,
                              }}
                              title={`${series.label}: ${value}`}
                            />
                          );
                        })}
                      </div>
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
            style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
          >
            {rows.map((row) => (
              <span
                key={`${row.key}-label`}
                className={`travel-history-chart-label${hover === row.key ? ' is-active' : ''}${selectedKey === row.key ? ' is-selected' : ''}`}
              >
                {row.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VoyageMonthlyChart({
  title,
  rows,
  selectedKey,
  onItemClick,
}: {
  title: string;
  rows: VoyageMonthRow[];
  selectedKey?: string | null;
  onItemClick?: (key: string) => void;
}) {
  const legend = (
    <ul className="employees-exit-legend">
      {SERIES.map((series) => (
        <li key={series.key}>
          <span className="employees-exit-swatch" style={{ background: series.color }} />
          {series.label}
        </li>
      ))}
      <li>
        <span className="employees-exit-swatch is-selected-month" />
        Mois sélectionné
      </li>
    </ul>
  );

  return (
    <EnlargeableChartPanel
      title={title}
      className="travel-history-chart-panel employees-exit-monthly-panel charroi-voyage-year-chart"
      headExtra={legend}
      clickToEnlarge={!onItemClick}
    >
      <VoyageMonthlyChartBody rows={rows} selectedKey={selectedKey} onItemClick={onItemClick} />
    </EnlargeableChartPanel>
  );
}
