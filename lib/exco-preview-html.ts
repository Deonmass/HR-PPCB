import type { ExcoMetricValue, ExcoReportPayload } from '@/lib/exco-types';
import {
  buildMouvementsSlideData,
  type ExcoBarSeries,
} from '@/lib/exco-mouvements-slide-data';
import {
  buildOtSlideData,
  buildOtVsLeaveSlideData,
  formatOtHours,
  formatOtHoursShort,
  otChartDeptLabel,
  type ExcoOtSlideData,
  type ExcoOtVsLeaveSlideData,
} from '@/lib/exco-ot-slide-data';
import {
  buildCsrSlideData,
  buildGouvernanceSlideData,
  buildTrainingSlideData,
  type ExcoCsrSlideData,
  type ExcoGouvernanceSlideData,
  type ExcoTrainingSlideData,
} from '@/lib/exco-dashboard-slides-data';
import {
  buildTrendsSlideSections,
  type ExcoTrendTableSection,
} from '@/lib/exco-trends-slide-data';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMetricValue(kpi: ExcoMetricValue): string {
  if (kpi.value == null || kpi.value === '') return '—';
  if (typeof kpi.value === 'number') {
    const n = kpi.value;
    if (kpi.unit === 'USD') {
      const digits = kpi.key === 'leaveCost' ? 2 : 0;
      return n.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
    }
    if (kpi.unit === '%') return `${n}%`;
    if (kpi.unit === 'hrs' || kpi.unit === 'jours' || kpi.unit === 'ans') {
      const unitLabel =
        kpi.unit === 'jours' ? 'days' : kpi.unit === 'ans' ? 'yrs' : 'hrs';
      return `${n.toLocaleString('en-US')} ${unitLabel}`;
    }
    return n.toLocaleString('en-US');
  }
  return String(kpi.value);
}

function formatPrevMetricValue(kpi: ExcoMetricValue): string {
  return formatMetricValue({ ...kpi, value: kpi.prevValue ?? null });
}

function formatDelta(
  deltaPct: number | null | undefined,
  trend?: 'up' | 'down' | '',
): string {
  if (deltaPct == null || !Number.isFinite(deltaPct)) return '• 0% vs prev.';
  const pct = Math.round(deltaPct * 1000) / 10;
  const arrow =
    pct > 0 || trend === 'up' ? '▲' : pct < 0 || trend === 'down' ? '▼' : '•';
  return `${arrow} ${Math.abs(pct)}% vs prev.`;
}

function kpiTrend(kpi: ExcoMetricValue): 'up' | 'down' | '' {
  const cur = typeof kpi.value === 'number' ? kpi.value : null;
  const prev = typeof kpi.prevValue === 'number' ? kpi.prevValue : null;
  if (cur != null && prev != null) {
    if (cur > prev) return 'up';
    if (cur < prev) return 'down';
    return '';
  }
  if (kpi.deltaPct == null || !Number.isFinite(kpi.deltaPct) || kpi.deltaPct === 0) return '';
  return kpi.deltaPct > 0 ? 'up' : 'down';
}

function deltaTone(trend: 'up' | 'down' | ''): string {
  if (trend === 'up') return '#15803d';
  if (trend === 'down') return '#dc2626';
  return '#16161e';
}

function meetingLine(report: ExcoReportPayload): string {
  const n = report.overlays.narrative;
  const title = (n.meetingTitle?.trim() || 'EXCO MEETING').toUpperCase();
  const raw = (n.meetingDate || '').trim();
  let date = raw || '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const d = new Date(`${raw.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      date = d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }
  const place = (n.meetingPlace?.trim() || '—').toUpperCase();
  return `${title} HELD ON ${date.toUpperCase()}, IN ${place}`;
}

/**
 * Groupes KPI Summary (slide unique, 20 cartes = 2 × 2 rangées de 5).
 * Reproduit le layout EXCO demandé.
 */
export const EXCO_KPI_GROUPS: Array<{ title: string; keys: string[] }> = [
  {
    title: 'Headcount & profile',
    keys: [
      'headcount',
      'genderRatio',
      'averageAge',
      'seniority',
      'onboardingSurvey',
      'hires',
      'exits',
      'turnover',
      'attrition',
      'succession',
    ],
  },
  {
    title: 'Cost, productivity & development',
    keys: [
      'leaveBalance',
      'leaveCost',
      'staffCost',
      'overtimeCost',
      'revenuePerEmp',
      'volumePerEmp',
      'trainingCost',
      'trainingHours',
      'climateSurvey',
      'competencyGap',
    ],
  },
];

/** Flat order for PPTX export (same 20 cards). */
export const EXCO_KPI_SUMMARY_KEYS = EXCO_KPI_GROUPS.flatMap((g) => g.keys);

export const EXCO_PREVIEW_TOC = [
  { n: '01', label: 'Summary', hint: 'Highlights · Lowlights · Focus' },
  { n: '02', label: 'KPI Summary', hint: 'Comparison vs previous month' },
  { n: '03', label: 'Trends', hint: 'Financial · Headcount · Gender · Age' },
  { n: '04', label: 'Movements', hint: 'Staff movement · Overtime' },
  { n: '05', label: 'Overtime', hint: 'Overview · Top 15 OT & Leave' },
  { n: '06', label: 'Training', hint: 'Topics · Sessions' },
  { n: '07', label: 'CSR', hint: 'Summary · Breakdowns' },
  { n: '08', label: 'Recruitment', hint: 'Replacements · New positions' },
  { n: '09', label: 'Governance', hint: 'Audit progression' },
  { n: '—', label: 'Thank You', hint: 'Closing slide' },
] as const;

export function groupExcoKpis(
  kpis: ExcoMetricValue[],
): Array<{ title: string; items: ExcoMetricValue[] }> {
  const byKey = new Map(kpis.map((k) => [k.key, k]));
  return EXCO_KPI_GROUPS.map((g) => ({
    title: g.title,
    items: g.keys.map((key) => {
      const found = byKey.get(key);
      if (found) return found;
      return {
        key,
        label: key,
        value: null,
        source: 'empty' as const,
        deltaPct: null,
      };
    }),
  }));
}

