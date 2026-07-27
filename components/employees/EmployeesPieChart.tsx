'use client';

import { useMemo, useState } from 'react';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { HrDashCountRow } from '@/lib/employees-hr-dashboard';

export type PieChartItem = HrDashCountRow & {
  /** Compteur secondaire affiché à côté de la valeur (ex. nb de factures). */
  itemsCount?: number;
};

interface Props {
  title: string;
  items: PieChartItem[];
  colors?: string[];
  /** Formate les valeurs affichées (centre + légende). Défaut : nombre brut. */
  formatValue?: (value: number) => string;
  /** Formate le compteur secondaire (ex. "(6)"). Défaut : "(n)". */
  formatCount?: (count: number) => string;
}

const DEFAULT_COLORS = [
  '#06b6d4',
  '#f472b6',
  '#a78bfa',
  '#22c55e',
  '#f59e0b',
  '#60a5fa',
  '#fb7185',
  '#34d399',
];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeDonutSlice(
  cx: number,
  cy: number,
  rOut: number,
  rIn: number,
  startAngle: number,
  endAngle: number,
) {
  const sweep = endAngle - startAngle;
  if (sweep >= 359.9) {
    return [
      `M ${cx} ${cy - rOut}`,
      `A ${rOut} ${rOut} 0 1 1 ${cx} ${cy + rOut}`,
      `A ${rOut} ${rOut} 0 1 1 ${cx} ${cy - rOut}`,
      `M ${cx} ${cy - rIn}`,
      `A ${rIn} ${rIn} 0 1 0 ${cx} ${cy + rIn}`,
      `A ${rIn} ${rIn} 0 1 0 ${cx} ${cy - rIn}`,
      'Z',
    ].join(' ');
  }
  const large = sweep > 180 ? 1 : 0;
  const oStart = polarToCartesian(cx, cy, rOut, endAngle);
  const oEnd = polarToCartesian(cx, cy, rOut, startAngle);
  const iStart = polarToCartesian(cx, cy, rIn, startAngle);
  const iEnd = polarToCartesian(cx, cy, rIn, endAngle);
  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${rOut} ${rOut} 0 ${large} 0 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${rIn} ${rIn} 0 ${large} 1 ${iEnd.x} ${iEnd.y}`,
    'Z',
  ].join(' ');
}

export default function EmployeesPieChart({
  title,
  items,
  colors = DEFAULT_COLORS,
  formatValue = (v) => String(v),
  formatCount = (n) => `(${n})`,
}: Props) {
  const [hover, setHover] = useState<string | null>(null);
  const total = useMemo(() => items.reduce((s, i) => s + i.count, 0), [items]);
  const totalItems = useMemo(
    () => items.reduce((s, i) => s + (i.itemsCount ?? 0), 0),
    [items],
  );
  const hasItemsCount = items.some((i) => i.itemsCount != null);

  const formatWithCount = (value: number, itemsCount?: number) => {
    const base = formatValue(value);
    if (itemsCount == null) return base;
    return `${base} ${formatCount(itemsCount)}`;
  };

  const slices = useMemo(() => {
    if (!total) return [];
    let angle = 0;
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => item.count > 0)
      .map(({ item, index }) => {
        const sweep = (item.count / total) * 360;
        const start = angle;
        const end = angle + sweep;
        angle = end;
        return {
          ...item,
          start,
          end,
          pct: Math.round((item.count / total) * 1000) / 10,
          color: colors[index % colors.length],
        };
      });
  }, [items, total, colors]);

  const active = slices.find((s) => s.label === hover) ?? null;

  if (!items.length || total === 0) {
    return (
      <div className="panel travel-history-chart-panel">
        <div className="panel-head"><h3>{title}</h3></div>
        <p className="empty-state">Aucune donnée disponible.</p>
      </div>
    );
  }

  const cx = 110;
  const cy = 110;
  const rOut = 92;
  const rIn = 52;

  return (
    <EnlargeableChartPanel title={title} className="travel-history-chart-panel employees-pie-panel" clickToEnlarge>
      <div className="employees-pie-layout">
        <div className="employees-pie-svg-wrap">
          <svg viewBox="0 0 220 220" className="employees-pie-svg">
            {slices.map((slice) => {
              const isActive = hover === slice.label;
              const isDimmed = Boolean(hover && !isActive);
              return (
                <g
                  key={slice.label}
                  className={`employees-pie-slice-g${isActive ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}`}
                  style={{ transformOrigin: `${cx}px ${cy}px` }}
                  onMouseEnter={() => setHover(slice.label)}
                  onMouseLeave={() => setHover(null)}
                >
                  <path
                    d={describeDonutSlice(cx, cy, rOut, rIn, slice.start, slice.end)}
                    fill={slice.color}
                    className="employees-pie-slice"
                  >
                    <title>
                      {`${slice.label}: ${formatWithCount(slice.count, slice.itemsCount)} (${slice.pct}%)`}
                    </title>
                  </path>
                </g>
              );
            })}
            <text x={cx} y={cy - 6} textAnchor="middle" className="employees-pie-center-value">
              {active
                ? formatWithCount(active.count, active.itemsCount)
                : formatWithCount(total, hasItemsCount ? totalItems : undefined)}
            </text>
            <text x={cx} y={cy + 14} textAnchor="middle" className="employees-pie-center-label">
              {active ? `${active.pct}%` : 'Total'}
            </text>
          </svg>
        </div>
        <ul className="employees-pie-legend">
          {slices.map((slice) => (
            <li
              key={slice.label}
              className={`employees-pie-legend-item${hover === slice.label ? ' is-active' : ''}`}
              onMouseEnter={() => setHover(slice.label)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="employees-pie-swatch" style={{ background: slice.color }} />
              <span className="employees-pie-legend-label" title={slice.label}>{slice.label}</span>
              <span className="employees-pie-legend-value">
                {formatWithCount(slice.count, slice.itemsCount)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </EnlargeableChartPanel>
  );
}
