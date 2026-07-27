'use client';

import { useMemo, useState } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import { EXPENSE_MONTH_LABELS, formatUsd } from '@/lib/projects';

interface Props {
  months: number[];
  year: string;
}

const CHART_W = 1200;
const CHART_H = 180;
const PLOT_H = 132;
const PLOT_BOTTOM = 152;
const COL_W = CHART_W / 12;
const GRID_TICKS = [0, 25, 50, 75, 100];

export default function ExpensesMonthlyChart({ months, year }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...months, 1);
  const total = months.reduce((sum, value) => sum + value, 0);

  const linePoints = useMemo(
    () =>
      months.map((value, index) => {
        const x = index * COL_W + COL_W / 2;
        const y = PLOT_BOTTOM - (max > 0 ? (value / max) * PLOT_H : 0);
        return { x, y, value };
      }),
    [months, max],
  );

  const polyline = linePoints.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <div className="panel expenses-chart-panel">
      <div className="panel-head expenses-chart-head">
        <h3>Dépenses par mois</h3>
        <span className="expenses-chart-total">{formatUsd(total)} · {year}</span>
      </div>
      <div className="expenses-chart-area">
        <div className="expenses-chart-layout">
          <div className="chart-y-axis expenses-chart-y-axis">
            {[...GRID_TICKS].reverse().map((tick) => (
              <span key={tick} className="chart-y-label">
                {tick === 0 ? '0' : formatUsd((max * tick) / 100, 0)}
              </span>
            ))}
          </div>
          <div className="expenses-chart-plot">
            <div className="expenses-chart-plot-grid">
              <ChartHorizontalGrid ticks={GRID_TICKS} />
            </div>
            <div className="expenses-chart-combo">
              <svg
                className="expenses-chart-line-svg"
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                <polyline
                  className="expenses-chart-line-path"
                  points={polyline}
                  fill="none"
                />
                {linePoints.map((point, index) => {
                  const isActive = hover === index;
                  return (
                    <circle
                      key={EXPENSE_MONTH_LABELS[index]}
                      className={`expenses-chart-line-dot${isActive ? ' is-active' : ''}${hover != null && !isActive ? ' is-dimmed' : ''}`}
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 7 : 5}
                    />
                  );
                })}
              </svg>

              <div className={`expenses-chart-bars dash-chart-bars${hover != null ? ' has-hover' : ''}`}>
                {months.map((value, index) => {
                  const height = max > 0 ? (value / max) * 100 : 0;
                  const isActive = hover === index;
                  return (
                    <div
                      key={EXPENSE_MONTH_LABELS[index]}
                      className={`expenses-chart-col dash-bar-col${isActive ? ' is-active' : ''}${hover != null && !isActive ? ' is-dimmed' : ''}`}
                      style={{ animationDelay: `${index * 35}ms` }}
                      onMouseEnter={() => setHover(index)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <span className={`expenses-chart-value dash-bar-value${isActive ? ' is-active' : ''}`}>
                        {formatUsd(value, 0)}
                      </span>
                      <div className={`expenses-chart-bar-wrap dash-bar-wrap${isActive ? ' is-active' : ''}`}>
                        <div
                          className={`expenses-chart-bar dash-bar-fill${isActive ? ' is-active' : ''}`}
                          style={{ height: `${Math.max(height, value > 0 ? 4 : 0)}%` }}
                          title={`${EXPENSE_MONTH_LABELS[index]}: ${formatUsd(value)}`}
                        />
                      </div>
                      <span className={`expenses-chart-month${isActive ? ' is-active' : ''}`}>
                        {EXPENSE_MONTH_LABELS[index]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