function renderCard(kpi: ExcoMetricValue): string {
  const trend = kpiTrend(kpi);
  return `<article class="kpi-card">
  <h3>${esc(kpi.label)}</h3>
  <strong>${esc(formatMetricValue(kpi))}</strong>
  <div class="kpi-foot">
    <span class="delta" style="color:${deltaTone(trend)}">${esc(formatDelta(kpi.deltaPct, trend))}</span>
    <span class="prev" title="Previous month">${esc(formatPrevMetricValue(kpi))}</span>
  </div>
</article>`;
}

function renderTrendTable(section: ExcoTrendTableSection): string {
  const cur = section.currentHeaderIndex;
  const head = section.headers
    .map((h, i) => `<th${i === cur ? ' class="trend-current"' : ''}>${esc(h)}</th>`)
    .join('');
  const body = section.rows
    .map(
      (row) => `<tr>
  <td class="trend-label">${esc(row.label)}</td>
  ${row.cells
    .map((c, i) => {
      const headerIdx = i + 1;
      return `<td${headerIdx === cur ? ' class="trend-current"' : ''}>${esc(c)}</td>`;
    })
    .join('')}
</tr>`,
    )
    .join('');
  return `<div class="trend-block">
  <div class="trend-sep"><span>${esc(section.title)}</span></div>
  <div class="trend-scroll">
    <table class="trend-table">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>
</div>`;
}

function renderBarChart(series: ExcoBarSeries, tone: 'red' | 'black' = 'red'): string {
  const isExits = series.title.toLowerCase().includes('departure');
  const bars = series.items.length
    ? series.items
        .map((it) => {
          const ratio = it.ratioLabel ? esc(it.ratioLabel) : String(it.value);
          if (isExits) {
            return `<div class="mv-bar-block">
  <div class="mv-bar-row">
    <span class="mv-bar-lab">${esc(it.label)}</span>
    <div class="mv-bar-track"><span style="width:${Math.min(100, it.pct)}%"></span></div>
    <span class="mv-bar-val">${it.pct}%</span>
  </div>
  <div class="mv-bar-meta">
    <span class="mv-bar-ratio">${ratio}</span>
  </div>
</div>`;
          }
          return `<div class="mv-bar-row">
  <span class="mv-bar-lab">${esc(it.label)}</span>
  <div class="mv-bar-track"><span style="width:${Math.min(100, it.pct)}%"></span></div>
  <span class="mv-bar-val">${it.pct}%</span>
</div>`;
        })
        .join('')
    : '<p class="mv-empty">—</p>';
  return `<article class="mv-chart tone-${tone}">
  <header>
    <strong>${esc(series.title)}</strong>
    <em>${esc(series.subtitle)}</em>
  </header>
  <div class="mv-bars">${bars}</div>
</article>`;
}

function renderOtVsLeaveSlide(vs: ExcoOtVsLeaveSlideData): string {
  const overviewRows = vs.overviewLines
    .map(
      (l) => `<tr>
  <td class="trend-label">${esc(l.text)}</td>
  <td>${esc(l.value)}</td>
</tr>`,
    )
    .join('') || '<tr><td colspan="2">—</td></tr>';

  const deptRows = vs.deptCross
    .map(
      (r) => `<tr>
  <td>${esc(r.department)}</td>
  <td>${esc(r.hours)}</td>
  <td>${esc(r.cost)}</td>
  <td>${esc(r.leave)}</td>
</tr>`,
    )
    .join('') || '<tr><td colspan="4">—</td></tr>';

  return `<div class="ovl-summary">
  <div class="ovl-banner trend-sep"><span>Overtime vs Leave Balance</span></div>
  <div class="ovl-two">
    <div class="ovl-panel">
      <h3>General Overview — ${esc(vs.periodLabel)}</h3>
      <div class="ovl-table-wrap">
        <table class="trend-table ovl-dept ovl-red ovl-overview-table">
          <thead><tr><th>Indicator</th><th>Value</th></tr></thead>
          <tbody>${overviewRows}</tbody>
        </table>
      </div>
    </div>
    <div class="ovl-panel">
      <h3>Overtime vs Leave Balance per DEPT</h3>
      <div class="ovl-table-wrap">
        <table class="trend-table ovl-dept ovl-red ovl-dept-table">
          <thead><tr><th>DPT</th><th>Hours</th><th>Cost</th><th>Leave</th></tr></thead>
          <tbody>${deptRows}</tbody>
        </table>
      </div>
    </div>
  </div>
</div>`;
}

function renderOtVsLeaveTopsSlide(vs: ExcoOtVsLeaveSlideData): string {
  const empHead = `<tr>
  <th>ID</th><th>Names</th><th>Hrs</th><th>Cost</th><th>Leave</th><th>DPT</th>
</tr>`;
  const empBody = (rows: ExcoOtVsLeaveSlideData['otTop']) =>
    rows
      .map(
        (r, i) => `<tr class="${i < 10 ? 'top10' : ''}">
  <td>${esc(r.id)}</td>
  <td title="${esc(r.name)}">${esc(r.name)}</td>
  <td>${esc(r.hours)}</td>
  <td>${esc(r.cost)}</td>
  <td>${esc(r.leave)}</td>
  <td>${esc(r.department)}</td>
</tr>`,
      )
      .join('') || '<tr><td colspan="6">—</td></tr>';

  return `<div class="ovl-tops">
  <div class="ovl-banner trend-sep"><span>Top 15 — Overtime &amp; Leave Balance</span></div>
  <div class="ovl-two">
    <div class="ovl-panel">
      <h3>Overtime – Top 15 (Top 10 in red)</h3>
      <div class="trend-scroll ovl-scroll">
        <table class="trend-table ovl-emp ovl-red">${empHead}${empBody(vs.otTop)}</table>
      </div>
    </div>
    <div class="ovl-panel">
      <h3>Leave Balance – Top 15 (Top 10 in red)</h3>
      <div class="trend-scroll ovl-scroll">
        <table class="trend-table ovl-emp ovl-red">${empHead}${empBody(vs.leaveTop)}</table>
      </div>
    </div>
  </div>
</div>`;
}

