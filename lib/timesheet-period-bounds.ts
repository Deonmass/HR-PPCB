import {
  buildTimesheetPeriod,
  localDateKey,
  parseLocalDateKey,
  type TimesheetPeriod,
} from './timesheet-period';

export type TimesheetPeriodBounds = {
  /** Premier jour actif (inclus), format YYYY-MM-DD. */
  activeStart: string;
  /** Dernier jour actif (inclus), format YYYY-MM-DD. */
  activeEnd: string;
};

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Bornes par défaut = début / fin calculés de la période (sans override). */
export function defaultTimesheetPeriodBounds(year: number, month: number): TimesheetPeriodBounds {
  const period = buildTimesheetPeriod(year, month);
  return {
    activeStart: localDateKey(period.start),
    activeEnd: localDateKey(period.end),
  };
}

/**
 * Applique début/fin actifs : la grille (cartes) reste identique ;
 * seuls les jours hors plage passent `isInactive`.
 */
export function applyTimesheetPeriodBounds(
  period: TimesheetPeriod,
  bounds?: TimesheetPeriodBounds | null,
): TimesheetPeriod {
  const gridFirst = period.days[0];
  const gridLast = period.days[period.days.length - 1];
  if (!gridFirst || !gridLast) return period;

  const fallbackStart = localDateKey(period.start);
  const fallbackEnd = localDateKey(period.end);
  let startKey = bounds?.activeStart?.trim() || fallbackStart;
  let endKey = bounds?.activeEnd?.trim() || fallbackEnd;

  if (startKey < gridFirst.dateKey) startKey = gridFirst.dateKey;
  if (startKey > gridLast.dateKey) startKey = gridLast.dateKey;
  if (endKey < gridFirst.dateKey) endKey = gridFirst.dateKey;
  if (endKey > gridLast.dateKey) endKey = gridLast.dateKey;
  if (endKey < startKey) endKey = startKey;

  const startDate = parseLocalDateKey(startKey) ?? startOfDay(period.start);
  const endDate = parseLocalDateKey(endKey) ?? startOfDay(period.end);
  const startTime = startDate.getTime();
  const endTime = endDate.getTime();

  return {
    ...period,
    start: startDate,
    end: endDate,
    days: period.days.map((day) => {
      const t = startOfDay(day.date).getTime();
      return {
        ...day,
        isInactive: t < startTime || t > endTime,
      };
    }),
  };
}

export function formatTimesheetPeriodBoundsLabel(bounds: TimesheetPeriodBounds): string {
  const fmt = (key: string) => {
    const date = parseLocalDateKey(key);
    if (!date) return key;
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  return `${fmt(bounds.activeStart)} → ${fmt(bounds.activeEnd)}`;
}

export function boundsFromPeriod(period: TimesheetPeriod): TimesheetPeriodBounds {
  return {
    activeStart: localDateKey(period.start),
    activeEnd: localDateKey(period.end),
  };
}
