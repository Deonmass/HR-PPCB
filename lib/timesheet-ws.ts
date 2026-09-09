import { recalculateRow } from './timesheet-calc';
import { hasTimesheetActualTimes } from './timesheet-off-day';
import { TIMESHEET_WS_OFF, type TimesheetPeriodDay } from './timesheet-period';
import type { TimesheetRowData } from './timesheet-types';

/**
 * WS column: OFF when the day is a rest day (shift Off, or nothing planned/worked).
 * A planned working shift keeps the week label even before Actual From/To are typed.
 */
export function getTimesheetWsExportValue(
  row: Pick<TimesheetRowData, 'scheduledWs' | 'shiftType' | 'from' | 'to'>,
): string {
  if (row.shiftType === 'off') return TIMESHEET_WS_OFF;
  if (row.shiftType) return row.scheduledWs;
  if (!hasTimesheetActualTimes(row)) return TIMESHEET_WS_OFF;
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
