'use client';

import { useState } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import { formatUsd } from '@/lib/projects';
import type { BudgetRow } from '@/lib/project-types';

interface Props {
  sectors: BudgetRow[];
}

const GRID_TICKS = [0, 25, 50, 75, 100];

export default function SectorBudgetChart({ sectors }: Props) {
  const [hover, setHover] = useState<string | null>(null);
  if (!sectors.length) return null;

  const max = Math.max(...sectors.flatMap((row) => [row.prevus, row.depense]), 1);

  const legend = (
    <div className="sector-budget-chart-legend">
      <span className="sector-budget-legend-item">
        <span className="sector-budget-legend-swatch sector-budget-legend-prevu" />
        Prévu
      </span>
      <span className="sector-budget-legend-item">
        <span className="sector-budget-legend-swatch sector-budget-legend-depense" />
        Dépensé
      </span>
    </div>
  );

  return (
    <EnlargeableChartPanel
      title="Budget par secteur"
      className="sector-budget-chart-panel"
      headExtra={legend}
      clickToEnlarge
    >
      <div className="sector-budget-chart-area">
        <div className="sector-budget-plot-wrap">
          <div className="sector-budget-plot-body">
            <ChartHorizontalGrid ticks={GRID_TICKS} />
            <div
              className={`sector-budget-chart-cols sector-budget-chart-cols-bars dash-chart-bars${hover ? ' has-hover' : ''}`}
              style={{ gridTemplateColumns: `repeat(${sectors.length}, minmax(72px, 1fr))` }}
            >
              {sectors.map((row, index) => {
                const prevuHeight = max > 0 ? (row.prevus / max) * 100 : 0;
                const depenseHeight = max > 0 ? (row.depense / max) * 100 : 0;
                const key = String(row.secteur);
                const isActive = hover === key;
                return (
                  <div
                    key={`${key}-bars`}
                    className={`sector-budget-chart-bars dash-bar-col${isActive ? ' is-active' : ''}${hover && !isActive ? ' is-dimmed' : ''}`}
                    style={{ animationDelay: `${index * 45}ms` }}
                    onMouseEnter={() => setHover(key)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <div className={`sector-budget-bar-wrap dash-bar-wrap${isActive ? ' is-active' : ''}`}>
                      <span
                        className={`sector-budget-bar-value sector-budget-value-prevu dash-bar-value${isActive ? ' is-active' : ''}`}
                        style={{ bottom: `calc(${Math.max(prevuHeight, 4)}% + 3px)` }}
                      >
                        {formatUsd(row.prevus, 0)}
                      </span>
                      <div
                        className={`sector-budget-bar sector-budget-bar-prevu dash-bar-fill${isActive ? ' is-active' : ''}`}
                        style={{ height: `${Math.max(prevuHeight, row.prevus > 0 ? 4 : 0)}%` }}
                        title={`Prévu: ${formatUsd(row.prevus)}`}
                      />
                    </div>
                    <div className={`sector-budget-bar-wrap dash-bar-wrap${isActive ? ' is-active' : ''}`}>
                      <span
                        className={`sector-budget-bar-value sector-budget-value-depense dash-bar-value${isActive ? ' is-active' : ''}`}
                        style={{ bottom: `calc(${Math.max(depenseHeight, 4)}% + 3px)` }}
                      >
                        {formatUsd(row.depense, 0)}
                      </span>
                      <div
                        className={`sector-budget-bar sector-budget-bar-depense dash-bar-fill${isActive ? ' is-active' : ''}`}
                        style={{ height: `${Math.max(depenseHeight, row.depense > 0 ? 4 : 0)}%` }}
                        title={`Dépensé: ${formatUsd(row.depense)}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            className="sector-budget-chart-cols sector-budget-chart-cols-labels"
            style={{ gridTemplateColumns: `repeat(${sectors.length}, minmax(72px, 1fr))` }}
          >
            {sectors.map((row) => (
              <span
                key={`${row.secteur}-label`}
                className={`sector-budget-chart-label${hover === String(row.secteur) ? ' is-active' : ''}`}
                title={String(row.secteur)}
              >
                {String(row.secteur)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </EnlargeableChartPanel>
  );
}