function renderOtSlide(ot: ExcoOtSlideData): string {
  const rows = ot.rows
    .map(
      (r) => `<tr>
  <td class="trend-label">${esc(r.department)}</td>
  <td class="trend-current">${esc(formatOtHours(r.monthHours))}</td>
</tr>`,
    )
    .join('');
  const cols = ot.rows
    .map((r) => {
      const hours = r.monthHours || 0;
      const h = hours > 0
        ? Math.max(3, (hours / ot.maxMonthHours) * 100)
        : 1;
      return `<div class="ot-col">
  <div class="ot-bar-wrap">
    <span class="ot-val">${esc(formatOtHoursShort(r.monthHours))}</span>
    <div class="ot-bar" style="height:${h}%"></div>
  </div>
  <span class="ot-lab" title="${esc(r.department)}">${esc(otChartDeptLabel(r.department))}</span>
</div>`;
    })
    .join('');

  return `<div class="ot-split">
  <div class="ot-left">
    <div class="trend-scroll">
      <table class="trend-table ot-month-table">
        <thead><tr>
          <th>Department</th>
          <th class="trend-current">${esc(ot.monthLabel)}</th>
        </tr></thead>
        <tbody>
          ${rows || '<tr><td colspan="2">—</td></tr>'}
          <tr class="ot-total"><td class="trend-label">Total</td><td class="trend-current">${esc(formatOtHours(ot.totalMonthHours))}</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  <div class="ot-right">
    <div class="ot-chart-head">Overtime — ${esc(ot.monthLabel)} hours per Department</div>
    <div class="ot-chart">${cols || '<p class="mv-empty">—</p>'}</div>
  </div>
</div>`;
}

function renderTrainingSlide(tr: ExcoTrainingSlideData): string {
  const skills = tr.skillBars
    .map(
      (b) => `<div class="tr-skill">
  <div class="tr-skill-lab"><span>${esc(b.label)}</span><strong>${b.pct}%</strong></div>
  <div class="tr-skill-track"><i style="width:${Math.min(100, b.pct)}%"></i></div>
</div>`,
    )
    .join('');
  const costHead = tr.costMonths.map((m) => `<th>${esc(m.label)}</th>`).join('');
  const costHq = tr.costMonths.map((m) => `<td>${esc(m.hq)}</td>`).join('');
  const costPlant = tr.costMonths.map((m) => `<td>${esc(m.plant)}</td>`).join('');
  const covered = (tr.covered.length ? tr.covered : ['—'])
    .slice(0, 20)
    .map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t)}</td></tr>`)
    .join('');
  const upcoming = tr.upcoming.length
    ? tr.upcoming.slice(0, 8).map((t) => `<li>${esc(t)}</li>`).join('')
    : '<li>—</li>';

  return `<div class="tr-dash">
  <div class="tr-top">
    <article class="tr-card tr-budget">
      <h3>Training Budget</h3>
      <strong>${esc(tr.budget)}</strong>
      <p>&gt; ${esc(tr.plantPct)} Plant &nbsp; &gt; ${esc(tr.hqPct)} HQ</p>
      <div class="tr-actual">Actual: <em>${esc(tr.actual)}</em></div>
    </article>
    <article class="tr-card tr-hours">
      <h3>Training Hours</h3>
      <strong>${esc(tr.hoursYtd)}</strong>
      <p>&gt; ${esc(tr.plantPct)} Plant &nbsp; &gt; ${esc(tr.hqPct)} HQ</p>
      <div class="tr-actual dark">Average per Employee: <em>${esc(tr.avgHoursPerEmp)}</em></div>
    </article>
    <article class="tr-card tr-topics">
      <header><span>Topics Covered</span><b>${tr.topicsCount}</b></header>
      ${skills}
    </article>
  </div>
  <div class="tr-mid">
    <div class="tr-cost">
      <h3>COST PER MONTH (USD)</h3>
      <table class="trend-table ovl-red tr-cost-table">
        <thead><tr><th></th>${costHead}</tr></thead>
        <tbody>
          <tr><td class="trend-label">HQ</td>${costHq}</tr>
          <tr><td class="trend-label">Plant</td>${costPlant}</tr>
        </tbody>
      </table>
      <div class="tr-upcoming">
        <h4>Upcoming Training Sessions</h4>
        <ul>${upcoming}</ul>
      </div>
    </div>
    <div class="tr-covered">
      <h3>List of Training Covered</h3>
      <table class="trend-table">${covered}</table>
    </div>
  </div>
</div>`;
}

function renderPieChart(title: string, slices: Array<{ label: string; value: number; color: string }>): string {
  const total = slices.reduce((a, s) => a + s.value, 0);
  if (!total) {
    return `<div class="pie-panel">
  <h3>${esc(title)}</h3>
  <p class="pie-empty">—</p>
</div>`;
  }
  let acc = 0;
  const stops = slices
    .map((s) => {
      const start = (acc / total) * 100;
      acc += s.value;
      const end = (acc / total) * 100;
      return `${s.color} ${start.toFixed(2)}% ${end.toFixed(2)}%`;
    })
    .join(', ');
  const legend = slices
    .map((s) => {
      const pct = Math.round((s.value / total) * 100);
      return `<li><i style="background:${s.color}"></i><span>${esc(s.label)}</span><strong>${s.value} · ${pct}%</strong></li>`;
    })
    .join('');
  return `<div class="pie-panel">
  <h3>${esc(title)}</h3>
  <div class="pie-layout">
    <div class="pie-disc" style="background:conic-gradient(${stops})"><span class="pie-hole" aria-hidden="true"></span></div>
    <ul class="pie-legend">${legend}</ul>
  </div>
</div>`;
}

function renderCsrSummarySlide(csr: ExcoCsrSlideData): string {
  const kpis = csr.kpis
    .map((k) => `<div class="ex-kpi"><span>${esc(k.label)}</span><strong>${esc(k.value)}</strong></div>`)
    .join('');
  return `<div class="dash-body">
  <div class="ex-kpi-row">${kpis}</div>
  <div class="pie-two">
    ${renderPieChart('Breakdown by type', csr.byTypePie)}
    ${renderPieChart('Breakdown by sector', csr.bySecteurPie)}
  </div>
