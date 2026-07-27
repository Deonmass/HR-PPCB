'use client';

import { useEffect, useMemo, useState } from 'react';
import ChartHorizontalGrid from '@/components/ChartHorizontalGrid';
import EnlargeableChartPanel from '@/components/EnlargeableChartPanel';
import type { TravelHistoryMonthlyTripsChart } from '@/lib/travel-history-types';

interface Props {
  chart: TravelHistoryMonthlyTripsChart;
}

interface ChartPoint {
  x: number;
  y: number;
  value: number;
  monthLabel: string;
}

interface TooltipState {
  x: number;
  y: number;
  department: string;
  month: string;
  value: number;
  color: string;
}

const CHART_W = 960;
const CHART_H = 300;
const PLOT_H = 232;
const PLOT_BOTTOM = 268;
const GRID_TICKS = [0, 25, 50, 75, 100];

const SERIES_COLORS = [
  '#60a5fa',
  '#f59e0b',
  '#34d399',
  '#f472b6',
  '#a78bfa',
  '#fb7185',
  '#38bdf8',
  '#fbbf24',
];

function buildSmoothPath(points: ChartPoint[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x},${points[0].y} L ${points[1].x},${points[1].y}`;
  }

  let path = `M ${points[0].x},${points[0].y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const point0 = points[Math.max(0, index - 1)];
    const point1 = points[index];
    const point2 = points[index + 1];
    const point3 = points[Math.min(points.length - 1, index + 2)];
    const control1x = point1.x + (point2.x - point0.x) / 6;
    const control1y = point1.y + (point2.y - point0.y) / 6;
    const control2x = point2.x - (point3.x - point1.x) / 6;
    const control2y = point2.y - (point3.y - point1.y) / 6;
    path += ` C ${control1x},${control1y} ${control2x},${control2y} ${point2.x},${point2.y}`;
  }
  return path;
}

