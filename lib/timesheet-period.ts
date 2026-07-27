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

function lastMondayBefore(date: Date): Date {
  const cursor = startOfDay(date);
  cursor.setDate(cursor.getDate() - 1);
  while (cursor.getDay() !== 1) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return cursor;
}

function mondayOnOrBefore(date: Date): Date {
  const cursor = startOfDay(date);
  while (cursor.getDay() !== 1) {
    cursor.setDate(cursor.getDate() - 1);
  }
  return cursor;
}

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

/** Plage calendaire d'une semaine timesheet (weekIndex 0-based). */
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
  return {
    fromKey: fromDay.dateKey,
    toKey: toDay.dateKey,
    label: `du ${formatFrDisplayDate(fromDay.date)} au ${formatFrDisplayDate(toDay.date)}`,
  };
}

export function buildTimesheetPeriod(year: number, month: number): TimesheetPeriod {
  const fifteenthCurrent = new Date(year, month - 1, 15);
  const prevMonthDate = new Date(year, month - 2, 15);
  const start = mondayOnOrBefore(prevMonthDate);
  const end = lastMondayBefore(fifteenthCurrent);

  const days: TimesheetPeriodDay[] = [];
  let dayIndex = 0;
  for (let cursor = startOfDay(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const day = startOfDay(cursor);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const weekNumber = Math.min(4, Math.floor(dayIndex / 7) + 1);
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

export function listTimesheetMonthOptions(count = 12): { year: number; month: number; label: string }[] {
  const options: { year: number; month: number; label: string }[] = [];
  const now = new Date();
  for (let offset = 0; offset < count; offset += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    options.push({
      year: date.getFullYear(),
      month: date.getMonth() + 1,
      label: date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
    });
  }
  return options;
}