</div>`;
}

function renderGovAuditSlide(gov: ExcoGouvernanceSlideData): string {
  const ticks = [0, 25, 50, 75, 100];
  const bars = gov.progression
    .map((p) => {
      const h = Math.min(100, Math.max(0, p.closedPct));
      const cls = p.isCurrent ? 'gov-prog-col is-current' : 'gov-prog-col';
      const val = p.isFuture ? '' : `${p.closedPct}%`;
      return `<div class="${cls}" title="${esc(p.monthKey)}: ${p.closedPct}%">
  <span class="gov-prog-val">${val}</span>
  <div class="gov-prog-bar" style="height:${h}%"></div>
  <span class="gov-prog-lab">${esc(p.label)}</span>
</div>`;
    })
    .join('');
  const grid = ticks.map((t) => `<div style="bottom:${t}%"></div>`).join('');
  const yLabels = [...ticks].reverse().map((t) => `<span>${t}%</span>`).join('');
  return `<div class="dash-body gov-audit-body">
  <div class="gov-prog-card">
    <h3>Cumulative progression % Closed</h3>
    ${
      gov.progression.length
        ? `<div class="gov-prog-chart">
      <div class="gov-prog-y">${yLabels}</div>
      <div class="gov-prog-plot">
        <div class="gov-prog-grid">${grid}</div>
        <div class="gov-prog-cols">${bars}</div>
      </div>
    </div>`
        : '<p class="pie-empty">Aucune progression</p>'
    }
  </div>
  <aside class="gov-evo">
    <h3>Evolution</h3>
    <p class="gov-evo-kpi"><strong>${gov.auditClosedPct}%</strong> Closed</p>
    <p class="gov-evo-sub">${gov.auditClosed} / ${gov.auditTotal} points</p>
    <p class="gov-evo-txt">${esc(gov.evolutionText)}</p>
  </aside>
</div>`;
}

/**
 * Aperçu slides 16:9 :
 * Cover · Sommaire · Synthèse · KPI Summary · Tendances ×2
 */
export function buildExcoPreviewHtml(report: ExcoReportPayload): string {
  const n = report.overlays.narrative;
  const groups = groupExcoKpis(report.kpiSummary);
  const meeting = meetingLine(report);
  const { slideA, slideB } = buildTrendsSlideSections(report);
  const mv = buildMouvementsSlideData(report);
  const ot = buildOtSlideData(report);
  const otVs = buildOtVsLeaveSlideData(report);
  const training = buildTrainingSlideData(report);
  const csr = buildCsrSlideData(report);
  const gov = buildGouvernanceSlideData(report);

  const tocHtml = EXCO_PREVIEW_TOC.map(
    (item, i) => `<button class="toc-card" type="button">
  <span class="toc-n" style="background:${i % 2 === 0 ? '#e30613' : '#0a0a0a'}">${item.n}</span>
  <span class="toc-txt">
    <strong>${esc(item.label)}</strong>
    <em>${esc(item.hint)}</em>
  </span>
</button>`,
  ).join('');

  const kpiBody = groups
    .map(
      (g) => `<div class="kpi-block">
  <div class="kpi-sep"><span>${esc(g.title)}</span></div>
  <div class="kpi-grid">${g.items.map(renderCard).join('')}</div>
</div>`,
    )
    .join('');

  const trendsA = slideA.map(renderTrendTable).join('');
  const trendsB = slideB.map(renderTrendTable).join('');
  const mvStaff = `${renderTrendTable(mv.inOut)}
<div class="mv-charts">
  ${renderBarChart(mv.ageChart, 'red')}
  ${renderBarChart(mv.seniorityChart, 'black')}
  ${renderBarChart(mv.exitsChart, 'red')}
</div>`;
  const otHtml = renderOtSlide(ot);
  const otVsHtml = renderOtVsLeaveSlide(otVs);
  const otVsTopsHtml = renderOtVsLeaveTopsSlide(otVs);
  const trainingHtml = renderTrainingSlide(training);
  const csrHtml = renderCsrSummarySlide(csr);
  const govAuditHtml = renderGovAuditSlide(gov);

  const repl = (report.overlays.recruitment || []).filter((r) => r.category === 'replacement').slice(0, 7);
  const neu = (report.overlays.recruitment || []).filter((r) => r.category === 'new').slice(0, 8);
  const recruitRows = (rows: typeof repl) =>
    rows
      .map(
        (r) =>
          `<tr><td>${esc(r.position || '')}</td><td>${esc(r.grade || '')}</td><td>${esc(r.status || '')}</td><td>${esc(r.department || '')}</td><td>${esc(r.location || '')}</td></tr>`,
      )
      .join('') || '<tr><td colspan="5">—</td></tr>';
  const recruitHtml = `<div class="dash-body recruit-body">
  <h3 class="recruit-h">1. Replacements</h3>
  <table class="trend-table ovl-red"><thead><tr><th>Position</th><th>Grade</th><th>Status</th><th>Dept</th><th>Loc</th></tr></thead><tbody>${recruitRows(repl)}</tbody></table>
  <h3 class="recruit-h">2. New positions</h3>
  <table class="trend-table ovl-red"><thead><tr><th>Position</th><th>Grade</th><th>Status</th><th>Dept</th><th>Loc</th></tr></thead><tbody>${recruitRows(neu)}</tbody></table>
