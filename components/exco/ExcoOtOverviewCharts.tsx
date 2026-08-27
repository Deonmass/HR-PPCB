'use client';

import { useMemo, useState, type ReactNode } from 'react';
import type {
  ExcoWorkbookOtActualVsBudget,
  ExcoWorkbookOtTrendRow,
} from '@/lib/exco-new-report-parse';
import { OVT_TREND_MONTH_LABELS } from '@/lib/exco-new-report-parse';

const MONTH_COLORS = [
  '#14b8a6', // APR
  '#8b5cf6', // MAY
  '#22c55e', // JUN
  '#f97316', // JUL
  '#ef4444', // AUG
  '#06b6d4', // SEP
  '#a855f7', // OCT
  '#84cc16', // NOV
  '#eab308', // DEC
  '#3b82f6', // JAN
  '#ec4899', // FEB
  '#64748b', // MAR
];

const ACTUAL_COLOR = '#1e3a5f';
const BUDGET_COLOR = '#f59e0b';
const PCT_COLOR = '#0ea5e9';

function niceMax(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const n = raw / base;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return nice * base;
}

/** Échelle serrée (~8 % de marge) pour que les barres montent près du sommet. */
function tightMax(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const target = raw * 1.08;
  const exp = Math.floor(Math.log10(target));
  const base = 10 ** Math.max(exp, 0);
  const n = target / base;
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const nice = steps.find((s) => n <= s) ?? 10;
  return nice * base;
}

