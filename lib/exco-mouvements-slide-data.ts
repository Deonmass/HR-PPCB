import type { ExcoCountRow, ExcoReportPayload, ExcoTrendMonth } from '@/lib/exco-types';
import {
  EXCO_FY_START_YEAR,
  TEMPLATE_YTD_JUNE_2026,
} from '@/lib/exco-template-baseline';
import {
  excoFyColumns,
  sectionWithCurrent,
  type ExcoTrendTableSection,
} from '@/lib/exco-trends-slide-data';

export type { ExcoTrendTableSection };

export type ExcoBarSeries = {
  title: string;
  subtitle: string;
  items: Array<{
    label: string;
    value: number;
    pct: number;
    /** Affichage type « 1/176 » (sorties / effectif). */
    ratioLabel?: string;
    /** Évolution du taux vs mois précédent (ratio, ex. -0.1 = -10 %). */
    deltaPct?: number | null;
  }>;
};

export type ExcoMouvementsSlideData = {
  /** Slide A : Staff movement + charts */
  inOut: ExcoTrendTableSection;
  ageChart: ExcoBarSeries;
  seniorityChart: ExcoBarSeries;
  exitsChart: ExcoBarSeries;
};

function trendAt(
  trends: ExcoTrendMonth[],
  year: number,
  month: number,
  reportYear: number,
): ExcoTrendMonth | undefined {
  if (year !== reportYear) return undefined;
  return trends.find((t) => t.month === month);
}

function cell(value: number | null | undefined, digits = 0, visible = true): string {
  if (!visible) return '';
  if (value == null || !Number.isFinite(value)) return '';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function movementYtds(report: ExcoReportPayload) {
  const trends = report.computed.trends || [];
  const filled = trends.filter((t) => t.month >= 3 && t.month <= report.month);
  const afterJune = filled.filter((t) => t.month > 6);
  const locked =
    report.month <= 6 && report.year === EXCO_FY_START_YEAR;

  const hiresYtd = locked
    ? TEMPLATE_YTD_JUNE_2026.hires
    : TEMPLATE_YTD_JUNE_2026.hires + afterJune.reduce((s, t) => s + (t.hires || 0), 0);
  const exitsYtd = locked
    ? TEMPLATE_YTD_JUNE_2026.exits
    : TEMPLATE_YTD_JUNE_2026.exits + afterJune.reduce((s, t) => s + (t.exits || 0), 0);
  const attritionYtd = TEMPLATE_YTD_JUNE_2026.attritionPct;
  const turnoverYtd = TEMPLATE_YTD_JUNE_2026.turnoverPct;

  return { hiresYtd, exitsYtd, attritionYtd, turnoverYtd };
}

function toPctBars(rows: ExcoCountRow[], title: string, subtitle: string): ExcoBarSeries {
  const total = rows.reduce((s, r) => s + (r.value || 0), 0) || 1;
  return {
    title,
    subtitle,
    items: rows.map((r) => ({
      label: r.label,
      value: r.value,
      pct: Math.round(((r.value || 0) / total) * 1000) / 10,
    })),
  };
}

function buildInOutSection(report: ExcoReportPayload): ExcoTrendTableSection {
  const fyCols = excoFyColumns(report.year, report.month);
  const trends = report.computed.trends || [];
  const ytd = movementYtds(report);
  const current = trends.find((t) => t.month === report.month);
  const fyLabel = `FY${String(EXCO_FY_START_YEAR).slice(-2)} YTD`;

  const monthCells = (
    getter: (t: ExcoTrendMonth) => number | null | undefined,
    digits = 0,
  ) =>
    fyCols.map((c) => {
      const t = trendAt(trends, c.year, c.month, report.year);
      return cell(t ? getter(t) : null, digits, c.visible);
    });

  return sectionWithCurrent(fyCols, {
    title: '5. Staff Movement — IN / OUT YTD',
    headers: ['IN — OUT YTD', ...fyCols.map((c) => c.label), fyLabel],
    rows: [
      {
        label: 'IN',
        cells: [...monthCells((t) => t.hires), cell(ytd.hiresYtd)],
      },
      {
        label: 'Out',
        cells: [...monthCells((t) => t.exits), cell(ytd.exitsYtd)],
      },
      {
        label: 'Attrition Rate (%)',
        cells: [
          ...monthCells((t) => t.attritionPct, 1),
          cell(ytd.attritionYtd, 1),
        ],
      },
      {
        label: 'Turnover (%)',
        cells: [
          ...monthCells((t) => t.turnoverPct, 1),
          cell(ytd.turnoverYtd, 1),
        ],
      },
      {
        label: 'Total Headcount',
        cells: [
          ...monthCells((t) => t.headcount),
          cell(current?.headcount ?? report.computed.headcount),
        ],
      },
    ],
  });
}

function rateDelta(
  currentRate: number | null,
  previousRate: number | null,
): number | null {
  if (currentRate == null || previousRate == null) return null;
  if (currentRate === 0) return 0;
  if (previousRate === 0) {
    return 1; // nouveau taux vs 0 → +100 %
  }
  return Math.round(((currentRate - previousRate) / Math.abs(previousRate)) * 1000) / 1000;
}

export function buildMouvementsSlideData(report: ExcoReportPayload): ExcoMouvementsSlideData {
  const c = report.computed;
  const exitsTotal = (c.exitsByReason || []).reduce((s, r) => s + r.value, 0);
  const agentsMonth = c.headcount > 0 ? c.headcount : 0;
  const prevAgents = c.prevHeadcount != null && c.prevHeadcount > 0 ? c.prevHeadcount : 0;
  const prevByReason = new Map(
    (c.prevExitsByReason || []).map((r) => [r.label.toLowerCase(), r.value]),
  );

  return {
    inOut: buildInOutSection(report),
    ageChart: toPctBars(
      c.ageBands || [],
      'Age Distribution',
      c.averageAge != null ? `${c.averageAge.toFixed(1)} years old` : '—',
    ),
    seniorityChart: toPctBars(
      c.seniorityBands || [],
      'Length of Service',
      c.averageSeniorityYears != null
        ? `${c.averageSeniorityYears.toFixed(2)} years`
        : '—',
    ),
    exitsChart: {
      title: 'Departure and Termination',
      subtitle: exitsTotal
        ? `${exitsTotal} Out this month · HC ${agentsMonth || '—'}`
        : 'No exits',
      items: (c.exitsByReason || []).map((r) => {
        const count = r.value || 0;
        const pct =
          agentsMonth > 0 ? Math.round((count / agentsMonth) * 1000) / 10 : 0;
        const rate = agentsMonth > 0 ? count / agentsMonth : null;
        const prevCount = prevByReason.get(r.label.toLowerCase()) ?? 0;
        const prevRate = prevAgents > 0 ? prevCount / prevAgents : null;
        return {
          label: r.label,
          value: count,
          pct,
          ratioLabel: agentsMonth > 0 ? `${count}/${agentsMonth}` : String(count),
          deltaPct: rateDelta(rate, prevRate),
        };
      }),
    },
  };
}
