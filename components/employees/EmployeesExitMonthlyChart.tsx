'use client';

import { useState } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { EmployeesExitMonthRow } from '@/lib/employees-hr-dashboard';

interface Props {
  title: string;
  rows: EmployeesExitMonthRow[];
}

const SERIES = [
  { key: 'demission' as const, label: 'Demission', color: '#f59e0b' },
  { key: 'licenciement' as const, label: 'Licenciement', color: '#ef4444' },
  { key: 'retraite' as const, label: 'Retraite', color: '#8b5cf6' },
  { key: 'finContrat' as const, label: 'Fin de contrat', color: '#06b6d4' },
];

export default function EmployeesExitMonthlyChart({ title, rows }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  if (!rows.length) {
    return (
      <div className="panel travel-history-chart-panel">
        <div className="panel-head"><h3>{title}</h3></div>
        <p className="empty-state">Aucune sortie enregistrée.</p>
      </div>
    );
  }

  const maxValue = Math.max(...rows.map((r) => r.total), 1);
  const gridTicks = [0, 25, 50, 75, 100];

  const legend = (
    <ul className="employees-exit-legend">
      {SERIES.map((s) => (
        <li key={s.key}>
          <span className="employees-exit-swatch" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );

  return (
    <EnlargeableChartPanel
      title={title}
      className="travel-history-chart-panel employees-exit-monthly-panel"
      headExtra={legend}
      clickToEnlarge={false}
    >
      <div className="travel-history-chart-area">
        <div className="travel-monthly-chart-layout travel-history-dept-chart-layout">
          <div className="chart-y-axis travel-monthly-chart-y-axis travel-history-dept-y-axis">
            {[...gridTicks].reverse().map((tick) => (
              <span key={tick} className="chart-y-label">
                {tick === 0 ? '0' : Math.round((maxValue * tick) / 100)}
              </span>
            ))}
          </div>
          <div className="travel-history-plot-wrap">
            <div className="travel-history-plot-body travel-history-dept-plot-body employees-exit-plot-body">
              <ChartHorizontalGrid ticks={gridTicks} />
              <div
                className={`travel-history-chart-cols travel-history-chart-cols-bars dash-chart-bars${hover ? ' has-hover' : ''}`}
                style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(48px, 1fr))` }}
              >
                {rows.map((row, index) => {
                  const isActive = hover === row.key;
                  const isDimmed = Boolean(hover && !isActive);
                  return (
                    <div
                      key={row.key}
                      className={`travel-history-chart-col dash-bar-col employees-exit-month-col${isActive ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}`}
                      style={{ animationDelay: `${index * 40}ms` }}
                      onMouseEnter={() => setHover(row.key)}
                      onMouseLeave={() => setHover(null)}
                      title={`${row.label}: ${row.total} sortie${row.total > 1 ? 's' : ''}`}
                    >
                      <div className="employees-exit-stack-wrap">
                        <span className="travel-history-bar-value dash-bar-value">
                          {row.total}
                        </span>
                        <div className="employees-exit-stack">
                          {SERIES.map((s) => {
                            const value = row[s.key];
                            if (!value) return null;
                            const height = (value / maxValue) * 100;
                            return (
                              <div
                                key={s.key}
                                className="employees-exit-stack-seg"
                                style={{
                                  height: `${Math.max(height, 2)}%`,
                                  background: s.color,
                                }}
                                title={`${s.label}: ${value}`}
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
            <div
              className="travel-history-chart-cols travel-history-chart-cols-labels"
              style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(48px, 1fr))` }}
            >
              {rows.map((row) => (
                <span
                  key={`${row.key}-label`}
                  className={`travel-history-chart-label${hover === row.key ? ' is-active' : ''}`}
                  title={row.label}
                >
                  {row.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </EnlargeableChartPanel>
  );
}
