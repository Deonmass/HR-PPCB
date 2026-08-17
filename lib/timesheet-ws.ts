import { recalculateRow } from './timesheet-calc';
import { hasTimesheetActualTimes } from './timesheet-off-day';
import { TIMESHEET_WS_OFF, type TimesheetPeriodDay } from './timesheet-period';
import type { TimesheetRowData } from './timesheet-types';

/**
 * WS column: OFF when Actual has no From/To (rest day for any weekday),
 * or when the planned shift is Off. Otherwise the week label (including Sat/Sun worked).
 */
export function getTimesheetWsExportValue(
  row: Pick<TimesheetRowData, 'scheduledWs' | 'shiftType' | 'from' | 'to'>,
): string {
  if (!hasTimesheetActualTimes(row)) return TIMESHEET_WS_OFF;
  if (row.shiftType === 'off') return TIMESHEET_WS_OFF;
  return row.scheduledWs;
}

export function finalizeTimesheetRow<T extends TimesheetRowData>(row: T): T {
  return recalculateRow(row) as T;
}

export function createTimesheetRowFromDay(
  day: TimesheetPeriodDay,
  overrides: Partial<Omit<TimesheetRowData, 'dateKey' | 'date' | 'dayLabel' | 'scheduledWs'>> = {},
): TimesheetRowData {
  return finalizeTimesheetRow({
    dateKey: day.dateKey,
    date: day.date,
    dayLabel: day.dayLabel,
    scheduledWs: day.ws,
    from: '',
    to: '',
    shiftType: null,
    holiday: false,
    ordinary: 0,
    shift1: 0,
    shift2: 0,
    shift3: 0,
    night: 0,
    ...overrides,
  });
}
