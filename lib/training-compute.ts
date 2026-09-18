import {
  DEFAULT_TRAINING_KPIS,
  calendarYearMonths,
  fyMonthSequence,
  monthKey,
  monthLabelShortEn,
  type TrainingDashboardView,
  type TrainingStoreData,
} from './training-types';

export function buildTrainingDashboard(
  store: TrainingStoreData,
  viewYear = new Date().getFullYear(),
  viewMonth: number | null = null,
  mode: 'calendar' | 'fy' = 'calendar',
): TrainingDashboardView {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const seq =
    mode === 'fy'
      ? fyMonthSequence(viewYear, viewMonth || currentMonth)
      : calendarYearMonths(viewYear);

  const costMonths = seq.map(({ year, month }) => {
    const snap = store.monthlyCosts[monthKey(year, month)];
    const hq = snap?.hq ?? 0;
    const plant = snap?.plant ?? 0;
    const selected =
      viewMonth != null
        ? year === viewYear && month === viewMonth
        : year === currentYear && month === currentMonth;
    return {
      key: monthKey(year, month),
      label: monthLabelShortEn(month),
      year,
      month,
      hq,
      plant,
      total: hq + plant,
      isCurrent: selected,
    };
  });

  const actualSpend = costMonths.reduce((s, m) => s + m.total, 0);
  const hqTotal = costMonths.reduce((s, m) => s + m.hq, 0);
  const plantTotal = costMonths.reduce((s, m) => s + m.plant, 0);
  const denom = hqTotal + plantTotal;

  const entriesForCovered = store.entries.filter((e) => {
    if (mode === 'calendar') {
      if (e.year !== viewYear) return false;
      // YTD jusqu’au mois sélectionné (ou année entière si « All months »)
      if (viewMonth != null && e.month > viewMonth) return false;
      return true;
    }
    // FY : uniquement les mois de la séquence affichée
    const keys = new Set(seq.map((s) => monthKey(s.year, s.month)));
    return keys.has(monthKey(e.year, e.month));
  });

  const covered = [
    ...new Set(entriesForCovered.map((e) => e.text.trim()).filter(Boolean)),
  ];

  return {
    kpis: store.kpis || DEFAULT_TRAINING_KPIS,
    actualSpend: Math.round(actualSpend * 100) / 100,
    plantActualPct:
      denom > 0
        ? Math.round((plantTotal / denom) * 10000) / 100
        : store.kpis.plantBudgetPct,
    hqActualPct:
      denom > 0
        ? Math.round((hqTotal / denom) * 10000) / 100
        : store.kpis.hqBudgetPct,
    topicsCount: covered.length,
    costMonths,
    viewYear,
    viewMonth,
    covered,
    upcoming: store.kpis.upcoming || [],
    entries: store.entries,
    updatedAt: store.updatedAt,
  };
}
