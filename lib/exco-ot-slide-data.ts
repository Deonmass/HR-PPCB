import type { ExcoReportPayload } from '@/lib/exco-types';
import { EXCO_FY_MONTH_LABELS } from '@/lib/exco-template-baseline';
import { excoFyColumns } from '@/lib/exco-trends-slide-data';

/** Couleurs segments mois (alignées onglet Heures supp.). */
export const OT_MONTH_SEGMENT_COLORS = [
  '9CA3AF',
  '111827',
  '7A1F2B',
  'B45309',
  '1D4ED8',
  '047857',
  '7C3AED',
  'DB2777',
  '0D9488',
  'CA8A04',
] as const;

export function otMonthSegmentColor(calendarMonth: number): string {
  const idx =
    (((calendarMonth - 3) % OT_MONTH_SEGMENT_COLORS.length) + OT_MONTH_SEGMENT_COLORS.length)
    % OT_MONTH_SEGMENT_COLORS.length;
  return OT_MONTH_SEGMENT_COLORS[idx];
}

export type ExcoOtDeptMonthRow = {
  department: string;
  /** Heures du mois courant (ex. juillet). */
  monthHours: number | null;
  ytd: number;
  pctOfYtd: number;
  /** Segments empilés Mar→mois courant (heures > 0). */
  segments: Array<{ month: number; label: string; hours: number; color: string }>;
};

export type ExcoOtSlideData = {
  monthLabel: string;
  monthIndex: number;
  rows: ExcoOtDeptMonthRow[];
  totalMonthHours: number;
  ytdTotal: number;
  maxYtd: number;
  /** Max heures du mois courant (échelle graphique). */
  maxMonthHours: number;
  legend: Array<{ label: string; color: string }>;
};

