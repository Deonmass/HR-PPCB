const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export const TIMESHEET_WS_OFF = 'OFF';

export function isTimesheetWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

export interface TimesheetPeriodDay {
  date: Date;
  dateKey: string;
  dayLabel: string;
  ws: string;
  weekNumber: number;
  isWeekend: boolean;
}

export interface TimesheetPeriod {
  year: number;
  month: number;
  monthLabel: string;
  start: Date;
  end: Date;
  days: TimesheetPeriodDay[];
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mondayOnOrBefore(date: Date): Date {
  const cursor = startOfDay(date);
  while (cursor.getDay() !== 1) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return cursor;
}

/** Exactly 4 weeks (28 days) for a named timesheet month (mid-month cycle). */
export const TIMESHEET_WEEKS_PER_PERIOD = 4;
export const TIMESHEET_DAYS_PER_PERIOD = TIMESHEET_WEEKS_PER_PERIOD * 7;

export function formatTimesheetMonthLabel(year: number, month: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  return `MONTH : ${label}`;
}

export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatFrDisplayDate(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

/** Plage calendaire d'une semaine timesheet (weekIndex 0-based).
 * Libellé « du lundi au lundi suivant » (ex. du 15 au 22 juin).
 */
export function getTimesheetWeekFromTo(
  year: number,
  month: number,
  weekIndex: number,
): { fromKey: string; toKey: string; label: string } {
  const period = buildTimesheetPeriod(year, month);
  const startIdx = weekIndex * 7;
  if (startIdx >= period.days.length || weekIndex < 0) {
    return { fromKey: '', toKey: '', label: '' };
  }
  const endIdx = Math.min(startIdx + 6, period.days.length - 1);
  const fromDay = period.days[startIdx];
  const toDay = period.days[endIdx];
  const nextMonday = startOfDay(fromDay.date);
  nextMonday.setDate(nextMonday.getDate() + 7);
  return {
    fromKey: fromDay.dateKey,
    toKey: toDay.dateKey,
    label: `du ${formatFrDisplayDate(fromDay.date)} au ${formatFrDisplayDate(nextMonday)}`,
  };
}

/**
 * Période timesheet d'un mois nommé (ex. juillet) :
 * - début = lundi ≤ 15 du mois précédent
 * - exactement 4 semaines (28 jours, lundi→dimanche)
 * Ex. juillet : 15→22 juin, 22→29 juin, 29 juin→6 juil., 6→13 juil.
 * Ex. août : 13→20 juil., 20→27 juil., …
 */
export function buildTimesheetPeriod(year: number, month: number): TimesheetPeriod {
  const fifteenthPrevious = new Date(year, month - 2, 15);
  const start = mondayOnOrBefore(fifteenthPrevious);
  const end = startOfDay(start);
  end.setDate(end.getDate() + TIMESHEET_DAYS_PER_PERIOD - 1);

  const days: TimesheetPeriodDay[] = [];
  let dayIndex = 0;
  for (let cursor = startOfDay(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = startOfDay(cursor);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const weekNumber = Math.min(
      TIMESHEET_WEEKS_PER_PERIOD,
      Math.floor(dayIndex / 7) + 1,
    );
    days.push({
      date: new Date(day),
      dateKey: localDateKey(day),
      dayLabel: DAY_LABELS[day.getDay()],
      ws: isWeekend ? TIMESHEET_WS_OFF : `HS Sem. ${weekNumber}`,
      weekNumber,
      isWeekend,
    });
    dayIndex += 1;
  }

  return {
    year,
    month,
    monthLabel: formatTimesheetMonthLabel(year, month),
    start,
    end,
    days,
  };
}

/**
 * Mois timesheet « courant » selon la date du jour (pas le mois calendaire).
 * Dès le lundi ≤ 15 du mois calendaire C, on bascule sur le mois timesheet C+1.
 * Ex. le 29 juillet → période d’août (débutée le 13 juillet).
 */
export function resolveCurrentTimesheetMonth(
  date: Date = new Date(),
): { year: number; month: number } {
  const today = startOfDay(date);
  const calendarYear = today.getFullYear();
  const calendarMonth = today.getMonth() + 1; // 1-12
  const pivot = mondayOnOrBefore(new Date(calendarYear, calendarMonth - 1, 15));

  if (today >= pivot) {
    // On est déjà dans la période du mois suivant
    if (calendarMonth === 12) return { year: calendarYear + 1, month: 1 };
    return { year: calendarYear, month: calendarMonth + 1 };
  }
  return { year: calendarYear, month: calendarMonth };
}

export function listTimesheetMonthOptions(count = 12): { year: number; month: number; label: string }[] {
  const options: { year: number; month: number; label: string }[] = [];
  const current = resolveCurrentTimesheetMonth();
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(current.year, current.month - 1 - offset, 1);
    options.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    });
  }
  return options;
}