export default function TravelMonthlyTripsChart({ chart }: Props) {
  const [selectedYear, setSelectedYear] = useState(chart.years[0] ?? new Date().getFullYear());
  const [hiddenDepartments, setHiddenDepartments] = useState<Set<string>>(new Set());
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  useEffect(() => {
    if (!chart.years.includes(selectedYear)) {
      setSelectedYear(chart.years[0] ?? new Date().getFullYear());
    }
  }, [chart.years, selectedYear]);

  const yearSeries = chart.byYear[selectedYear] ?? [];

  const visibleSeries = useMemo(
    () => yearSeries.filter((item) => !hiddenDepartments.has(item.department)),
    [yearSeries, hiddenDepartments],
  );

  const maxValue = useMemo(() => {
    let max = 1;
    for (const item of visibleSeries) {
      for (const value of item.values) {
        if (value > max) max = value;
      }
    }
    return max;
  }, [visibleSeries]);

  const monthCount = Math.max(chart.months.length, 1);
  const colWidth = CHART_W / monthCount;

  const seriesGeometry = useMemo(
    () =>
      visibleSeries.map((item, seriesIndex) => {
        const color = SERIES_COLORS[seriesIndex % SERIES_COLORS.length];
        const points: ChartPoint[] = item.values.map((value, index) => {
          const x = index * colWidth + colWidth / 2;
          const y = PLOT_BOTTOM - (maxValue > 0 ? (value / maxValue) * PLOT_H : 0);
          return {
            x,
            y,
            value,
            monthLabel: chart.months[index]?.label ?? '',
          };
        });
        return {
          department: item.department,
          color,
          points,
          path: buildSmoothPath(points),
        };
      }),
    [visibleSeries, colWidth, maxValue, chart.months],
  );

  const toggleDepartment = (department: string) => {
    setHiddenDepartments((prev) => {
      const next = new Set(prev);
      if (next.has(department)) next.delete(department);
      else next.add(department);
      return next;
    });
  };

  const hasAnySeries = yearSeries.length > 0;

  const yearFilter = (
    <label className="travel-monthly-year-filter">
      <span>Année</span>
      <select
        value={selectedYear}
        onChange={(event) => setSelectedYear(Number.parseInt(event.target.value, 10))}
      >
        {chart.years.map((year) => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <EnlargeableChartPanel
      title="Voyages par mois"
      className="travel-history-chart-panel travel-monthly-chart-panel"
      headExtra={yearFilter}
      clickToEnlarge={false}
    >
      {hasAnySeries && (
        <div className="travel-monthly-chart-legend">
          {yearSeries.map((item, index) => {
            const hidden = hiddenDepartments.has(item.department);
            const color = SERIES_COLORS[index % SERIES_COLORS.length];
            return (
              <button
                key={item.department}
                type="button"
                className={`travel-monthly-legend-item${hidden ? ' hidden' : ''}`}
                onClick={() => toggleDepartment(item.department)}
                title={hidden ? 'Afficher' : 'Masquer'}
              >
                <span className="travel-monthly-legend-swatch" style={{ background: color }} />
                {item.department}
              </button>
            );
          })}
        </div>
      )}

      {!hasAnySeries ? (
        <p className="empty-state">Aucune donnée disponible pour {selectedYear}.</p>
      ) : (
        <div className="travel-monthly-chart-area">
          <div className="travel-monthly-chart-layout">
            <div className="chart-y-axis travel-monthly-chart-y-axis">
              {[...GRID_TICKS].reverse().map((tick) => (
                <span key={tick} className="chart-y-label">
                  {tick === 0 ? '0' : Math.round((maxValue * tick) / 100)}
                </span>
              ))}
            </div>
            <div className="travel-monthly-chart-plot">
              <div className="travel-monthly-chart-plot-grid">
                <ChartHorizontalGrid ticks={GRID_TICKS} />
              </div>
              <svg
                className="travel-monthly-chart-svg"
                viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                preserveAspectRatio="none"
                aria-hidden
              >
                {seriesGeometry.map((item) => (
                  <g key={item.department}>
                    <path
                      className="travel-monthly-chart-line"
                      d={item.path}
                      fill="none"
                      stroke={item.color}
                    />
                    {item.points.map((point, index) => (
                      <circle
                        key={`${item.department}-${chart.months[index]?.key ?? index}`}
                        className="travel-monthly-chart-dot"
                        cx={point.x}
                        cy={point.y}
                        r="5"
                        fill={item.color}
                        onMouseEnter={(event) => {
                          const rect = event.currentTarget.ownerSVGElement
                            ?.closest('.travel-monthly-chart-plot')
                            ?.getBoundingClientRect();
                          if (!rect) return;
                          setTooltip({
                            x: event.clientX - rect.left,
                            y: event.clientY - rect.top,
                            department: item.department,
                            month: point.monthLabel,
                            value: point.value,
                            color: item.color,
                          });
                        }}
                        onMouseLeave={() => setTooltip(null)}
                      />
                    ))}
                  </g>
                ))}
              </svg>
              {tooltip && (
                <div
                  className="travel-monthly-chart-tooltip"
                  style={{ left: tooltip.x, top: tooltip.y }}
                >
                  <span
                    className="travel-monthly-chart-tooltip-dot"
                    style={{ background: tooltip.color }}
                  />
                  <div className="travel-monthly-chart-tooltip-body">
                    <strong>{tooltip.department}</strong>
                    <span>
                      {tooltip.month} {selectedYear}
                    </span>
                    <span className="travel-monthly-chart-tooltip-value">
                      {tooltip.value} voyage{tooltip.value > 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              )}
              <div
                className="travel-monthly-chart-months"
                style={{ gridTemplateColumns: `repeat(${monthCount}, minmax(0, 1fr))` }}
              >
                {chart.months.map((month) => (
                  <span key={month.key} className="travel-monthly-chart-month">
                    {month.label}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </EnlargeableChartPanel>
  );
}
