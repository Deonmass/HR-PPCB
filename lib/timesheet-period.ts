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

/** Plage calendaire d'une semaine timesheet (weekIndex 0-based, 7 jours). */
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
  const weekEndExclusive = startOfDay(fromDay.date);
  weekEndExclusive.setDate(weekEndExclusive.getDate() + 7);
  return {
    fromKey: fromDay.dateKey,
    toKey: toDay.dateKey,
    label: `du ${formatFrDisplayDate(fromDay.date)} au ${formatFrDisplayDate(weekEndExclusive)}`,
  };
}

export function listTimesheetWeekBounds(
  year: number,
  month: number,
): Array<{ weekIndex: number; fromKey: string; toKey: string; label: string }> {
  const bounds: Array<{ weekIndex: number; fromKey: string; toKey: string; label: string }> = [];
  for (let weekIndex = 0; weekIndex < TIMESHEET_WEEKS_PER_PERIOD; weekIndex += 1) {
    const week = getTimesheetWeekFromTo(year, month, weekIndex);
    if (!week.fromKey || !week.toKey) continue;
    bounds.push({ weekIndex, fromKey: week.fromKey, toKey: week.toKey, label: week.label });
  }
  return bounds;
}

/**
 * After which timesheet row to insert each overtime week total.
 * Matching uses the official overtime week dates of the named month, not the
 * 7-row chunks of a shifted timesheet start date.
 */
export function overtimeWeekInsertsAfterRow(
  rows: Array<{ dateKey: string }>,
  year: number,
  month: number,
): Map<number, number[]> {
  const inserts = new Map<number, number[]>();
  for (const week of listTimesheetWeekBounds(year, month)) {
    let last = -1;
    rows.forEach((row, index) => {
      if (row.dateKey >= week.fromKey && row.dateKey <= week.toKey) last = index;
    });
    if (last < 0) continue;
    const list = inserts.get(last) ?? [];
    list.push(week.weekIndex);
    inserts.set(last, list);
  }
  return inserts;
}

function mondayOnOrBefore(date: Date): Date {
  const cursor = startOfDay(date);
  if (Number.isNaN(cursor.getTime())) return startOfDay(new Date());
  for (let step = 0; step < 7 && cursor.getDay() !== 1; step += 1) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return cursor;
}

/** Snap a date to the Monday of its timesheet week (Mon–Sun). */
export function snapToTimesheetWeekStart(date: Date): Date {
  return mondayOnOrBefore(date);
}

/**
 * Début de période : le lundi ≤ 15 du mois précédent.
 * Ex. août 2026 : lundi 13 juillet (le 15 est un mercredi).
 */
function timesheetPeriodStart(year: number, month: number): Date {
  return mondayOnOrBefore(startOfDay(new Date(year, month - 2, 15)));
}

export function parseLocalDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = startOfDay(new Date(year, month - 1, day));
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export function formatTimesheetDateFr(date: Date): string {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}/${m}/${y}`;
}

export function parseTimesheetDateFr(value: string): Date | null {
  const trimmed = value.trim();
  const iso = parseLocalDateKey(trimmed);
  if (iso) return iso;
  const match = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(trimmed);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return parseLocalDateKey(
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  );
}

/** 28 consecutive days from `start`, grouped into 4 weeks of 7 days. */
export function buildTimesheetDaysFromStart(start: Date): TimesheetPeriodDay[] {
  const days: TimesheetPeriodDay[] = [];
  const origin = startOfDay(start);
  for (let dayIndex = 0; dayIndex < TIMESHEET_DAYS_PER_PERIOD; dayIndex += 1) {
    const day = startOfDay(origin);
    day.setDate(origin.getDate() + dayIndex);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const weekNumber = Math.min(TIMESHEET_WEEKS_PER_PERIOD, Math.floor(dayIndex / 7) + 1);
    days.push({
      date: new Date(day),
      dateKey: localDateKey(day),
      dayLabel: DAY_LABELS[day.getDay()],
      ws: `HS Sem. ${weekNumber}`,
      weekNumber,
      isWeekend,
    });
  }
  return days;
}

/**
 * Période timesheet d'un mois nommé (ex. août) :
 * - début = lundi ≤ 15 du mois précédent
 * - exactement 4 semaines (28 jours, lundi → dimanche)
 * Ex. août 2026 : 13→19 juil., 20→26 juil., 27 juil.→2 août, 3→9 août
 * (libellés du 13 au 20, du 20 au 27, du 27 au 3 août, du 3 au 10 août).
 */
export function buildTimesheetPeriod(year: number, month: number): TimesheetPeriod {
  const start = timesheetPeriodStart(year, month);
  const days = buildTimesheetDaysFromStart(start);
  const end = days[days.length - 1]?.date ?? start;

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
 * Mois timesheet affiché par défaut : le mois calendaire en cours.
 */
export function resolveCurrentTimesheetMonth(
  date: Date = new Date(),
): { year: number; month: number } {
  const today = startOfDay(date);
  return { year: today.getFullYear(), month: today.getMonth() + 1 };
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