</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>EXCO Preview — ${esc(report.periodLabel)}</title>
<style>
  :root {
    --red: #e30613;
    --ink: #16161e;
    --muted: #6b6b7a;
    --line: #e5e5ea;
    --panel: #f4f4f7;
    --white: #fff;
    --black: #0a0a0a;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 16px;
    font-family: 'Segoe UI', Calibri, sans-serif;
    background: #cfcfd6;
    color: var(--ink);
  }
  .deck {
    display: grid;
    grid-template-columns: 1fr;
    gap: 18px;
    max-width: 1180px;
    margin: 0 auto;
  }
  @media (min-width: 1100px) {
    .deck { grid-template-columns: 1fr 1fr; max-width: 1480px; }
  }

  .slide {
    width: 100%;
    aspect-ratio: 16 / 9;
    background: var(--panel);
    border-radius: 3px;
    box-shadow: 0 6px 22px rgba(0,0,0,.16);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .slide-white { background: #e8e8ec; }
  .slide-white .body {
    background: #fff;
    border-radius: 8px;
    margin: 0 8px 6px;
    border: 1px solid var(--line);
  }
  .ovl-emp tr.top10 td { background: #f8d0d3 !important; color: #b0050f; font-weight: 700; }
  .bar-top { height: 4px; background: var(--red); flex: 0 0 auto; }
  .bar-bot {
    height: 8px; background: var(--black); flex: 0 0 auto;
  }
  .head {
    display: flex; align-items: center; gap: 7px;
    padding: 4px 12px 2px; flex: 0 0 auto; background: transparent;
    min-height: 28px;
  }
  .badge {
    width: 24px; height: 24px; border-radius: 4px; background: var(--red);
    color: #fff; font-size: 10px; font-weight: 700;
    display: grid; place-items: center; flex: 0 0 auto;
  }
  .head-txt {
    display: flex; flex-direction: column; justify-content: center;
    gap: 0; min-height: 24px; line-height: 1.05;
  }
  .brand { margin: 0; color: var(--red); font-size: 7px; font-weight: 700; letter-spacing: .02em; }
  .head h1 { margin: 0; font-size: 13px; line-height: 1.1; font-weight: 800; }
  .head .period { margin-left: auto; color: var(--muted); font-size: 10px; align-self: center; }
  .body { flex: 1; min-height: 0; padding: 2px 12px 6px; overflow: hidden; }

  /* Cover */
  .cover .body {
    padding: 0; display: flex; flex-direction: column; align-items: center;
    justify-content: flex-start; background: var(--white); position: relative; overflow: hidden;
  }
  .cover-deco-tl {
    position: absolute; left: -70px; top: -80px; width: 220px; height: 220px;
    border-radius: 50%; background: #e8e8ec; pointer-events: none;
  }
  .cover-deco-bot {
    position: absolute; left: 50%; bottom: -90px; transform: translateX(-50%);
    width: 180px; height: 180px; border-radius: 50%; background: #d8d8de; pointer-events: none;
  }
  .cover-banner {
    position: relative; z-index: 1;
    width: 90%; max-width: 920px; margin-top: 28px;
    display: block;
  }
  .cover-meet {
    position: relative; z-index: 1;
    display: flex; align-items: center; justify-content: center; gap: 10px;
    margin-top: 56px; max-width: 92%;
  }
  .cover-badge {
    width: 18px; height: 18px; flex: 0 0 auto; display: block;
  }
  .cover-meet p {
    margin: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.02em;
    color: #0a0a0a; font-family: Arial, Helvetica, sans-serif;
  }
  .cover-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--red); flex: 0 0 auto; }
  .cover-period { color: var(--muted); font-size: 11px; }

  /* Sommaire */
  .toc-grid {
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(5, 1fr);
    gap: 7px;
  }
  .toc-card {
    display: flex; align-items: center; gap: 8px;
    border: 1px solid var(--line); border-radius: 6px;
    background: var(--white); padding: 0 8px; text-align: left;
  }
  .toc-n {
    width: 28px; height: 22px; border-radius: 4px; color: #fff;
    font-size: 10px; font-weight: 700; display: grid; place-items: center; flex: 0 0 auto;
  }
  .toc-txt { display: flex; flex-direction: column; min-width: 0; }
  .toc-txt strong { font-size: 12px; line-height: 1.1; }
  .toc-txt em { font-style: normal; color: var(--muted); font-size: 9px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Synthèse */
  .synth {
    height: 100%;
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;
  }
  .panel {
    border: 1px solid var(--line); border-radius: 8px; background: var(--white);
    padding: 8px 10px; min-height: 0; overflow: hidden;
  }
  .panel h2 { margin: 0 0 6px; color: var(--red); font-size: 12px; }
  .panel p { margin: 0; font-size: 11px; line-height: 1.3; white-space: pre-wrap; overflow: hidden; }

  /* KPI Summary — 2 blocs × grille 5 colonnes (20 cartes) */
  .kpi-body {
    height: 100%;
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: 6px;
  }
  .kpi-block {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .kpi-sep {
    display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
  }
  .kpi-sep::before, .kpi-sep::after {
    content: ''; flex: 1; height: 1px; background: #cfcfd6;
  }
  .kpi-sep span {
    font-size: 9px; font-weight: 700; letter-spacing: .04em;
    text-transform: none; color: var(--muted); white-space: nowrap;
  }
  .kpi-grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    grid-template-rows: 1fr 1fr;
    gap: 6px;
  }
  .kpi-card {
    position: relative;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 7px 5px 9px;
    background: var(--white);
    display: flex; flex-direction: column; justify-content: space-between;
    min-height: 0;
    box-shadow: 0 1px 3px rgba(0,0,0,.04);
  }
  .kpi-card::before {
    content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
    background: var(--red); border-radius: 6px 0 0 6px;
  }
  .kpi-card h3 {
    margin: 0; color: var(--red); font-size: 9px; font-weight: 700;
    line-height: 1.15;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .kpi-card strong {
    font-size: 13px; line-height: 1.15; font-weight: 800;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .kpi-foot {
    display: flex; align-items: baseline; justify-content: space-between; gap: 4px;
    min-width: 0;
  }
  .kpi-card .delta { font-size: 7px; font-weight: 400; flex: 1; min-width: 0; }
  .kpi-card .prev {
    font-size: 7px; font-weight: 400; color: var(--muted);
    text-align: right; white-space: nowrap; flex: 0 0 auto; max-width: 55%;
    overflow: hidden; text-overflow: ellipsis;
  }

  /* Tendances — 2 blocs par slide */
  .trend-body {
    height: 100%;
    display: grid;
    grid-template-rows: 1fr 1fr;
    gap: 6px;
  }
  .trend-block {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .trend-sep {
    display: flex; align-items: center; gap: 8px; flex: 0 0 auto;
  }
  .trend-sep::before, .trend-sep::after {
    content: ''; flex: 1; height: 1px; background: #cfcfd6;
  }
  .trend-sep span {
    font-size: 9px; font-weight: 700; color: var(--muted); white-space: nowrap;
  }
  .trend-scroll {
    flex: 1; min-height: 0; overflow: auto;
    border: 1px solid var(--line); border-radius: 6px; background: var(--white);
  }
  .trend-table {
    width: 100%; border-collapse: collapse; table-layout: fixed;
    font-size: 7.5px;
  }
  .trend-table th {
    background: var(--black); color: #fff; font-weight: 700;
    padding: 3px 2px; text-align: center; white-space: nowrap;
  }
  .trend-table th:first-child,
  .trend-table td.trend-label {
    text-align: left; padding-left: 6px; width: 16%;
  }
  .trend-table td.trend-label {
    font-weight: 700;
    color: var(--ink);
  }
  .trend-table td {
    padding: 3px 2px; text-align: center; border-bottom: 1px solid var(--line);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .trend-table tbody tr:nth-child(even) td { background: var(--panel); }
  .trend-table th.trend-current {
    background: var(--red);
  }
  .trend-table td.trend-current {
    background: #fce8e9 !important;
    font-weight: 700;
    color: var(--ink);
  }

  /* Mouvements — tables + bar charts */
  .mv-body {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
  .mv-body .trend-block { flex: 0 0 auto; }
  .mv-body .trend-scroll { max-height: 110px; }
  .mv-charts {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }
  .mv-chart {
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--white);
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .mv-chart header {
    padding: 4px 6px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .mv-chart.tone-red header { background: var(--red); }
  .mv-chart.tone-black header { background: var(--black); }
  .mv-chart header strong {
    color: #fff; font-size: 9px; line-height: 1.1;
  }
  .mv-chart header em {
    color: #f5e6a8; font-style: normal; font-size: 8px;
  }
  .mv-bars {
    flex: 1; min-height: 0; overflow: auto;
    padding: 4px 6px;
    display: flex; flex-direction: column; gap: 3px;
  }
  .mv-bar-row {
    display: grid;
    grid-template-columns: 52px 1fr 28px;
    gap: 4px;
    align-items: center;
  }
  .mv-bar-lab {
    font-size: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .mv-bar-track {
    height: 7px; background: #ececf0; border-radius: 2px; overflow: hidden;
  }
  .mv-bar-track span {
    display: block; height: 100%; background: var(--red);
  }
  .mv-chart.tone-black .mv-bar-track span { background: #6b6b7a; }
  .mv-bar-val { font-size: 7px; font-weight: 700; text-align: right; }
  .mv-bar-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-bottom: 4px;
    border-bottom: 1px solid #f0f0f3;
  }
  .mv-bar-block:last-child { border-bottom: none; }
  .mv-bar-meta {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
    padding: 0;
    font-size: 6px;
    font-weight: 400;
  }
  .mv-bar-ratio {
    color: var(--muted);
    text-align: right;
    font-weight: 400;
    white-space: nowrap;
  }
  .mv-empty { margin: 12px; text-align: center; color: var(--muted); font-size: 11px; }

  /* OT slide — liste mois | graphique */
  .ot-split {
    height: 100%;
    display: grid;
    grid-template-columns: 0.9fr 1.6fr;
    grid-template-rows: 1fr;
    gap: 8px;
    min-height: 0;
    align-items: stretch;
  }
  .ot-chart-head {
    background: var(--black);
    color: #fff;
    font-size: 9px;
    font-weight: 700;
    padding: 4px 8px;
    flex: 0 0 auto;
  }
  .ot-left, .ot-right {
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--white);
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
  }
  .ot-left .trend-scroll { flex: 1; max-height: none; }
  .ot-month-table { height: 100%; }
  .ot-month-table th,
  .ot-month-table td {
    padding-top: 7px !important;
    padding-bottom: 7px !important;
  }
  .ot-month-table th:first-child,
  .ot-month-table td.trend-label { width: auto; }
  .ot-month-table th:last-child,
  .ot-month-table td:last-child {
    width: 72px;
    max-width: 72px;
  }
  .ot-month-table td.trend-label {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ot-total td { background: var(--black) !important; color: #fff; font-weight: 700; }
  .ot-total td.trend-current { background: var(--black) !important; color: #fff; }
  .ot-right {
    overflow: hidden;
    background: var(--white);
  }
  .ot-chart {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: stretch;
    gap: 2px;
    padding: 6px 4px 4px;
  }
  .ot-col {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: 3px;
  }
  .ot-bar-wrap {
    flex: 1;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    min-height: 48px;
  }
  .ot-val {
    font-size: 7px;
    font-weight: 700;
    color: var(--ink);
    line-height: 1.1;
    margin-bottom: 2px;
    white-space: nowrap;
  }
  .ot-bar {
    width: 88%;
    min-height: 2px;
    background: #5a5a66;
    border-radius: 2px 2px 0 0;
  }
  .ot-lab {
    font-size: 8px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    max-width: 100%;
    text-align: center;
    line-height: 1.15;
  }

  .slide-thanks {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
  }
  .thanks-panel {
    background: var(--white);
    border-radius: 10px;
    padding: 36px 48px;
    text-align: center;
    width: min(72%, 520px);
    box-shadow: 0 1px 0 rgba(0,0,0,.04);
  }
  .thanks-panel .brand {
    color: var(--red);
    font-size: 11px;
    font-weight: 700;
    margin: 0 0 10px;
    letter-spacing: .04em;
  }
  .thanks-panel h1 {
    margin: 0;
    font-size: 42px;
    font-weight: 800;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .thanks-rule {
    width: 48px;
    height: 3px;
    background: var(--red);
    margin: 14px auto 12px;
  }
  .thanks-en {
    margin: 0;
    font-size: 16px;
    color: var(--muted);
  }
  .thanks-panel .period {
    margin: 14px 0 0;
    font-size: 13px;
    color: var(--ink);
    font-weight: 600;
  }

  /* Overtime vs Leave — 2 slides × 2 colonnes */
  .ovl-summary, .ovl-tops {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
  .ovl-banner {
    flex: 0 0 auto;
    margin: 0;
    color: var(--ink);
  }
  .ovl-banner.trend-sep span {
    font-size: 11px;
    font-weight: 700;
    color: var(--ink);
  }
  .ovl-two {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .ovl-panel {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 6px 8px;
    background: var(--white);
    overflow: hidden;
  }
  .ovl-panel h3 {
    margin: 0;
    font-size: 10px;
    font-weight: 700;
    color: var(--red);
    flex: 0 0 auto;
  }
  .ovl-table-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .ovl-summary .trend-table {
    table-layout: auto;
    width: 100%;
    height: 100%;
    font-size: 9px;
  }
  .ovl-summary .trend-table th,
  .ovl-summary .trend-table td {
    padding: 4px 6px;
    white-space: nowrap;
    overflow: visible;
    text-overflow: clip;
    word-break: normal;
  }
  .ovl-summary .trend-table th:first-child,
  .ovl-summary .trend-table td.trend-label,
  .ovl-summary .trend-table td:first-child {
    width: auto;
    text-align: left;
  }
  .ovl-overview-table td.trend-label {
    font-weight: 700;
    color: var(--ink);
  }
  .ovl-overview-table td:last-child {
    text-align: right;
    font-weight: 700;
    color: var(--red);
  }
  .ovl-dept-table td:first-child {
    text-align: left;
    font-weight: 600;
  }
  .ovl-dept-table td:not(:first-child) {
    text-align: right;
  }
  .ovl-scroll { flex: 1; max-height: none; border: none; overflow: hidden; }
  .ovl-emp { font-size: 7.5px; table-layout: fixed; width: 100%; }
  .ovl-emp th, .ovl-emp td {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding-top: 3px !important;
    padding-bottom: 3px !important;
  }
  .ovl-emp th:nth-child(1), .ovl-emp td:nth-child(1) { width: 14%; }
  .ovl-emp th:nth-child(2), .ovl-emp td:nth-child(2) { width: 28%; text-align: left; padding-left: 4px; }
  .trend-table.ovl-red th { background: var(--red); }

  /* Training / CSR / Gouvernance */
  .dash-body { height: 100%; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .ex-kpi-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(90px, 1fr)); gap: 6px; flex: 0 0 auto; }
  .ex-kpi {
    border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px;
    background: var(--white); display: flex; flex-direction: column; gap: 2px;
  }
  .ex-kpi span { font-size: 8px; color: var(--muted); font-weight: 700; }
  .ex-kpi strong { font-size: 14px; color: var(--ink); }
  .tr-dash { height: 100%; display: flex; flex-direction: column; gap: 5px; min-height: 0; }
  .tr-top { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; flex: 0 0 auto; }
  .tr-card { border-radius: 6px; padding: 6px 8px; min-height: 78px; color: #fff; }
  .tr-budget { background: #4a4a55; }
  .tr-hours { background: var(--red); }
  .tr-topics { background: var(--white); color: var(--ink); border: 1px solid var(--line); padding: 0; overflow: hidden; }
  .tr-topics header {
    background: var(--red); color: #fff; display: flex; justify-content: space-between;
    padding: 4px 8px; font-size: 10px; font-weight: 700;
  }
  .tr-card h3 { margin: 0; font-size: 10px; }
  .tr-card strong { display: block; font-size: 16px; margin: 4px 0; }
  .tr-card p { margin: 0; font-size: 8px; opacity: .95; }
  .tr-actual {
    margin-top: 6px; background: #fff; border-radius: 4px; padding: 3px 6px;
    color: var(--ink); font-size: 9px; font-weight: 700;
  }
  .tr-actual em { color: var(--red); font-style: normal; }
  .tr-actual.dark em { color: var(--ink); }
  .tr-skill { padding: 3px 8px; }
  .tr-skill-lab { display: flex; justify-content: space-between; font-size: 8px; margin-bottom: 2px; }
  .tr-skill-track { height: 6px; background: #ececf0; border-radius: 2px; overflow: hidden; }
  .tr-skill-track i { display: block; height: 100%; background: #6b6b7a; }
  .tr-mid { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.55fr 1fr; gap: 6px; }
  .tr-cost, .tr-covered {
    border: 1px solid var(--line); border-radius: 6px; padding: 5px 6px;
    display: flex; flex-direction: column; gap: 4px; min-height: 0; overflow: hidden;
  }
  .tr-cost h3, .tr-covered h3 { margin: 0; font-size: 10px; font-weight: 700; }
  .tr-covered h3 { background: var(--red); color: #fff; padding: 3px 6px; border-radius: 3px; }
  .tr-cost-table { font-size: 6.5px; }
  .tr-upcoming { margin-top: auto; border-top: 1px solid var(--line); padding-top: 4px; }
  .tr-upcoming h4 { margin: 0 0 2px; font-size: 9px; background: var(--black); color: #fff; padding: 3px 6px; }
  .tr-upcoming ul { margin: 0; padding-left: 14px; font-size: 8px; }
  .tr-covered table { font-size: 7.5px; }
  .tr-full { font-size: 8px; flex: 1; }
  .pol-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; height: 100%; }
  .pol-card {
    border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
    display: flex; flex-direction: column; background: var(--white);
  }
  .pol-card header { background: var(--red); color: #fff; padding: 6px; font-size: 9px; font-weight: 700; }
  .pol-card p { margin: 4px 8px; font-size: 10px; }
  .pol-card p strong { color: var(--red); }
  .pol-card ul { margin: 0; padding: 0 8px 8px 18px; font-size: 8px; overflow: hidden; flex: 1; }

  /* CSR pies + Audit progression */
  .pie-two { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .pie-panel {
    border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px;
    display: flex; flex-direction: column; gap: 8px; min-height: 0; background: var(--white);
  }
  .pie-panel h3 { margin: 0; font-size: 11px; color: var(--red); font-weight: 700; }
  .pie-empty { margin: auto; color: var(--muted); font-size: 12px; }
  .pie-layout { flex: 1; display: grid; grid-template-columns: 1.1fr 1fr; gap: 8px; align-items: center; min-height: 0; }
  .pie-disc {
    position: relative;
    width: min(100%, 170px); aspect-ratio: 1; border-radius: 50%;
    margin: 0 auto; border: 1px solid var(--line);
  }
  .pie-hole {
    position: absolute; inset: 26%;
    border-radius: 50%; background: #fff;
    border: 1px solid var(--line);
    box-shadow: 0 0 0 1px rgba(0,0,0,.03);
  }
  .pie-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  .pie-legend li {
    display: grid; grid-template-columns: 10px 1fr auto; gap: 6px; align-items: center;
    font-size: 9px; color: var(--ink);
  }
  .pie-legend i { width: 10px; height: 10px; border-radius: 2px; display: block; }
  .pie-legend strong { font-size: 9px; color: var(--muted); font-weight: 700; }

  .gov-audit-body { display: grid; grid-template-columns: 1.7fr 1fr; gap: 10px; height: 100%; min-height: 0; }
  .gov-prog-card {
    border: 1px solid var(--line); border-radius: 6px; padding: 8px 10px 6px;
    display: flex; flex-direction: column; min-height: 0; background: var(--white);
  }
  .gov-prog-card h3 { margin: 0 0 6px; font-size: 12px; font-weight: 700; color: var(--ink); }
  .gov-prog-chart { flex: 1; min-height: 0; display: grid; grid-template-columns: 28px 1fr; gap: 4px; }
  .gov-prog-y {
    display: flex; flex-direction: column; justify-content: space-between;
    font-size: 8px; color: var(--muted); padding-bottom: 16px;
  }
  .gov-prog-plot { position: relative; min-height: 0; display: flex; flex-direction: column; }
  .gov-prog-grid {
    position: absolute; inset: 0 0 16px 0; pointer-events: none;
  }
  .gov-prog-grid > div {
    position: absolute; left: 0; right: 0; border-top: 1px dashed #d8d8e0;
  }
  .gov-prog-cols {
    flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(12, minmax(0, 1fr));
    align-items: end; gap: 4px; padding-bottom: 16px; position: relative; z-index: 1;
  }
  .gov-prog-col {
    height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
    gap: 2px; position: relative;
  }
  .gov-prog-val { font-size: 7px; font-weight: 700; color: var(--ink); line-height: 1; min-height: 8px; }
  .gov-prog-bar {
    width: 70%; max-width: 28px; min-height: 0;
    background: linear-gradient(180deg, #14b8a6, #0d9488);
    border-radius: 3px 3px 0 0;
  }
  .gov-prog-col.is-current .gov-prog-val { color: var(--ink); }
  .gov-prog-lab {
    position: absolute; bottom: -14px; left: 0; right: 0; text-align: center;
    font-size: 8px; color: var(--muted);
  }
  .gov-prog-col.is-current .gov-prog-lab { color: var(--ink); font-weight: 700; }
  .gov-evo {
    border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px;
    background: var(--panel, #f7f7fa); display: flex; flex-direction: column; gap: 6px; min-height: 0;
  }
  .gov-evo h3 { margin: 0; font-size: 12px; color: var(--red); font-weight: 700; }
  .gov-evo-kpi { margin: 0; font-size: 12px; color: var(--muted); }
  .gov-evo-kpi strong { font-size: 22px; color: var(--ink); margin-right: 4px; }
  .gov-evo-sub { margin: 0; font-size: 11px; color: var(--muted); }
  .gov-evo-txt { margin: 4px 0 0; font-size: 11px; line-height: 1.45; color: var(--ink); }
  .recruit-body { gap: 6px; }
  .recruit-h { margin: 4px 0 2px; font-size: 12px; color: var(--red); font-weight: 700; }
</style>
</head>
<body>
<div class="deck">

  <section class="slide slide-white cover">
    <div class="body">
      <span class="cover-deco-tl" aria-hidden="true"></span>
      <span class="cover-deco-bot" aria-hidden="true"></span>
      <img class="cover-banner" src="/exco/cover-banner.png" alt="PPC" />
      <div class="cover-meet">
        <img class="cover-badge" src="/exco/cover-badge.png" alt="" />
        <p>${esc(meeting)}</p>
      </div>
    </div>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">☰</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>Agenda</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body"><div class="toc-grid">${tocHtml}</div></div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">01</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>Summary</h1></div>
      <span class="period">${esc(report.prevPeriodLabel)} → ${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      <div class="synth">
        <article class="panel"><h2>Highlights</h2><p>${esc(n.highlights?.trim() || '—')}</p></article>
        <article class="panel"><h2>Lowlights</h2><p>${esc(n.lowlights?.trim() || '—')}</p></article>
        <article class="panel"><h2>Focus</h2><p>${esc(n.focus?.trim() || '—')}</p></article>
      </div>
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">02</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>KPI Summary</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      <div class="kpi-body">${kpiBody}</div>
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">03</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>HR KPI — Trends</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      <div class="trend-body">${trendsA}</div>
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">03</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>HR KPI — Trends</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      <div class="trend-body">${trendsB}</div>
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">04</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>HR KPI AND DIVERSITY</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      <div class="mv-body">${mvStaff}</div>
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">04</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>OVERTIME — Hours</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      ${otHtml}
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">05</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>Overtime vs Leave Balance</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      ${otVsHtml}
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">05</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>Top 15 — OT &amp; Leave</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">
      ${otVsTopsHtml}
    </div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">06</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>Training Dashboard</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">${trainingHtml}</div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">07</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>CSR &amp; Specifications</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">${csrHtml}</div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">08</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>Recruitment</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">${recruitHtml}</div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-white">
    <div class="bar-top"></div>
    <header class="head">
      <span class="badge">09</span>
      <div class="head-txt"><p class="brand">PPC · HR EXCO</p><h1>Governance — Audit</h1></div>
      <span class="period">${esc(report.periodLabel)}</span>
    </header>
    <div class="body">${govAuditHtml}</div>
    <footer class="bar-bot"></footer>
  </section>

  <section class="slide slide-thanks">
    <div class="bar-top"></div>
    <div class="thanks-panel">
      <p class="brand">PPC · HR EXCO</p>
      <h1>Thank You</h1>
      <div class="thanks-rule"></div>
      <p class="period">${esc(report.periodLabel)}</p>
    </div>
    <footer class="bar-bot"></footer>
  </section>

</div>
</body>
</html>`;
}
