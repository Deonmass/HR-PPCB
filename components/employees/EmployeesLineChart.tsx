'use client';

import { useMemo, useState, type ReactNode } from 'react';
import EnlargeableChartPanel, { type ChartDeptFilterSource } from '@/components/EnlargeableChartPanel';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import type { HrDashCountRow } from '@/lib/employees-hr-dashboard';

interface Props {
  title: string;
  items: HrDashCountRow[];
  color?: string;
  deptFilter?: ChartDeptFilterSource;
}

interface Point {
  x: number;
  y: number;
  label: string;
  value: number;
}

function buildSmoothPath(points: Point[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }
  // Courbe légère, sans bulle (poignées horizontales courtes).
  let path = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const dx = (p2.x - p1.x) / 4;
    path += ` C ${p1.x + dx},${p1.y} ${p2.x - dx},${p2.y} ${p2.x},${p2.y}`;
  }
  return path;
}

const CHART_W = 560;
const CHART_H = 220;
const PAD_X = 28;
const PAD_TOP = 26;
const PAD_BOTTOM = 0;

export function EmployeesLineChartBody({
  items,
  color = '#60a5fa',
}: {
  items: HrDashCountRow[];
  color?: string;
}): ReactNode {
  const [hover, setHover] = useState<string | null>(null);
  const maxValue = Math.max(...items.map((i) => i.count), 1);
  const gridTicks = [0, 25, 50, 75, 100];

  const points = useMemo(() => {
    if (!items.length) return [] as Point[];
    const plotW = CHART_W - PAD_X * 2;
    const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;
    return items.map((item, index) => {
      const x = PAD_X + (items.length === 1 ? plotW / 2 : (index / (items.length - 1)) * plotW);
      const y = PAD_TOP + plotH - (item.count / maxValue) * plotH;
      return { x, y, label: item.label, value: item.count };
    });
  }, [items, maxValue]);

  const linePath = useMemo(() => buildSmoothPath(points), [points]);
  const areaPath = useMemo(() => {
    if (!points.length) return '';
    const bottom = CHART_H - PAD_BOTTOM;
    return `${linePath} L ${points[points.length - 1].x},${bottom} L ${points[0].x},${bottom} Z`;
  }, [linePath, points]);

  if (!items.length) {
    return <p className="empty-state">Aucune donnée disponible.</p>;
  }

  const active = points.find((p) => p.label === hover) ?? null;

  return (
    <div className="travel-history-chart-area employees-line-chart-area">
      <div className="travel-history-dept-chart-layout">
        <div className="travel-history-dept-plot-row">
          <div className="chart-y-axis travel-history-dept-y-axis">
            {[...gridTicks].reverse().map((tick) => (
              <span key={tick} className="chart-y-label">
                {tick === 0 ? '0' : Math.round((maxValue * tick) / 100)}
              </span>
            ))}
          </div>
          <div className="travel-history-plot-body travel-history-dept-plot-body employees-line-plot-body">
            <ChartHorizontalGrid ticks={gridTicks} />
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="employees-line-svg" preserveAspectRatio="none">
              <defs>
                <linearGradient id="employees-line-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.28" />
                  <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
              </defs>
              <path d={areaPath} fill="url(#employees-line-fill)" />
              <path
                d={linePath}
                fill="none"
                stroke={color}
                strokeWidth="2.25"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {points.map((point) => {
                const isActive = hover === point.label;
                const isDimmed = Boolean(hover && !isActive);
                return (
                  <g
                    key={point.label}
                    className={`employees-line-point${isActive ? ' is-active' : ''}${isDimmed ? ' is-dimmed' : ''}`}
                    opacity={isDimmed ? 0.35 : 1}
                  >
                    <text
                      x={point.x}
                      y={point.y - 8}
                      textAnchor="middle"
                      className={`employees-line-value${isActive ? ' is-active' : ''}`}
                    >
                      {point.value}
                    </text>
                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={isActive ? 5.5 : 3.75}
                      fill={isActive ? '#fff' : color}
                      stroke={color}
                      strokeWidth={2}
                      className="employees-line-dot"
                      onMouseEnter={() => setHover(point.label)}
                      onMouseLeave={() => setHover(null)}
                    />
                    <rect
                      x={point.x - 18}
                      y={PAD_TOP}
                      width={36}
                      height={Math.max(CHART_H - PAD_TOP - PAD_BOTTOM, 1)}
                      fill="transparent"
                      onMouseEnter={() => setHover(point.label)}
                      onMouseLeave={() => setHover(null)}
                    />
                  </g>
                );
              })}
            </svg>
            {active && (
              <div
                className="employees-line-tooltip"
                style={{ left: `${(active.x / CHART_W) * 100}%`, top: `${(active.y / CHART_H) * 100}%` }}
              >
                <strong>{active.value}</strong>
                <span>{active.label}</span>
              </div>
            )}
          </div>
        </div>
        <div className="travel-history-dept-label-row">
          <div className="travel-history-dept-y-spacer" aria-hidden />
          <div
            className="travel-history-chart-cols travel-history-chart-cols-labels"
            style={{ gridTemplateColumns: `repeat(${items.length}, minmax(48px, 1fr))` }}
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

export default function EmployeesLineChart({ title, items, color = '#60a5fa', deptFilter }: Props) {
  if (!items.length) {
    return (
      <div className="panel travel-history-chart-panel">
        <div className="panel-head"><h3>{title}</h3></div>
        <p className="empty-state">Aucune donnée disponible.</p>
      </div>
    );
  }

  return (
    <EnlargeableChartPanel title={title} className="travel-history-chart-panel" clickToEnlarge deptFilter={deptFilter}>
      <EmployeesLineChartBody items={items} color={color} />
    </EnlargeableChartPanel>
  );
}
