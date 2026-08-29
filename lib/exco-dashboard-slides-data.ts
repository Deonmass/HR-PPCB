import type { ExcoReportPayload } from '@/lib/exco-types';
import { excoFyColumns } from '@/lib/exco-trends-slide-data';

function money(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function num(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export type ExcoTrainingSlideData = {
  periodLabel: string;
  budget: string;
  actual: string;
  plantPct: string;
  hqPct: string;
  hoursYtd: string;
  avgHoursPerEmp: string;
  topicsCount: number;
  skillBars: Array<{ label: string; pct: number }>;
  costMonths: Array<{ label: string; hq: string; plant: string; hqN: number; plantN: number }>;
  upcoming: string[];
  covered: string[];
};

export function buildTrainingSlideData(report: ExcoReportPayload): ExcoTrainingSlideData {
  const mk = report.overlays.manualKpis;
  const hc = report.computed.headcount || 0;
  const hours = mk.trainingHours ?? null;
  const avg =
    hours != null && hc > 0 ? Math.round((hours / hc) * 10) / 10 : null;

  const plantPct = mk.trainingPlantPct ?? null;
  const hqPct = mk.trainingHqPct ?? null;
  const covered = (report.overlays.trainingTopics || [])
    .map((t) => t.title?.trim())
    .filter(Boolean) as string[];
  const upcoming = (report.overlays.upcomingTrainings || [])
    .map((t) => t.title?.trim())
    .filter(Boolean) as string[];

  const skillBars = [
    { label: 'Technical Skills (Hours)', pct: mk.technicalSkillsHoursPct ?? 0 },
    { label: 'Soft Skills (Hours)', pct: mk.softSkillsHoursPct ?? 0 },
    { label: 'Safety Topics (Hours)', pct: mk.safetyTopicsHoursPct ?? 0 },
  ].map((s) => ({
    ...s,
    pct: s.pct != null && Number.isFinite(s.pct) ? Math.round(s.pct * 100) / 100 : 0,
  }));

  const fyCols = excoFyColumns(report.year, report.month);
  const fin = report.overlays.financeByMonth || {};
  const costMonths = fyCols.map((c) => {
    if (!c.visible || c.year !== report.year) {
      return { label: c.label, hq: '', plant: '', hqN: 0, plantN: 0 };
    }
    const snap = fin[String(c.month)];
    const total = snap?.trainingCost ?? null;
    if (total == null || !Number.isFinite(total)) {
      return { label: c.label, hq: '', plant: '', hqN: 0, plantN: 0 };
    }
    const hqShare = (hqPct ?? 0) / 100;
    const plantShare = (plantPct ?? 0) / 100;
    const hqN = Math.round(total * hqShare * 100) / 100;
    const plantN = Math.round(total * plantShare * 100) / 100;
    return {
      label: c.label,
      hq: money(hqN, 2),
      plant: money(plantN, 2),
      hqN,
      plantN,
    };
  });

  return {
    periodLabel: report.periodLabel,
    budget: money(mk.trainingBudget, 0),
    actual: money(mk.trainingCost, 2),
    plantPct: plantPct != null ? `${Number(plantPct).toFixed(2)} %` : '—',
    hqPct: hqPct != null ? `${Number(hqPct).toFixed(2)} %` : '—',
    hoursYtd: hours != null ? `${num(hours, 0)} Hours YTD` : '—',
    avgHoursPerEmp: avg != null ? `${avg} Hours` : '—',
    topicsCount: covered.length,
    skillBars,
    costMonths,
    upcoming,
    covered,
  };
}

const PIE_COLORS = [
  '#E30613',
  '#0D9488',
  '#0A0A0A',
  '#64748B',
  '#B45309',
  '#1D4ED8',
  '#7C3AED',
  '#BE185D',
];

const MONTH_SHORT_EN = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_LONG_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export type ExcoPieSlice = {
  label: string;
  value: number;
  color: string;
};

export type ExcoCsrSlideData = {
  periodLabel: string;
  kpis: Array<{ label: string; value: string }>;
  byTypePie: ExcoPieSlice[];
  bySecteurPie: ExcoPieSlice[];
};

export function buildCsrSlideData(report: ExcoReportPayload): ExcoCsrSlideData {
  const sum = report.computed.csrSummary;
  const byTypePie = (sum.byType || [])
    .filter((r) => Number(r.value) > 0)
    .map((r, i) => ({
      label: r.label || '—',
      value: Number(r.value) || 0,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  const bySecteurPie = (sum.bySecteur || [])
    .filter((r) => Number(r.total) > 0)
    .map((r, i) => ({
      label: r.label || '—',
      value: Number(r.total) || 0,
      color: PIE_COLORS[i % PIE_COLORS.length],
    }));
  return {
    periodLabel: report.periodLabel,
    kpis: [
      { label: 'Projects', value: String(sum.total) },
      { label: 'In progress', value: String(sum.enCours) },
      { label: 'Completed', value: String(sum.termines) },
      { label: 'Not started', value: String(sum.nonDebutes) },
      { label: 'Budget planned', value: money(sum.budgetPrevu, 0) },
      { label: 'Budget spent', value: money(sum.budgetDepense, 0) },
    ],
    byTypePie,
    bySecteurPie,
  };
}

export type ExcoAuditProgressPoint = {
  monthKey: string;
  label: string;
  closedPct: number;
  closedCumul: number;
  /** Mois du rapport (barre rouge). */
  isCurrent: boolean;
  /** Mois après le rapport (forcé à 0). */
  isFuture: boolean;
};

export type ExcoGouvernanceSlideData = {
  periodLabel: string;
  auditTotal: number;
  auditClosed: number;
  auditClosedPct: number;
  reportMonth: number;
  progression: ExcoAuditProgressPoint[];
  evolutionText: string;
};

function buildAuditEvolutionText(
  progression: ExcoAuditProgressPoint[],
  reportMonth: number,
  auditTotal: number,
  auditClosed: number,
): string {
  if (!progression.length || auditTotal <= 0) {
    return 'No audit progression data available for this period. Import or enter audit points to track cumulative % Closed.';
  }

  const idx = Math.min(Math.max(reportMonth, 1), 12) - 1;
  const visible = progression.slice(0, idx + 1);
  const current = visible[visible.length - 1];
  const firstActive = visible.findIndex((p) => p.closedPct > 0);

  if (firstActive < 0) {
    return `As of end-${MONTH_LONG_EN[idx]}, no audit points have been closed yet (${auditClosed} / ${auditTotal} points).`;
  }

  const start = visible[firstActive];
  let nextIdx = -1;
  for (let i = firstActive + 1; i < visible.length; i++) {
    if (visible[i].closedPct > start.closedPct) {
      nextIdx = i;
      break;
    }
  }

  let jumpTo = -1;
  let maxJump = 0;
  for (let i = 1; i < visible.length; i++) {
    const d = visible[i].closedPct - visible[i - 1].closedPct;
    if (d > maxJump) {
      maxJump = d;
      jumpTo = i;
    }
  }

  const parts: string[] = [];
  parts.push(
    `Audit points reached ${start.closedPct}% in ${MONTH_LONG_EN[firstActive]}`,
  );

  if (nextIdx >= 0 && nextIdx !== jumpTo) {
    parts.push(
      `then progressed in ${MONTH_LONG_EN[nextIdx]} (${visible[nextIdx].closedPct}%)`,
    );
  } else if (nextIdx >= 0 && nextIdx === jumpTo) {
    // jump is the next progression month — covered below
  }

  if (jumpTo > firstActive && maxJump >= 5) {
    parts.push(
      `with a notable jump in ${MONTH_LONG_EN[jumpTo]} (${visible[jumpTo].closedPct}%, +${maxJump} pts)`,
    );
  } else if (nextIdx < 0 && current.closedPct === start.closedPct) {
    parts.push('with no material progression in the following months');
  }

  let text = `${parts.join(', ')}.`;
  text += ` As of end-${MONTH_LONG_EN[idx]}, the cumulative figure stands at ${current.closedPct}% (${auditClosed} / ${auditTotal} points).`;
  return text;
}

export function buildGouvernanceSlideData(
  report: ExcoReportPayload,
): ExcoGouvernanceSlideData {
  const reportMonth = report.month;
  const progression = (report.computed.auditProgression || []).map((p, i) => {
    const monthNum = i + 1;
    const isFuture = monthNum > reportMonth;
    const isCurrent = monthNum === reportMonth;
    return {
      monthKey: p.month,
      label: MONTH_SHORT_EN[i] || p.month.slice(5),
      closedPct: isFuture ? 0 : p.closedPct,
      closedCumul: isFuture ? 0 : p.closedCumul,
      isCurrent,
      isFuture,
    };
  });
  const auditTotal = report.computed.auditTotal ?? 0;
  const auditClosed = report.computed.auditClosed ?? 0;
  const auditClosedPct = report.computed.auditClosedPct ?? 0;

  return {
    periodLabel: report.periodLabel,
    auditTotal,
    auditClosed,
    auditClosedPct,
    reportMonth,
    progression,
    evolutionText: buildAuditEvolutionText(
      progression,
      reportMonth,
      auditTotal,
      auditClosed,
    ),
  };
}
