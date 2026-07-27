import {
  formatHoursValue,
  generalShiftTimes,
  normalHoursBreakdown,
  splitDailyOvertime,
  workedHoursBetween,
} from './timesheet-calc';
import { shouldShowOffDayHighlight } from './timesheet-off-day';
import type { TimesheetHourBreakdown, TimesheetRowData, TimesheetShiftType } from './timesheet-types';
import { getTimesheetWsExportValue } from './timesheet-ws';
import { TIMESHEET_WS_OFF } from './timesheet-period';
import type { WeeklyOvertimeEntry } from './timesheet-weekly-ot';

const AS_PER_WS_FROM = '07:00';
const AS_PER_WS_TO = '16:30';

const SHIFT_SCHEDULE_TIMES: Record<TimesheetShiftType, { from: string; to: string } | null> = {
  general: { from: '07:00', to: '16:30' },
  shift1: { from: '06:00', to: '14:00' },
  shift2: { from: '14:00', to: '22:00' },
  shift3: { from: '22:00', to: '06:00' },
  off: null,
};

export type TimesheetTemplateDayLine = {
  kind: 'day';
  row: TimesheetRowData;
  ws: string;
  asFrom: string;
  asTo: string;
  actualFrom: string;
  actualTo: string;
  holiday: boolean;
  ordinary: number;
  shift1: number;
  shift2: number;
  shift3: number;
  night: number;
  ot13: number;
  ot16: number;
  ot2: number;
  otNight: number;
  gray: boolean;
};

export type TimesheetTemplateWeekLine = {
  kind: 'week';
  weekIndex: number;
  label: string;
  ot13: number;
  ot16: number;
  ot2: number;
  otNight: number;
};

export type TimesheetTemplateLine = TimesheetTemplateDayLine | TimesheetTemplateWeekLine;

export type TimesheetTemplateTotals = {
  ordinary: number;
  shift1: number;
  shift2: number;
  shift3: number;
  night: number;
  ot13: number;
  ot16: number;
  ot2: number;
  otNight: number;
};

function toDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date(`${String(value).slice(0, 10)}T12:00:00`);
}

function emptyNormal(): TimesheetHourBreakdown {
  return { ordinary: 0, shift1: 0, shift2: 0, shift3: 0, night: 0 };
}

/** Planned schedule for a row (shift times or As per WS). Used to fill Actual columns. */
export function scheduleTimesForRow(
  row: TimesheetRowData,
  localisation = '',
): { from: string; to: string } | null {
  if (row.shiftType === 'off') return null;

  if (row.shiftType) {
    if (row.shiftType === 'general') {
      return generalShiftTimes({ date: toDate(row.date), localisation });
    }
    const schedule = SHIFT_SCHEDULE_TIMES[row.shiftType];
    if (schedule) return schedule;
  }

  if (getTimesheetWsExportValue(row) === TIMESHEET_WS_OFF) return null;
  return { from: AS_PER_WS_FROM, to: AS_PER_WS_TO };
}

export function isActualTimesEditable(row: TimesheetRowData): boolean {
  return scheduleTimesForRow(row) !== null || Boolean(row.holiday);
}

/** Actual From/To — same rules as Excel export. */
export function actualTimesForTemplateRow(
  row: TimesheetRowData,
  localisation = '',
): { from: string; to: string } {
  const from = row.from?.trim();
  const to = row.to?.trim();
  if (from && to) return { from, to };
  if (row.shiftType && row.shiftType !== 'off') {
    if (row.shiftType === 'general') {
      return generalShiftTimes({ date: toDate(row.date), localisation });
    }
    const schedule = SHIFT_SCHEDULE_TIMES[row.shiftType];
    if (schedule) return { from: schedule.from, to: schedule.to };
  }
  if (getTimesheetWsExportValue(row) === TIMESHEET_WS_OFF) {
    return { from: 'OFF', to: 'OFF' };
  }
  return { from: '', to: '' };
}

function shouldGrayRow(row: TimesheetRowData): boolean {
  if (row.holiday) return false;
  const day = toDate(row.date).getDay();
  if (day === 0 || day === 6) return true;
  return shouldShowOffDayHighlight(row);
}

function asPerWsTimes(row: TimesheetRowData, localisation: string): { from: string; to: string } {
  const schedule = scheduleTimesForRow(row, localisation);
  if (schedule) return schedule;
  if (row.shiftType === 'general') {
    return generalShiftTimes({ date: toDate(row.date), localisation });
  }
  return { from: AS_PER_WS_FROM, to: AS_PER_WS_TO };
}

/**
 * Normal hours = time within the planned schedule.
 * Overtime = hours beyond that schedule (or all hours on a holiday),
 * split as: first 2h → 1.3, remainder → 1.6.
 */
