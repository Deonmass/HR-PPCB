import {
  formatHoursValue,
  generalShiftTimes,
  legalNightHours,
  normalHoursBreakdown,
  overlapHours,
  workedHoursBetween,
} from './timesheet-calc';
import { hasTimesheetActualTimes, shouldGrayTimesheetTemplateRow } from './timesheet-off-day';
import { overtimeWeekInsertsAfterRow } from './timesheet-period';
import type { TimesheetHourBreakdown, TimesheetRowData, TimesheetShiftType } from './timesheet-types';
import { getTimesheetWsExportValue } from './timesheet-ws';
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

  if (!hasTimesheetActualTimes(row)) return null;
  return { from: AS_PER_WS_FROM, to: AS_PER_WS_TO };
}

export function isActualTimesEditable(row: TimesheetRowData): boolean {
  return scheduleTimesForRow(row) !== null || Boolean(row.holiday);
}

/** Actual From/To — entered times, or OFF when the day was not worked. */
export function actualTimesForTemplateRow(
  row: TimesheetRowData,
  _localisation = '',
): { from: string; to: string } {
  const from = row.from?.trim();
  const to = row.to?.trim();
  if (from && to) return { from, to };
  return { from: 'OFF', to: 'OFF' };
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
 * Normal hours = overlap between Actual and the planned schedule.
 * Night hours = legal night portion of Actual (19:00–05:00), for every shift.
 * Overtime is not calculated here: template OT columns come from weekly imports.
 */
export function computeTemplateDayHours(
  actualFrom: string,
  actualTo: string,
  row: TimesheetRowData,
  localisation: string,
): { normal: TimesheetHourBreakdown } {
  const worked = workedHoursBetween(actualFrom, actualTo);
  const night = legalNightHours(actualFrom, actualTo);
  if (!worked) {
    return { normal: emptyNormal() };
  }

  const holiday = Boolean(row.holiday);
  const isOff = row.shiftType === 'off';

  if (holiday || isOff) {
    return { normal: { ...emptyNormal(), night } };
  }

  const shiftType = row.shiftType && row.shiftType !== 'off' ? row.shiftType : 'general';
  const schedule = asPerWsTimes(row, localisation);
  const overlap = overlapHours(actualFrom, actualTo, schedule.from, schedule.to);
  const otHours = Math.max(0, Math.round((worked - overlap) * 100) / 100);

  let normal: TimesheetHourBreakdown;
  if (overlap <= 0) {
    normal = emptyNormal();
  } else if (otHours > 0) {
    normal = normalHoursBreakdown(schedule.from, schedule.to, shiftType);
  } else {
    normal = normalHoursBreakdown(actualFrom, actualTo, shiftType);
  }
  return { normal: { ...normal, night } };
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
    actualFrom: actual.from || 'OFF',
    actualTo: actual.to || 'OFF',
    holiday: Boolean(row.holiday),
    ordinary: hours.normal.ordinary,
    shift1: hours.normal.shift1,
    shift2: hours.normal.shift2,
    shift3: hours.normal.shift3,
    night: hours.normal.night,
    ot13: 0,
    ot16: 0,
    ot2: 0,
    otNight: 0,
    gray: shouldGrayTimesheetTemplateRow(row),
  };
}

/**
 * Build the template-style month view: day rows + week separators with OT totals.
 * Overtime columns come only from weekly imports, placed on the official overtime
 * week dates of the named month (not calculated from Actual From/To).
 */
export function buildTimesheetTemplateLines(
  rows: TimesheetRowData[],
  weeklyOtByIndex: Record<number, WeeklyOvertimeEntry | undefined>,
  localisation = '',
  options?: { explicitActual?: boolean; year?: number; month?: number },
): TimesheetTemplateLine[] {
  const explicitActual = options?.explicitActual ?? false;
  const year = options?.year;
  const month = options?.month;
  const inserts =
    Number.isInteger(year) && Number.isInteger(month)
      ? overtimeWeekInsertsAfterRow(rows, year as number, month as number)
      : new Map<number, number[]>();
  const lines: TimesheetTemplateLine[] = [];

  rows.forEach((row, index) => {
    lines.push(buildDayLine(row, localisation, explicitActual));
    const weekIndexes = inserts.get(index);
    if (weekIndexes?.length) {
      for (const weekIndex of weekIndexes) {
        const imported = weeklyOtByIndex[weekIndex];
        lines.push({
          kind: 'week',
          weekIndex,
          label: `Semaine ${weekIndex + 1}`,
          ot13: imported?.ot13 ?? 0,
          ot16: imported?.ot16 ?? 0,
          ot2: imported?.ot2 ?? 0,
          otNight: imported?.night ?? 0,
        });
      }
      return;
    }
    if (inserts.size === 0 && (index + 1) % 7 === 0) {
      const weekIndex = Math.floor(index / 7);
      const imported = weeklyOtByIndex[weekIndex];
      lines.push({
        kind: 'week',
        weekIndex,
        label: `Semaine ${weekIndex + 1}`,
        ot13: imported?.ot13 ?? 0,
        ot16: imported?.ot16 ?? 0,
        ot2: imported?.ot2 ?? 0,
        otNight: imported?.night ?? 0,
      });
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
      // Week rows hold imported weekly OT only.
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
