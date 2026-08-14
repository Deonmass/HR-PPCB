'use client';

import type { ReactNode } from 'react';
import type {
  AuditHrDashboard,
  AuditHrMonthProgress,
  AuditHrOwnerStats,
  AuditHrStatus,
} from '@/lib/audit-hr-types';

const STATUS_COLORS: Record<AuditHrStatus, string> = {
  Closed: '#0f766e',
  'On going': '#94a3b8',
  Overdue: '#1d4ed8',
};

const SEVERITY_COLORS: Record<string, string> = {
  High: '#dc2626',
  Medium: '#ea580c',
  Low: '#64748b',
};

const MONTH_SHORT = [
  'Jan',
  'Fév',
  'Mar',
  'Avr',
  'Mai',
  'Jun',
  'Jul',
  'Aoû',
  'Sep',
  'Oct',
  'Nov',
  'Déc',
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
  if (sweep <= 0) return '';
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

function AuditDonut({
  title,
  items,
  centerValue,
  centerHint,
}: {
  title: string;
  items: Array<{ label: string; count: number; pct: number; color: string }>;
  centerValue: string;
  centerHint?: string;
}): ReactNode {
  const total = items.reduce((s, i) => s + i.count, 0);
  const size = 148;
  const cx = size / 2;
  const cy = size / 2;
  const rOut = 62;
  const rIn = 38;
  let angle = 0;
  const slices =
    total === 0
      ? []
      : items
          .filter((i) => i.count > 0)
          .map((item) => {
            const sweep = (item.count / total) * 360;
            const start = angle;
            const end = angle + sweep;
            angle = end;
            return { ...item, start, end };
          });

  return (
    <div className="audit-hr-chart-card">
      <h3>{title}</h3>
      <div className="audit-hr-donut-layout audit-hr-donut-layout-center">
        <div className="audit-hr-donut-svg-wrap audit-hr-donut-svg-lg">
          <svg viewBox={`0 0 ${size} ${size}`} className="audit-hr-donut-svg" aria-hidden>
            {slices.length === 0 ? (
              <circle
                cx={cx}
                cy={cy}
                r={(rOut + rIn) / 2}
                fill="none"
                stroke="var(--border)"
                strokeWidth={rOut - rIn}
              />
            ) : (
              slices.map((s) => (
                <path
                  key={s.label}
                  d={describeDonutSlice(cx, cy, rOut, rIn, s.start, s.end)}
                  fill={s.color}
                >
                  <title>{`${s.label}: ${s.count} (${s.pct}%)`}</title>
                </path>
              ))
            )}
          </svg>
          <div className="audit-hr-donut-center">
            <strong>{centerValue}</strong>
            {centerHint ? <span>{centerHint}</span> : null}
          </div>
        </div>
        <ul className="audit-hr-donut-legend audit-hr-donut-legend-bottom">
          {items.map((i) => (
            <li key={i.label}>
              <i style={{ background: i.color }} />
              <span>{i.label}</span>
              <strong>
                {i.count}
                {total > 0 ? ` · ${i.pct}%` : ''}
              </strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function OwnerStackedChart({ owners }: { owners: AuditHrOwnerStats[] }): ReactNode {
  const maxTotal = Math.max(...owners.map((o) => o.total), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(maxTotal * t));
  const totals = owners.reduce(
    (acc, o) => ({
      closed: acc.closed + o.closed,
      ongoing: acc.ongoing + o.ongoing,
      overdue: acc.overdue + o.overdue,
      total: acc.total + o.total,
    }),
    { closed: 0, ongoing: 0, overdue: 0, total: 0 },
  );
  const pct = (n: number) => (totals.total ? Math.round((n / totals.total) * 100) : 0);

  return (
    <div className="audit-hr-chart-card audit-hr-owner-chart">
      <div className="audit-hr-chart-head">
        <h3>Répartition par Owner</h3>
        <div className="audit-hr-chart-legend">
          {(Object.keys(STATUS_COLORS) as AuditHrStatus[]).map((s) => (
            <span key={s}>
              <i style={{ background: STATUS_COLORS[s] }} />
              {s}
            </span>
          ))}
        </div>
      </div>
      {!owners.length ? (
        <p className="text-muted audit-hr-empty">Aucune action</p>
      ) : (
        <div className="audit-hr-owner-layout">
          <div className="audit-hr-stack-chart">
            <div className="audit-hr-stack-y">
              {[...ticks].reverse().map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <div className="audit-hr-stack-plot">
              <div className="audit-hr-stack-plot-body">
                <div className="audit-hr-stack-grid" aria-hidden>
                  {ticks.map((t) => (
                    <div key={t} style={{ bottom: `${(t / maxTotal) * 100}%` }} />
                  ))}
                </div>
                <div
                  className="audit-hr-stack-cols"
                  style={{ gridTemplateColumns: `repeat(${owners.length}, minmax(0, 1fr))` }}
                >
                  {owners.map((o) => {
                    const h = `${(o.total / maxTotal) * 100}%`;
                    return (
                      <div key={o.owner} className="audit-hr-stack-col" title={`${o.owner}: ${o.total}`}>
                        <div className="audit-hr-stack-bar" style={{ height: h }}>
                          {o.closed > 0 && (
                            <div
                              className="audit-hr-stack-seg"
                              style={{ flex: o.closed, background: STATUS_COLORS.Closed }}
                              title={`Closed: ${o.closed} (${o.closedPct}%)`}
                            />
                          )}
                          {o.ongoing > 0 && (
                            <div
                              className="audit-hr-stack-seg"
                              style={{ flex: o.ongoing, background: STATUS_COLORS['On going'] }}
                              title={`On going: ${o.ongoing} (${o.ongoingPct}%)`}
                            />
                          )}
                          {o.overdue > 0 && (
                            <div
                              className="audit-hr-stack-seg"
                              style={{ flex: o.overdue, background: STATUS_COLORS.Overdue }}
                              title={`Overdue: ${o.overdue} (${o.overduePct}%)`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div
                className="audit-hr-stack-labels"
                style={{ gridTemplateColumns: `repeat(${owners.length}, minmax(0, 1fr))` }}
              >
                {owners.map((o) => (
                  <span key={`${o.owner}-lbl`} className="audit-hr-stack-label" title={o.owner}>
                    {o.owner}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <aside className="audit-hr-owner-pct">
            <div className="audit-hr-owner-pct-title">% Statuts</div>
            {(
              [
                ['Closed', totals.closed, STATUS_COLORS.Closed],
                ['On going', totals.ongoing, STATUS_COLORS['On going']],
                ['Overdue', totals.overdue, STATUS_COLORS.Overdue],
              ] as const
            ).map(([label, count, color]) => (
              <div key={label} className="audit-hr-owner-pct-row">
                <span>
                  <i style={{ background: color }} />
                  {label}
                </span>
                <strong>{pct(count)}%</strong>
                <div className="audit-hr-owner-pct-bar">
                  <span style={{ width: `${pct(count)}%`, background: color }} />
                </div>
              </div>
            ))}
          </aside>
        </div>
      )}
    </div>
  );
}

function ProgressionHistogram({ rows }: { rows: AuditHrMonthProgress[] }): ReactNode {
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="audit-hr-chart-card audit-hr-progress-chart">
      <h3>Progression cumulative % Closed</h3>
      {!rows.length ? (
        <p className="text-muted audit-hr-empty">Aucune progression</p>
      ) : (
        <div className="audit-hr-prog-chart">
          <div className="audit-hr-prog-y">
            {[...ticks].reverse().map((t) => (
              <span key={t}>{t}%</span>
            ))}
          </div>
          <div className="audit-hr-prog-plot">
            <div className="audit-hr-prog-plot-body">
              <div className="audit-hr-prog-grid" aria-hidden>
                {ticks.map((t) => (
                  <div key={t} style={{ bottom: `${t}%` }} />
                ))}
              </div>
              <div
                className="audit-hr-prog-cols"
                style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
              >
                {rows.map((p) => {
                  const h = `${Math.min(100, Math.max(0, p.closedPct))}%`;
                  return (
                    <div
                      key={p.month}
                      className="audit-hr-prog-col"
                      title={`${p.month}: ${p.closedPct}% (${p.closedCumul} closed)`}
                    >
                      <span className="audit-hr-prog-value">{p.closedPct}%</span>
                      <div className="audit-hr-prog-bar" style={{ height: h }} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div
              className="audit-hr-prog-labels"
              style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}
            >
              {rows.map((p, idx) => (
                <span key={`${p.month}-lbl`} className="audit-hr-prog-label">
                  {MONTH_SHORT[idx] || p.month.slice(5)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function AuditHrDashboardPanels({
  dashboard,
  compact,
}: {
  dashboard: AuditHrDashboard;
  compact?: boolean;
}): ReactNode {
  const statusItems = dashboard.byStatus.map((s) => ({
    label: s.status,
    count: s.count,
    pct: s.pct,
    color: STATUS_COLORS[s.status],
  }));
  const severityItems = dashboard.bySeverity.map((s) => ({
    label: s.severity,
    count: s.count,
    pct: s.pct,
    color: SEVERITY_COLORS[s.severity] || '#64748b',
  }));

  return (
    <div className={`audit-hr-dashboard${compact ? ' is-compact' : ''}`}>
      <div className="audit-hr-kpi-grid">
        <div className="audit-hr-kpi audit-hr-kpi-total">
          <span className="audit-hr-kpi-label">Total</span>
          <strong className="audit-hr-kpi-value">{dashboard.total}</strong>
          <span className="audit-hr-kpi-detail">Points d’audit suivis</span>
        </div>
        <div className="audit-hr-kpi audit-hr-kpi-cumul">
          <span className="audit-hr-kpi-label">% Closed (cumul)</span>
          <strong className="audit-hr-kpi-value">{dashboard.closedPct}%</strong>
          <span className="audit-hr-kpi-detail">
            {dashboard.closed} / {dashboard.total} clôturés
          </span>
        </div>
        <div className="audit-hr-kpi audit-hr-kpi-closed">
          <span className="audit-hr-kpi-label">Closed</span>
          <strong className="audit-hr-kpi-value">{dashboard.closed}</strong>
          <span className="audit-hr-kpi-detail">{dashboard.byStatus[0]?.pct ?? 0}% du total</span>
        </div>
        <div className="audit-hr-kpi audit-hr-kpi-ongoing">
          <span className="audit-hr-kpi-label">On going</span>
          <strong className="audit-hr-kpi-value">{dashboard.ongoing}</strong>
          <span className="audit-hr-kpi-detail">{dashboard.byStatus[1]?.pct ?? 0}% du total</span>
        </div>
        <div className="audit-hr-kpi audit-hr-kpi-overdue">
          <span className="audit-hr-kpi-label">Overdue</span>
          <strong className="audit-hr-kpi-value">{dashboard.overdue}</strong>
          <span className="audit-hr-kpi-detail">{dashboard.byStatus[2]?.pct ?? 0}% du total</span>
        </div>
      </div>

      <div className="audit-hr-charts-top">
        <AuditDonut
          title="Taux par statut"
          items={statusItems}
          centerValue={`${dashboard.closedPct}%`}
          centerHint="closed"
        />
        <AuditDonut
          title="Taux par Niveau"
          items={severityItems}
          centerValue={String(dashboard.total)}
          centerHint="points"
        />
      </div>

      <OwnerStackedChart owners={dashboard.byOwner} />
      <ProgressionHistogram rows={dashboard.progression} />
    </div>
  );
}

export { STATUS_COLORS, SEVERITY_COLORS };
