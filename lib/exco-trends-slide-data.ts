import { visibleManualKpis, type ExcoReportPayload, type ExcoTrendMonth } from '@/lib/exco-types';
import {
  EXCO_FY_MONTH_LABELS,
  EXCO_FY_START_YEAR,
  TEMPLATE_YTD_JUNE_2026,
  excoFyColToYearMonth,
} from '@/lib/exco-template-baseline';

export type ExcoFyCol = {
  index: number;
  label: string;
  year: number;
  month: number;
  visible: boolean;
  isCurrent: boolean;
};

export type ExcoTrendTableSection = {
  title: string;
  headers: string[];
  rows: Array<{ label: string; cells: string[] }>;
  /** Index dans `headers` de la colonne mois en cours (après la 1re colonne label). */
  currentHeaderIndex: number | null;
};

export function sectionWithCurrent(
  fyCols: ExcoFyCol[],
  section: Omit<ExcoTrendTableSection, 'currentHeaderIndex'>,
): ExcoTrendTableSection {
  const idx = fyCols.findIndex((c) => c.isCurrent);
  return {
    ...section,
    currentHeaderIndex: idx >= 0 ? idx + 1 : null,
  };
}

/** Colonnes FY Mar→Mar (même grille que l’onglet Tendances). */
export function excoFyColumns(reportYear: number, reportMonth: number): ExcoFyCol[] {
  const yy = String(EXCO_FY_START_YEAR).slice(-2);
  return EXCO_FY_MONTH_LABELS.map((label, i) => {
    const { year, month } = excoFyColToYearMonth(i, EXCO_FY_START_YEAR);
    const visible =
      year < reportYear || (year === reportYear && month <= reportMonth);
    return {
      index: i,
      label: i === 0 ? `${label} ${yy}` : label,
      year,
      month,
      visible,
      isCurrent: year === reportYear && month === reportMonth,
    };
  });
}

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

function pctCell(value: number | null | undefined, visible = true): string {
  if (!visible) return '';
  if (value == null || !Number.isFinite(value)) return '';
  return `${Math.round(value)}%`;
}

function dashOr(value: string): string {
  return value.trim() ? value : '—';
}

function financialYtds(report: ExcoReportPayload) {
  const trends = report.computed.trends || [];
  const filled = trends.filter((t) => t.month >= 3 && t.month <= report.month);
  const staffYtd =
    report.month <= 6 && report.year === EXCO_FY_START_YEAR
      ? TEMPLATE_YTD_JUNE_2026.staffCost000 * 1000
      : TEMPLATE_YTD_JUNE_2026.staffCost000 * 1000
        + filled.filter((t) => t.month > 6).reduce((s, t) => s + (t.staffCost || 0), 0);
  const volumeYtd =
    report.month <= 6 && report.year === EXCO_FY_START_YEAR
      ? TEMPLATE_YTD_JUNE_2026.volumePerEmp
      : TEMPLATE_YTD_JUNE_2026.volumePerEmp
        + filled.filter((t) => t.month > 6).reduce((s, t) => s + (t.volumePerEmp || 0), 0);
  const revenueYtd =
    report.month <= 6 && report.year === EXCO_FY_START_YEAR
      ? TEMPLATE_YTD_JUNE_2026.revenuePerEmp
      : TEMPLATE_YTD_JUNE_2026.revenuePerEmp
        + filled.filter((t) => t.month > 6).reduce((s, t) => s + (t.revenuePerEmp || 0), 0);
  return { staffYtd, volumeYtd, revenueYtd };
}

/** 1. Financial KPIs — mêmes formules que l’onglet Tendances. */
export function buildTrendsFinancialSection(report: ExcoReportPayload): ExcoTrendTableSection {
  const fyCols = excoFyColumns(report.year, report.month);
  const trends = report.computed.trends || [];
  const mk = visibleManualKpis(report.overlays.manualKpis);
  const { staffYtd, volumeYtd, revenueYtd } = financialYtds(report);
  const staffBudget = mk.staffCostBudgetYtd ?? null;
  const volumeBudget = mk.volumeBudgetYtd ?? null;
  const revenueBudget = mk.revenueBudgetYtd ?? null;

  const monthCells = (
    getter: (t: ExcoTrendMonth) => number | null | undefined,
    digits: number,
    scale = 1,
  ) =>
    fyCols.map((c) => {
      const t = trendAt(trends, c.year, c.month, report.year);
      const raw = t ? getter(t) : null;
      return cell(raw != null ? raw / scale : null, digits, c.visible);
    });

  const pctOfBudget = (ytd: number, budget: number | null) =>
    budget && ytd ? `${Math.round((ytd / budget) * 100)}%` : '—';

  return sectionWithCurrent(fyCols, {
    title: '1. Financial KPIs',
    headers: [
      'Metric',
      ...fyCols.map((c) => c.label),
      'YTD',
      'BUDGET',
      '%',
    ],
    rows: [
      {
        label: 'Staff Cost (000 USD)',
        cells: [
          ...monthCells((t) => t.staffCost, 2, 1000),
          dashOr(staffYtd ? cell(staffYtd / 1000, 2) : ''),
          dashOr(staffBudget != null ? cell(staffBudget / 1000, 2) : ''),
          pctOfBudget(staffYtd, staffBudget),
        ],
      },
      {
        label: 'Ton per Employee',
        cells: [
          ...monthCells((t) => t.volumePerEmp, 2),
          dashOr(volumeYtd ? cell(volumeYtd, 2) : ''),
          dashOr(volumeBudget != null ? cell(volumeBudget, 2) : ''),
          pctOfBudget(volumeYtd, volumeBudget),
        ],
      },
      {
        label: 'Revenue per Employee',
        cells: [
          ...monthCells((t) => t.revenuePerEmp, 2),
          dashOr(revenueYtd ? cell(revenueYtd, 2) : ''),
          dashOr(revenueBudget != null ? cell(revenueBudget, 2) : ''),
          pctOfBudget(revenueYtd, revenueBudget),
        ],
      },
    ],
  });
}

