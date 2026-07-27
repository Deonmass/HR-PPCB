'use client';

import { useMemo, useState } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { FactureSuivi } from '@/lib/factures-fournisseurs/types';
import {
  buildFacturesMonthlyTracking,
  formatUsdLike,
  listFactureYears,
  type FactureMonthlyPoint,
} from '@/lib/factures-fournisseurs/utils';

const CHART_W = 720;
const CHART_H = 260;
const PAD_X = 12;
const PAD_TOP = 22;
const PAD_BOTTOM = 18;

interface SeriesPoint {
  x: number;
  y: number;
  month: number;
  label: string;
  value: number;
}

interface Props {
  factures: FactureSuivi[];
}

function buildSmoothPath(points: SeriesPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return path;
}

function formatUsdCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} M $`;
  }
  if (abs >= 10_000) {
    return `${(value / 1_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k $`;
  }
  return `${formatUsdLike(value)} $`;
}

function toSeries(
  points: FactureMonthlyPoint[],
  getValue: (p: FactureMonthlyPoint) => number,
  maxValue: number,
): SeriesPoint[] {
  const plotW = CHART_W - PAD_X * 2;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
  const safeMax = Math.max(maxValue, 1);
  return points.map((item, index) => {
    const value = getValue(item);
    const x = PAD_X + (points.length === 1 ? plotW / 2 : (index / (points.length - 1)) * plotW);
    const y = PAD_TOP + plotH - (value / safeMax) * plotH;
    return { x, y, month: item.month, label: item.label, value };
  });
}

export default function FacturesMonthlyChart({ factures }: Props) {
  const years = useMemo(() => listFactureYears(factures), [factures]);
  const [year, setYear] = useState(() => years[0] ?? new Date().getFullYear());
  const [hoverMonth, setHoverMonth] = useState<number | null>(null);

  const selectedYear = years.includes(year) ? year : (years[0] ?? new Date().getFullYear());

  const monthly = useMemo(
    () => buildFacturesMonthlyTracking(factures, selectedYear),
    [factures, selectedYear],
  );

  const maxCount = Math.max(...monthly.map((p) => p.recuCount), 1);
  const maxMontant = Math.max(
    ...monthly.map((p) => Math.max(p.recuMontant, p.paidMontant, p.unpaidMontant)),
    1,
  );

  const recuCountPts = useMemo(
    () => toSeries(monthly, (p) => p.recuCount, maxCount),
    [monthly, maxCount],
  );
  const recuMontantPts = useMemo(
    () => toSeries(monthly, (p) => p.recuMontant, maxMontant),
    [monthly, maxMontant],
  );
  const paidPts = useMemo(
    () => toSeries(monthly, (p) => p.paidMontant, maxMontant),
    [monthly, maxMontant],
  );
  const unpaidPts = useMemo(
    () => toSeries(monthly, (p) => p.unpaidMontant, maxMontant),
    [monthly, maxMontant],
  );

  const gridTicks = [0, 25, 50, 75, 100];
  const active = hoverMonth == null ? null : monthly[hoverMonth] ?? null;
  const activeX = hoverMonth == null ? null : recuCountPts[hoverMonth]?.x ?? null;

  const yearFilter = (
    <label className="factures-monthly-year-filter">
      <span>Année</span>
      <select
        className="filter-select"
        value={selectedYear}
        onChange={(e) => setYear(Number(e.target.value))}
        onClick={(e) => e.stopPropagation()}
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </label>
  );

  return (
    <EnlargeableChartPanel
      title="Suivi des factures par mois"
      className="travel-history-chart-panel factures-monthly-chart-panel"
      headExtra={yearFilter}
      clickToEnlarge={false}
    >
      <div className="factures-monthly-legend" onClick={(e) => e.stopPropagation()}>
        <span className="factures-monthly-legend-item is-recu-count">
          <i /> Reçu (nb)
        </span>
        <span className="factures-monthly-legend-item is-recu-montant">
          <i /> Reçu ($)
        </span>
        <span className="factures-monthly-legend-item is-paid">
          <i /> Paid ($)
        </span>
        <span className="factures-monthly-legend-item is-unpaid">
          <i /> Unpaid ($)
        </span>
      </div>

      <div className="travel-history-chart-area factures-monthly-chart-area">
        <div className="travel-monthly-chart-layout travel-history-dept-chart-layout">
          <div className="chart-y-axis travel-monthly-chart-y-axis">
            {[...gridTicks].reverse().map((tick) => (
              <span key={`l-${tick}`} className="chart-y-label">
                {tick === 0 ? '0' : Math.round((maxCount * tick) / 100)}
              </span>
            ))}
            <span className="factures-monthly-axis-caption">Nb</span>
          </div>

          <div className="travel-history-plot-wrap employees-line-plot-wrap">
            <div className="travel-history-plot-body travel-history-dept-plot-body employees-line-plot-body factures-monthly-plot-body">
              <ChartHorizontalGrid ticks={gridTicks} />
              <svg
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                className="employees-line-svg factures-monthly-svg"
                preserveAspectRatio="none"
              >
                <path
                  d={buildSmoothPath(recuMontantPts)}
                  className="factures-monthly-series is-recu-montant"
                  fill="none"
                  strokeWidth="2.25"
                  strokeDasharray="6 4"
                  strokeLinejoin="round"
                />
                <path
                  d={buildSmoothPath(paidPts)}
                  className="factures-monthly-series is-paid"
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <path
                  d={buildSmoothPath(unpaidPts)}
                  className="factures-monthly-series is-unpaid"
                  fill="none"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                <path
                  d={buildSmoothPath(recuCountPts)}
                  className="factures-monthly-series is-recu-count"
                  fill="none"
                  strokeWidth="2.75"
                  strokeLinejoin="round"
                />

                {monthly.map((point, index) => {
                  const x = recuCountPts[index]?.x ?? 0;
                  const isActive = hoverMonth === index;
                  return (
                    <g key={point.label}>
                      <rect
                        x={x - 22}
                        y={PAD_TOP}
                        width={44}
                        height={CHART_H - PAD_TOP - PAD_BOTTOM}
                        fill="transparent"
                        onMouseEnter={() => setHoverMonth(index)}
                        onMouseLeave={() => setHoverMonth(null)}
                      />
                      {[
                        { pts: recuCountPts, className: 'is-recu-count' },
                        { pts: recuMontantPts, className: 'is-recu-montant' },
                        { pts: paidPts, className: 'is-paid' },
                        { pts: unpaidPts, className: 'is-unpaid' },
                      ].map((series, sIdx) => {
                        const p = series.pts[index];
                        if (!p) return null;
                        return (
                          <circle
                            key={`${point.label}-${sIdx}`}
                            className={`factures-monthly-dot ${series.className}`}
                            cx={p.x}
                            cy={p.y}
                            r={isActive ? 5.5 : 3.5}
                            strokeWidth={2}
                            opacity={hoverMonth != null && !isActive ? 0.35 : 1}
                          />
                        );
                      })}
                    </g>
                  );
                })}
              </svg>

              {active && activeX != null && (
                <div
                  className="employees-line-tooltip factures-monthly-tooltip"
                  style={{ left: `${(activeX / CHART_W) * 100}%` }}
                >
                  <strong>{active.label} {selectedYear}</strong>
                  <span>Reçu : {active.recuCount} · {formatUsdCompact(active.recuMontant)}</span>
                  <span className="is-paid">Paid : {active.paidCount} · {formatUsdCompact(active.paidMontant)}</span>
                  <span className="is-unpaid">Unpaid : {active.unpaidCount} · {formatUsdCompact(active.unpaidMontant)}</span>
                </div>
              )}
            </div>

            <div
              className="travel-history-chart-cols travel-history-chart-cols-labels"
              style={{ gridTemplateColumns: `repeat(${monthly.length}, minmax(36px, 1fr))` }}
            >
              {monthly.map((item, index) => (
                <span
                  key={item.label}
                  className={`travel-history-chart-label${hoverMonth === index ? ' is-active' : ''}`}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="chart-y-axis travel-monthly-chart-y-axis factures-monthly-y-right">
            {[...gridTicks].reverse().map((tick) => (
              <span key={`r-${tick}`} className="chart-y-label">
                {tick === 0 ? '0' : formatUsdCompact((maxMontant * tick) / 100)}
              </span>
            ))}
            <span className="factures-monthly-axis-caption">$</span>
          </div>
        </div>
      </div>
    </EnlargeableChartPanel>
  );
}