export function computeTemplateDayHours(
  actualFrom: string,
  actualTo: string,
  row: TimesheetRowData,
  localisation: string,
): {
  normal: TimesheetHourBreakdown;
  ot13: number;
  ot16: number;
  ot2: number;
  otNight: number;
} {
  const worked = workedHoursBetween(actualFrom, actualTo);
  if (!worked) {
    return { normal: emptyNormal(), ot13: 0, ot16: 0, ot2: 0, otNight: 0 };
  }

  const shiftType = row.shiftType && row.shiftType !== 'off' ? row.shiftType : 'general';
  const holiday = Boolean(row.holiday);

  if (holiday) {
    const ot = splitDailyOvertime(worked);
    return { normal: emptyNormal(), ot13: ot.ot13, ot16: ot.ot16, ot2: 0, otNight: 0 };
  }

  const schedule = asPerWsTimes(row, localisation);
  const scheduled = workedHoursBetween(schedule.from, schedule.to);
  const normalHours = Math.min(worked, scheduled || worked);
  const otHours = Math.max(0, Math.round((worked - normalHours) * 100) / 100);

  const normal =
    otHours > 0 && scheduled > 0
      ? normalHoursBreakdown(schedule.from, schedule.to, shiftType)
      : normalHoursBreakdown(actualFrom, actualTo, shiftType);

  const ot = splitDailyOvertime(otHours);
  return { normal, ot13: ot.ot13, ot16: ot.ot16, ot2: 0, otNight: 0 };
}

function buildDayLine(
  row: TimesheetRowData,
  localisation: string,
  explicitActual = false,
): TimesheetTemplateDayLine {
  const actual = explicitActual
    ? { from: row.from?.trim() ?? '', to: row.to?.trim() ?? '' }
    : actualTimesForTemplateRow(row, localisation);
  const asPer = asPerWsTimes(row, localisation);
  const hours = computeTemplateDayHours(actual.from, actual.to, row, localisation);

  return {
    kind: 'day',
    row,
    ws: getTimesheetWsExportValue(row),
    asFrom: asPer.from,
    asTo: asPer.to,
    actualFrom: actual.from || '—',
    actualTo: actual.to || '—',
    holiday: Boolean(row.holiday),
    ordinary: hours.normal.ordinary,
    shift1: hours.normal.shift1,
    shift2: hours.normal.shift2,
    shift3: hours.normal.shift3,
    night: hours.normal.night,
    ot13: hours.ot13,
    ot16: hours.ot16,
    ot2: hours.ot2,
    otNight: hours.otNight,
    gray: shouldGrayRow(row),
  };
}

/**
 * Build the template-style month view: day rows + week separators with OT totals.
 * Mirrors Excel Timesheet template layout (export).
 */
export function buildTimesheetTemplateLines(
  rows: TimesheetRowData[],
  weeklyOtByIndex: Record<number, WeeklyOvertimeEntry | undefined>,
  localisation = '',
  options?: { explicitActual?: boolean },
): TimesheetTemplateLine[] {
  const explicitActual = options?.explicitActual ?? false;
  const lines: TimesheetTemplateLine[] = [];
  let weekOt13 = 0;
  let weekOt16 = 0;
  let weekOt2 = 0;
  let weekOtNight = 0;

  rows.forEach((row, index) => {
    const dayLine = buildDayLine(row, localisation, explicitActual);
    lines.push(dayLine);
    weekOt13 += dayLine.ot13;
    weekOt16 += dayLine.ot16;
    weekOt2 += dayLine.ot2;
    weekOtNight += dayLine.otNight;

    if ((index + 1) % 7 === 0) {
      const weekIndex = Math.floor(index / 7);
      const imported = weeklyOtByIndex[weekIndex];
      // Prefer calculated day OT; fall back to imported weekly OT when no day OT yet.
      const hasCalculated = weekOt13 + weekOt16 + weekOt2 + weekOtNight > 0;
      lines.push({
        kind: 'week',
        weekIndex,
        label: `Semaine ${weekIndex + 1}`,
        ot13: hasCalculated ? Math.round(weekOt13 * 100) / 100 : (imported?.ot13 ?? 0),
        ot16: hasCalculated ? Math.round(weekOt16 * 100) / 100 : (imported?.ot16 ?? 0),
        ot2: hasCalculated ? Math.round(weekOt2 * 100) / 100 : (imported?.ot2 ?? 0),
        otNight: hasCalculated ? Math.round(weekOtNight * 100) / 100 : (imported?.night ?? 0),
      });
      weekOt13 = 0;
      weekOt16 = 0;
      weekOt2 = 0;
      weekOtNight = 0;
    }
  });

  return lines;
}

export function sumTimesheetTemplateLines(lines: TimesheetTemplateLine[]): TimesheetTemplateTotals {
  const totals: TimesheetTemplateTotals = {
    ordinary: 0,
    shift1: 0,
    shift2: 0,
    shift3: 0,
    night: 0,
    ot13: 0,
    ot16: 0,
    ot2: 0,
    otNight: 0,
  };

  for (const line of lines) {
    if (line.kind === 'day') {
      totals.ordinary += line.ordinary;
      totals.shift1 += line.shift1;
      totals.shift2 += line.shift2;
      totals.shift3 += line.shift3;
      totals.night += line.night;
    } else {
      // Week rows hold calculated day OT (or imported OT fallback).
      totals.ot13 += line.ot13;
      totals.ot16 += line.ot16;
      totals.ot2 += line.ot2;
      totals.otNight += line.otNight;
    }
  }

  return {
    ordinary: Math.round(totals.ordinary * 100) / 100,
    shift1: Math.round(totals.shift1 * 100) / 100,
    shift2: Math.round(totals.shift2 * 100) / 100,
    shift3: Math.round(totals.shift3 * 100) / 100,
    night: Math.round(totals.night * 100) / 100,
    ot13: Math.round(totals.ot13 * 100) / 100,
    ot16: Math.round(totals.ot16 * 100) / 100,
    ot2: Math.round(totals.ot2 * 100) / 100,
    otNight: Math.round(totals.otNight * 100) / 100,
  };
}

export { formatHoursValue };