/** 2. Headcount — mêmes lignes que l’onglet Tendances. */
export function buildTrendsHeadcountSection(report: ExcoReportPayload): ExcoTrendTableSection {
  const fyCols = excoFyColumns(report.year, report.month);
  const trends = report.computed.trends || [];
  const current = trends.find((t) => t.month === report.month);
  const prev = trends.find((t) => t.month === report.month - 1);

  const keys = [
    ['Plant', 'plant'],
    ['HQ and Regions', 'hq'],
    ['Lubudi', 'lubudi'],
    ['Graduates', 'graduates'],
    ['Total', 'headcount'],
  ] as const;

  return sectionWithCurrent(fyCols, {
    title: '2. Headcount',
    headers: [
      'Sites',
      ...fyCols.map((c) => c.label),
      `${report.prevPeriodLabel} → ${report.periodLabel}`,
      'YTD',
    ],
    rows: keys.map(([label, key]) => {
      const delta =
        current && prev
          ? current[key] - prev[key]
          : current
            ? current[key]
            : null;
      return {
        label,
        cells: [
          ...fyCols.map((c) => {
            const t = trendAt(trends, c.year, c.month, report.year);
            if (!c.visible || !t) return '';
            return String(t[key]);
          }),
          delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta}`,
          'On track',
        ],
      };
    }),
  });
}

/** 3. Gender RATIO. */
export function buildTrendsGenderSection(report: ExcoReportPayload): ExcoTrendTableSection {
  const fyCols = excoFyColumns(report.year, report.month);
  const trends = report.computed.trends || [];
  const current = trends.find((t) => t.month === report.month);

  return sectionWithCurrent(fyCols, {
    title: '3. Gender RATIO',
    headers: [
      'Gender',
      ...fyCols.map((c) => c.label),
      `${report.periodLabel} — Sites`,
      `${report.periodLabel} — HO`,
    ],
    rows: [
      {
        label: 'Male',
        cells: [
          ...fyCols.map((c) => {
            const t = trendAt(trends, c.year, c.month, report.year);
            return pctCell(t?.genderMalePct, c.visible);
          }),
          dashOr(pctCell(current?.genderMalePctSites)),
          dashOr(pctCell(current?.genderMalePctHq)),
        ],
      },
      {
        label: 'Female',
        cells: [
          ...fyCols.map((c) => {
            const t = trendAt(trends, c.year, c.month, report.year);
            return pctCell(t?.genderFemalePct, c.visible);
          }),
          dashOr(pctCell(current?.genderFemalePctSites)),
          dashOr(pctCell(current?.genderFemalePctHq)),
        ],
      },
    ],
  });
}

/** 4. AGE. */
export function buildTrendsAgeSection(report: ExcoReportPayload): ExcoTrendTableSection {
  const fyCols = excoFyColumns(report.year, report.month);
  const trends = report.computed.trends || [];

  const current = trends.find((t) => t.month === report.month);
  const prev = trends.find((t) => t.month === report.month - 1);

  const row = (
    label: string,
    getter: (t: ExcoTrendMonth) => number | null | undefined,
  ) => {
    const cur = current ? getter(current) : null;
    const prv = prev ? getter(prev) : null;
    let delta = '—';
    if (cur != null && prv != null && Number.isFinite(cur) && Number.isFinite(prv)) {
      const d = Math.round((cur - prv) * 10) / 10;
      const pct = prv === 0 ? (cur === 0 ? 0 : 100) : Math.round(((cur - prv) / Math.abs(prv)) * 1000) / 10;
      delta = `${d >= 0 ? '+' : ''}${d.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} (${pct >= 0 ? '+' : ''}${pct}%)`;
    }
    return {
      label,
      cells: [
        ...fyCols.map((c) => {
          const t = trendAt(trends, c.year, c.month, report.year);
          return cell(t ? getter(t) : null, 1, c.visible);
        }),
        delta,
      ],
    };
  };

  return sectionWithCurrent(fyCols, {
    title: '4. AGE',
    headers: [
      'Metric',
      ...fyCols.map((c) => c.label),
      `${report.prevPeriodLabel} → ${report.periodLabel}`,
    ],
    rows: [
      row('Average Age', (t) => t.averageAge),
      row('Male Average Age', (t) => t.averageAgeMale),
      row('Female Average Age', (t) => t.averageAgeFemale),
    ],
  });
}

/** Slide A = Financial + Headcount ; Slide B = Gender + Age. */
export function buildTrendsSlideSections(report: ExcoReportPayload): {
  slideA: [ExcoTrendTableSection, ExcoTrendTableSection];
  slideB: [ExcoTrendTableSection, ExcoTrendTableSection];
} {
  return {
    slideA: [buildTrendsFinancialSection(report), buildTrendsHeadcountSection(report)],
    slideB: [buildTrendsGenderSection(report), buildTrendsAgeSection(report)],
  };
}
