'use client';

import { useMemo } from 'react';
import type { HomeChartSlice } from '@/lib/home-dashboard-types';

interface Props {
  title: string;
  slices: HomeChartSlice[];
  emptyLabel?: string;
  /** Valeur affichée au centre (sinon somme des parts). */
  centerValue?: number;
  centerLabel?: string;
  formatValue?: (n: number) => string;
  /** Affiche le % de chaque part dans la légende (défaut true). */
  showSharePercent?: boolean;
}

const SIZE = 96;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function defaultFormat(n: number): string {
  return n.toLocaleString('fr-FR');
}

export default function HomeDonutChart({
  title,
  slices,
  emptyLabel = 'Aucune donnée',
  centerValue,
  centerLabel,
  formatValue = defaultFormat,
  showSharePercent = true,
}: Props) {
  const total = useMemo(
    () => slices.reduce((sum, s) => sum + Math.max(0, s.value), 0),
    [slices],
  );

  const arcs = useMemo(() => {
    if (total <= 0) return [];
    let offset = 0;
    return slices
      .filter((s) => s.value > 0)
      .map((slice) => {
        const length = (slice.value / total) * C;
        const item = {
          ...slice,
          dash: `${length} ${C - length}`,
          offset: -offset,
        };
        offset += length;
        return item;
      });
  }, [slices, total]);

  const displayCenter = centerValue != null ? centerValue : total;

  if (!arcs.length) {
    return (
      <article className="home-chart-panel panel">
        <header className="home-chart-head">
          <h4>{title}</h4>
        </header>
        <p className="empty-state home-chart-empty">{emptyLabel}</p>
      </article>
    );
  }

  return (
    <article className="home-chart-panel panel">
      <header className="home-chart-head">
        <h4>{title}</h4>
      </header>
      <div className="home-donut-layout">
        <div className="home-donut-svg-wrap">
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="home-donut-svg"
            width={SIZE}
            height={SIZE}
            aria-hidden
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="color-mix(in srgb, var(--border) 70%, transparent)"
              strokeWidth={STROKE}
            />
            {arcs.map((arc) => (
              <circle
                key={arc.label}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={arc.color || '#e30613'}
                strokeWidth={STROKE}
                strokeDasharray={arc.dash}
                strokeDashoffset={arc.offset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            ))}
          </svg>
          <div className="home-donut-center">
            <strong>{formatValue(displayCenter)}</strong>
            {centerLabel && <span>{centerLabel}</span>}
          </div>
        </div>
        <ul className="home-donut-legend">
          {arcs.map((arc) => (
            <li key={arc.label}>
              <i style={{ background: arc.color || '#e30613' }} aria-hidden />
              <span className="home-donut-legend-label" title={arc.label}>
                {arc.label}
              </span>
              <strong>
                {formatValue(arc.value)}
                {showSharePercent && total > 0
                  ? ` · ${Math.round((arc.value / total) * 100)}%`
                  : ''}
              </strong>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
