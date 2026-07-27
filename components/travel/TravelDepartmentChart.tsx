'use client';

import { useState } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { TravelHistoryDepartmentStat } from '@/lib/travel-history-types';

interface Props {
  departments: TravelHistoryDepartmentStat[];
}

function formatUsd(value: number): string {
  return value.toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function buildBarTooltip(item: TravelHistoryDepartmentStat): string {
  const trips = `${item.count} voyage${item.count > 1 ? 's' : ''}`;
  return `${trips} · Budget : ${formatUsd(item.budget)}`;
}

export default function TravelDepartmentChart({ departments }: Props) {
  const [hover, setHover] = useState<string | null>(null);

  if (!departments.length) {
    return (
      <div className="panel travel-history-chart-panel">
        <div className="panel-head">
          <h3>Voyages par département</h3>
        </div>
        <p className="empty-state">Aucune donnée disponible pour le moment.</p>
      </div>
    );
  }

  const maxCount = Math.max(...departments.map((item) => item.count), 1);
  const gridTicks = [0, 25, 50, 75, 100];

  const legend = (
    <div className="travel-history-chart-legend">
      <span className="travel-history-legend-item">
        <span className="travel-history-legend-swatch travel-history-legend-count" />
        Effectifs
      </span>
    </div>
  );

  return (
    <EnlargeableChartPanel
      title="Voyages par département"
      className="travel-history-chart-panel"
      headExtra={legend}
      clickToEnlarge
    >
      <div className="travel-history-chart-area">
        <div className="travel-monthly-chart-layout travel-history-dept-chart-layout">
          <div className="chart-y-axis travel-monthly-chart-y-axis travel-history-dept-y-axis">
            {[...gridTicks].reverse().map((tick) => (
              <span key={tick} className="chart-y-label">
                {tick === 0 ? '0' : Math.round((maxCount * tick) / 100)}
              </span>
            ))}
          </div>
          <div className="travel-history-plot-wrap">
            <div className="travel-history-plot-body travel-history-dept-plot-body">
              <ChartHorizontalGrid ticks={gridTicks} />
              <div
                className={`travel-history-chart-cols travel-history-chart-cols-bars dash-chart-bars${hover ? ' has-hover' : ''}`}
                style={{ gridTemplateColumns: `repeat(${departments.length}, minmax(56px, 1fr))` }}
              >
                {departments.map((item, index) => {
                  const countHeight = (item.count / maxCount) * 100;
                  const isActive = hover === item.department;
                  return (
                    <div
                      key={item.department}
                      className={`travel-history-chart-col dash-bar-col${isActive ? ' is-active' : ''}${hover && !isActive ? ' is-dimmed' : ''}`}
                      style={{ animationDelay: `${index * 45}ms` }}
                      onMouseEnter={() => setHover(item.department)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div
                        className={`travel-history-bar-wrap dash-bar-wrap${isActive ? ' is-active' : ''}`}
                        title={buildBarTooltip(item)}
                      >
                        <span
                          className={`travel-history-bar-value travel-history-bar-value-count dash-bar-value${isActive ? ' is-active' : ''}`}
                          style={{ bottom: `calc(${Math.max(countHeight, 4)}% + 3px)` }}
                        >
                          {item.count}
                        </span>
                        <div
                          className={`travel-history-bar travel-history-bar-count dash-bar-fill${isActive ? ' is-active' : ''}`}
                          style={{ height: `${Math.max(countHeight, item.count > 0 ? 4 : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              className="travel-history-chart-cols travel-history-chart-cols-labels"
              style={{ gridTemplateColumns: `repeat(${departments.length}, minmax(56px, 1fr))` }}
            >
              {departments.map((item) => (
                <span
                  key={`${item.department}-label`}
                  className={`travel-history-chart-label${hover === item.department ? ' is-active' : ''}`}
                  title={item.department}
                >
                  {item.department}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </EnlargeableChartPanel>
  );
}