function fmtHours(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatOtHours(n: number | null | undefined): string {
  return fmtHours(n);
}

/** Valeur courte au-dessus des barres. */
export function formatOtHoursShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

/** Libellé axe graphique OT — court pour éviter le chevauchement. */
export function otChartDeptLabel(dept: string): string {
  const key = dept.trim().toLowerCase();
  const map: Record<string, string> = {
    administration: 'Admin',
    audit: 'Audit',
    engineering: 'Eng.',
    finance: 'Fin.',
    'human resources': 'HR',
    legal: 'Legal',
    mining: 'Mining',
    'packaging & logistics': 'Pack.',
    production: 'Prod.',
    'quality assurance': 'QA',
    'risk & environment': 'Risk',
    'sales & logistics': 'Sales',
    'supply chain': 'Supply',
  };
  if (map[key]) return map[key];
  const trimmed = dept.trim();
  if (trimmed.length <= 7) return trimmed;
  return `${trimmed.slice(0, 6)}…`;
}

/** Données slide OT — même source que l’onglet Heures supplémentaires. */
export function buildOtSlideData(report: ExcoReportPayload): ExcoOtSlideData {
  const fyCols = excoFyColumns(report.year, report.month);
  const monthCol = fyCols.find((c) => c.isCurrent);
  const monthLabel = monthCol?.label || report.periodLabel;
  const monthIndex = report.month;

  const deptSource = report.computed.overtimeByDept || [];
  const rows: ExcoOtDeptMonthRow[] = deptSource.map((row) => {
    const hoursByMonth = row.hoursByMonth || Array(12).fill(null);
    const monthHours =
      monthCol && monthCol.visible && monthCol.year === report.year
        ? hoursByMonth[monthCol.month - 1]
        : null;
    const ytd = hoursByMonth.reduce<number>((s, h, i) => {
      const month = i + 1;
      if (month < 3 || month > report.month) return s;
      return s + (h || 0);
    }, 0);
    const roundedYtd = Math.round(ytd * 100) / 100;
    const segments = hoursByMonth
      .map((h, i) => ({ h: h || 0, month: i + 1 }))
      .filter((s) => s.month >= 3 && s.month <= report.month && s.h > 0)
      .map((s) => ({
        month: s.month,
        label: EXCO_FY_MONTH_LABELS[s.month - 3] || String(s.month),
        hours: s.h,
        color: otMonthSegmentColor(s.month),
      }));
    return {
      department: row.department,
      monthHours: monthHours != null && Number.isFinite(monthHours) ? monthHours : null,
      ytd: roundedYtd,
      pctOfYtd: 0,
      segments,
    };
  });

  const ytdTotal = rows.reduce((s, r) => s + r.ytd, 0);
  const totalMonthHours = rows.reduce((s, r) => s + (r.monthHours || 0), 0);
  for (const r of rows) {
    r.pctOfYtd = ytdTotal > 0 ? Math.round((r.ytd / ytdTotal) * 100) : 0;
  }

  const legend = fyCols
    .filter((c) => c.visible && c.year === report.year && c.month >= 3)
    .map((c) => ({
      label: c.label,
      color: otMonthSegmentColor(c.month),
    }));

  return {
    monthLabel,
    monthIndex,
    rows,
    totalMonthHours: Math.round(totalMonthHours * 100) / 100,
    ytdTotal: Math.round(ytdTotal * 100) / 100,
    maxYtd: Math.max(...rows.map((r) => r.ytd), 1),
    maxMonthHours: Math.max(...rows.map((r) => r.monthHours || 0), 1),
    legend,
  };
}

export type ExcoOtEmpDisplayRow = {
  id: string;
  name: string;
  hours: string;
  cost: string;
  leave: string;
  department: string;
};

export type ExcoOtDeptCrossRow = {
  department: string;
  hours: string;
  cost: string;
  leave: string;
};

export type ExcoOtVsLeaveSlideData = {
  periodLabel: string;
  overviewLines: Array<{ text: string; value: string }>;
  otTop: ExcoOtEmpDisplayRow[];
  leaveTop: ExcoOtEmpDisplayRow[];
  deptCross: ExcoOtDeptCrossRow[];
};

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtHours2(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function empDisplay(
  row: {
    matricule: string;
    nom: string;
    hours: number;
    costUsd?: number | null;
    leaveBalance: number | null;
    department: string;
  },
  leaveOverride?: number | null,
): ExcoOtEmpDisplayRow {
  const leave = leaveOverride ?? row.leaveBalance;
  return {
    id: row.matricule,
    name: row.nom,
    hours: fmtHours2(row.hours),
    cost: fmtUsd(row.costUsd ?? null),
    leave: leave != null && Number.isFinite(leave) ? String(leave) : '—',
    department: row.department,
  };
}

/** Slide « Overtime vs Leave Balance » — même logique que capt.2 onglet Heures supp. */
export function buildOtVsLeaveSlideData(report: ExcoReportPayload): ExcoOtVsLeaveSlideData {
  const c = report.computed;
  const o = report.overlays;
  const leaveMap = o.leaveBalanceByMatricule || {};

  const otRows = (c.overtimeTopEmployees || []).map((row) => ({
    ...row,
    leaveBalance: leaveMap[row.matricule] ?? row.leaveBalance,
  }));

  const otTop = otRows
    .slice()
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 15)
    .map((row) => empDisplay(row, row.leaveBalance));

  // Même source que OT Top 15, trié sur Leave (décroissant)
  const leaveTop = otRows
    .slice()
    .sort((a, b) => (b.leaveBalance || 0) - (a.leaveBalance || 0))
    .slice(0, 15)
    .map((row) => empDisplay(row, row.leaveBalance));

  const leaveByDept = new Map<string, { leaveSum: number; leaveN: number }>();
  for (const e of otRows) {
    const leave = e.leaveBalance;
    const prev = leaveByDept.get(e.department) || { leaveSum: 0, leaveN: 0 };
    if (leave != null) {
      prev.leaveSum += leave;
      prev.leaveN += 1;
    }
    leaveByDept.set(e.department, prev);
  }

  const deptCross: ExcoOtDeptCrossRow[] = (c.overtimeByDept || []).map((row) => {
    const leave = leaveByDept.get(row.department);
    return {
      department: row.department,
      hours: fmtHours2(row.hours),
      cost: fmtUsd(row.cost),
      leave: leave?.leaveN
        ? String(Math.round((leave.leaveSum / leave.leaveN) * 100) / 100)
        : '—',
    };
  });

  const withLeave = otRows.filter((e) => e.leaveBalance != null);
  const avgLeave = withLeave.length
    ? withLeave.reduce((s, e) => s + (e.leaveBalance || 0), 0) / withLeave.length
    : null;

  const avgHours =
    c.employeesWithOt > 0 ? c.overtimeHoursTotal / c.employeesWithOt : null;
  const staffPct =
    c.headcount > 0
      ? Math.round((c.employeesWithOt / c.headcount) * 100)
      : null;

  const overviewLines: Array<{ text: string; value: string }> = [
    {
      text: 'Total workforce',
      value: `${c.headcount} employees`,
    },
    {
      text: 'Employees with recorded hours',
      value:
        staffPct != null
          ? `${c.employeesWithOt} (${staffPct}%)`
          : String(c.employeesWithOt),
    },
    {
      text: 'Total Overtime',
      value: `${fmtHours2(c.overtimeHoursTotal)} hours`,
    },
    {
      text: 'Average hours',
      value: fmtHours2(avgHours),
    },
    {
      text: 'Total cost',
      value: fmtUsd(o.manualKpis.overtimeCost ?? null),
    },
    {
      text: 'Average remaining leave (OT)',
      value: avgLeave != null ? `${fmtHours2(avgLeave)} days` : '—',
    },
  ];

  return {
    periodLabel: report.periodLabel,
    overviewLines,
    otTop,
    leaveTop,
    deptCross,
  };
}
