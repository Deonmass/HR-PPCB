'use client';

import { useState } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { DependantFamilleRepartition } from '@/lib/dependants-types';

interface Props {
  data: DependantFamilleRepartition;
}

export default function DependantsFamilleChart({ data }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const bars = data.bars;
  const maxValue = Math.max(
    ...bars.map((bar) => bar.segments.reduce((sum, segment) => sum + segment.value, 0)),
    1,
  );
  const gridTicks = [0, 25, 50, 75, 100];

  if (!bars.length) {
    return (
      <div className="panel travel-history-chart-panel">
        <div className="panel-head">
          <h3>Répartition famille</h3>
        </div>
        <p className="empty-state">Aucune donnée disponible.</p>
      </div>
    );
  }

  const legend = (
    <div className="travel-history-chart-legend dependants-famille-legend">
      <span className="travel-history-legend-item">
        <span className="travel-history-legend-swatch dependants-seg-under" />
        ≤ 17 ans
      </span>
      <span className="travel-history-legend-item">
        <span className="travel-history-legend-swatch dependants-seg-over" />
        &gt; 17 ans
      </span>
      <span className="travel-history-legend-item">
        <span className="travel-history-legend-swatch dependants-seg-parent-m" />
        Parents H
      </span>
      <span className="travel-history-legend-item">
        <span className="travel-history-legend-swatch dependants-seg-parent-f" />
        Parents F
      </span>
    </div>
  );

  return (
    <EnlargeableChartPanel
      title="Répartition famille"
      className="travel-history-chart-panel dependants-famille-chart"
      headExtra={legend}
      clickToEnlarge
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
            <div className="travel-history-plot-body travel-history-dept-plot-body">
              <ChartHorizontalGrid ticks={gridTicks} />
              <div
                className={`travel-history-chart-cols travel-history-chart-cols-bars dash-chart-bars${hover ? ' has-hover' : ''}`}
                style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(72px, 1fr))` }}
              >
                {bars.map((bar, index) => {
                  const total = bar.segments.reduce((sum, segment) => sum + segment.value, 0);
                  const height = (total / maxValue) * 100;
                  const tooltip = bar.segments
                    .filter((segment) => segment.value > 0)
                    .map((segment) => `${segment.label}: ${segment.value}`)
                    .join(' · ');
                  const isActive = hover === bar.label;

                  return (
                    <div
                      key={bar.label}
                      className={`travel-history-chart-col dash-bar-col${isActive ? ' is-active' : ''}${hover && !isActive ? ' is-dimmed' : ''}`}
                      style={{ animationDelay: `${index * 45}ms` }}
                      onMouseEnter={() => setHover(bar.label)}
                      onMouseLeave={() => setHover(null)}
                    >
                      <div
                        className={`travel-history-bar-wrap dash-bar-wrap${isActive ? ' is-active' : ''}`}
                        title={tooltip || bar.label}
                      >
                        <span
                          className={`travel-history-bar-value travel-history-bar-value-count dash-bar-value${isActive ? ' is-active' : ''}`}
                          style={{ bottom: `calc(${Math.max(height, 4)}% + 3px)` }}
                        >
                          {total}
                        </span>
                        <div
                          className={`dependants-stacked-bar dash-bar-fill${isActive ? ' is-active' : ''}`}
                          style={{ height: `${Math.max(height, total > 0 ? 4 : 0)}%` }}
                        >
                          {bar.segments.map((segment) => {
                            if (segment.value <= 0) return null;
                            const segmentHeight = (segment.value / total) * 100;
                            return (
                              <div
                                key={`${bar.label}-${segment.label}`}
                                className={`dependants-stacked-segment ${segment.className ?? ''}`}
                                style={{ height: `${segmentHeight}%` }}
                                title={`${segment.label}: ${segment.value}`}
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
              style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(72px, 1fr))` }}
            >
              {bars.map((bar) => (
                <span
                  key={`${bar.label}-label`}
                  className={`travel-history-chart-label${hover === bar.label ? ' is-active' : ''}`}
                  title={bar.label}
                >
                  {bar.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </EnlargeableChartPanel>
  );
}