function fmtAxis(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (Math.abs(n) >= 1000) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtHours(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function shortDept(name: string): string {
  if (name === 'Sales and Marketing') return 'Sales';
  if (name === 'Quality Assurance') return 'QA';
  if (name === 'Human Resources') return 'HR';
  if (name === 'Transport and Transit') return 'Transport';
  if (name === 'Optimization') return 'Optim.';
  if (name === 'Engineering') return 'Eng.';
  if (name === 'Production') return 'Prod.';
  if (name === 'Logistic') return 'Log.';
  return name;
}

type StackedDept = {
  department: string;
  months: number[];
  total: number;
  sharePct: number;
};

function buildStacked(
  rows: ExcoWorkbookOtTrendRow[],
  kind: 'hours' | 'cost',
): StackedDept[] {
  const mapped = rows.map((r) => {
    const months = (kind === 'hours' ? r.hoursByMonth : r.costByMonth).map((v) =>
      v != null && Number.isFinite(v) ? Math.max(0, v) : 0,
    );
    const total = months.reduce((s, v) => s + v, 0);
    const shareRaw = kind === 'hours' ? r.hoursShare : r.costShare;
    const sharePct =
      shareRaw != null && Number.isFinite(shareRaw)
        ? shareRaw <= 1
          ? shareRaw * 100
          : shareRaw
        : 0;
    return { department: r.department, months, total, sharePct };
  });
  const sumShare = mapped.reduce((s, d) => s + d.sharePct, 0);
  if (sumShare < 0.5) {
    const grand = mapped.reduce((s, d) => s + d.total, 0) || 1;
    for (const d of mapped) d.sharePct = (d.total / grand) * 100;
  }
  return mapped.filter((d) => d.total > 0 || d.months.some((v) => v > 0));
}

function activeMonthIndexes(rows: ExcoWorkbookOtTrendRow[]): number[] {
  const active: number[] = [];
  for (let i = 0; i < OVT_TREND_MONTH_LABELS.length; i += 1) {
    const has = rows.some((r) => {
      const h = r.hoursByMonth[i];
      const c = r.costByMonth[i];
      return (h != null && h > 0) || (c != null && c > 0);
    });
    if (has) active.push(i);
  }
  return active.length ? active : [0, 1, 2, 3];
}

function ChartCard({
  title,
  className,
  legend,
  children,
}: {
  title: string;
  className?: string;
  legend?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`exco-panel exco-ot-chart-panel${className ? ` ${className}` : ''}`}>
      <div className="exco-panel-head">
        <h3>{title}</h3>
        {legend}
      </div>
      <div className="exco-ot-chart-body">{children}</div>
    </section>
  );
}

function ActualVsBudgetChart({ data }: { data: ExcoWorkbookOtActualVsBudget }) {
  const [hover, setHover] = useState<number | null>(null);
  const labels = data.monthLabels?.length ? data.monthLabels : [...OVT_TREND_MONTH_LABELS];
  const actual = data.actualByMonth || [];
  const budget = data.budgetByMonth || [];
  const maxY = niceMax(
    Math.max(
      ...actual.map((v) => v || 0),
      ...budget.map((v) => v || 0),
      1,
    ),
  );

  const W = 720;
  const H = 200;
  const pad = { t: 12, r: 16, b: 28, l: 48 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const n = labels.length;
  const gap = 0.32;
  const slot = plotW / Math.max(n, 1);
  const barW = slot * (1 - gap);

  const yScale = (v: number) => pad.t + plotH - (v / maxY) * plotH;
  const xCenter = (i: number) => pad.l + i * slot + slot / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY);
  const linePoints = budget
    .map((v, i) => `${xCenter(i)},${yScale(v || 0)}`)
    .join(' ');

  return (
    <ChartCard
      title="Actual vs Budget"
      className="is-avb"
      legend={(
        <div className="exco-ot-chart-legend">
          <span><i style={{ background: ACTUAL_COLOR }} /> Actual</span>
          <span><i className="is-line" style={{ background: BUDGET_COLOR }} /> Budget</span>
        </div>
      )}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="exco-ot-chart-svg" role="img" aria-label="Actual vs Budget">
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={yScale(t)}
              y2={yScale(t)}
              className="exco-ot-chart-grid"
            />
            <text x={pad.l - 6} y={yScale(t) + 3} textAnchor="end" className="exco-ot-chart-axis">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {labels.map((lab, i) => {
          const v = actual[i] || 0;
          const x = xCenter(i) - barW / 2;
          const y = yScale(v);
          const h = Math.max(0, pad.t + plotH - y);
          const active = hover === i;
          return (
            <g
              key={`a-${lab}-${i}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <rect
                x={x}
                y={y}
                width={barW}
                height={h}
                rx={2}
                fill={ACTUAL_COLOR}
                opacity={hover == null || active ? 1 : 0.35}
              >
                <title>{`${lab}: Actual ${fmtMoney(v)} · Budget ${fmtMoney(budget[i] || 0)}`}</title>
              </rect>
              <text x={xCenter(i)} y={H - 8} textAnchor="middle" className="exco-ot-chart-xlabel">
                {lab}
              </text>
            </g>
          );
        })}
        <polyline
          points={linePoints}
          fill="none"
          stroke={BUDGET_COLOR}
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {budget.map((v, i) => (
          <circle
            key={`b-${i}`}
            cx={xCenter(i)}
            cy={yScale(v || 0)}
            r={3}
            fill={BUDGET_COLOR}
          />
        ))}
      </svg>
    </ChartCard>
  );
}

function StackedDeptChart({
  title,
  rows,
  kind,
}: {
  title: string;
  rows: ExcoWorkbookOtTrendRow[];
  kind: 'hours' | 'cost';
}) {
  const [hover, setHover] = useState<string | null>(null);
  const data = useMemo(() => buildStacked(rows, kind), [rows, kind]);
  const dataMax = Math.max(...data.map((d) => d.total), 1);
  const pctDataMax = Math.max(...data.map((d) => d.sharePct), 1);
  const maxY = tightMax(dataMax);
  const maxPct = Math.min(100, tightMax(pctDataMax));

  const W = 640;
  const H = 210;
  const pad = { t: 8, r: 34, b: 34, l: 38 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const n = Math.max(data.length, 1);
  const slot = plotW / n;
  const barW = Math.max(slot * 0.82, 10);
  const yScale = (v: number) => pad.t + plotH - (v / maxY) * plotH;
  const pctScale = (p: number) => pad.t + plotH - (p / maxPct) * plotH;
  const xCenter = (i: number) => pad.l + i * slot + slot / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * maxY);
  const pctTicks = [0, 0.5, 1].map((t) => t * maxPct);
  const linePoints = data
    .map((d, i) => `${xCenter(i)},${pctScale(d.sharePct)}`)
    .join(' ');

  if (!data.length) {
    return (
      <ChartCard title={title}>
        <p className="empty-state">Aucune donnée.</p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title={title}
      legend={(
        <div className="exco-ot-chart-legend">
          <span><i className="is-line" style={{ background: PCT_COLOR }} /> Share %</span>
        </div>
      )}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="exco-ot-chart-svg" role="img" aria-label={title}>
        {ticks.map((t) => (
          <g key={`l-${t}`}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={yScale(t)}
              y2={yScale(t)}
              className="exco-ot-chart-grid"
            />
            <text x={pad.l - 6} y={yScale(t) + 3} textAnchor="end" className="exco-ot-chart-axis">
              {fmtAxis(t)}
            </text>
          </g>
        ))}
        {pctTicks.map((t) => (
          <text
            key={`r-${t}`}
            x={W - pad.r + 4}
            y={pctScale(t) + 3}
            textAnchor="start"
            className="exco-ot-chart-axis is-pct"
          >
            {`${Math.round(t)}%`}
          </text>
        ))}
        {data.map((d, i) => {
          let y = pad.t + plotH;
          const x = xCenter(i) - barW / 2;
          const active = hover === d.department;
          return (
            <g
              key={d.department}
              onMouseEnter={() => setHover(d.department)}
              onMouseLeave={() => setHover(null)}
              opacity={hover == null || active ? 1 : 0.35}
            >
              {d.months.map((v, mi) => {
                if (v <= 0) return null;
                const h = (v / maxY) * plotH;
                y -= h;
                return (
                  <rect
                    key={`${d.department}-${mi}`}
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, 0.5)}
                    fill={MONTH_COLORS[mi % MONTH_COLORS.length]}
                  >
                    <title>
                      {`${d.department} · ${OVT_TREND_MONTH_LABELS[mi]}: ${
                        kind === 'cost' ? fmtMoney(v) : fmtHours(v)
                      }`}
                    </title>
                  </rect>
                );
              })}
              <text
                x={xCenter(i)}
                y={H - 10}
                textAnchor="middle"
                className="exco-ot-chart-xlabel is-dept"
              >
                <title>{d.department}</title>
                {shortDept(d.department)}
              </text>
            </g>
          );
        })}
        <polyline
          points={linePoints}
          fill="none"
          stroke={PCT_COLOR}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {data.map((d, i) => (
          <circle
            key={`p-${d.department}`}
            cx={xCenter(i)}
            cy={pctScale(d.sharePct)}
            r={3}
            fill={PCT_COLOR}
          />
        ))}
      </svg>
    </ChartCard>
  );
}

export default function ExcoOtOverviewCharts({
  trendRows,
  actualVsBudget,
}: {
  trendRows: ExcoWorkbookOtTrendRow[];
  actualVsBudget: ExcoWorkbookOtActualVsBudget | null;
}) {
  const monthIndexes = useMemo(() => activeMonthIndexes(trendRows), [trendRows]);

  return (
    <div className="exco-ot-charts-layout">
      {actualVsBudget ? (
        <ActualVsBudgetChart data={actualVsBudget} />
      ) : (
        <ChartCard title="Actual vs Budget" className="is-avb">
          <p className="empty-state">Aucune donnée Actual vs Budget.</p>
        </ChartCard>
      )}

      <div className="exco-ot-charts-dept-block">
        <div className="exco-ot-chart-legend exco-ot-chart-legend-shared" aria-label="Mois">
          {monthIndexes.map((i) => (
            <span key={OVT_TREND_MONTH_LABELS[i]}>
              <i style={{ background: MONTH_COLORS[i] }} />
              {OVT_TREND_MONTH_LABELS[i]}
            </span>
          ))}
        </div>
        <div className="exco-ot-charts-dept-grid">
          <StackedDeptChart title="Value" rows={trendRows} kind="cost" />
          <StackedDeptChart title="Hours" rows={trendRows} kind="hours" />
        </div>
      </div>
    </div>
  );
}
