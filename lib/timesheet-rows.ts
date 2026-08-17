import { buildTimesheetDaysFromStart, type TimesheetPeriod } from './timesheet-period';
import type { TimesheetDayEntry, TimesheetRowData } from './timesheet-types';
import { createTimesheetRowFromDay, finalizeTimesheetRow } from './timesheet-ws';

export function buildEmployeeTimesheetRows(
  period: TimesheetPeriod,
  entries: Record<string, TimesheetDayEntry> = {},
): TimesheetRowData[] {
  return period.days.map((day) => {
    const entry = entries[day.dateKey];
    return createTimesheetRowFromDay(day, {
      from: entry?.from ?? '',
      to: entry?.to ?? '',
      shiftType: entry?.shiftType ?? null,
    });
  });
}

export function refreshTimesheetRowsForPeriod(
  period: TimesheetPeriod,
  previous: TimesheetRowData[] = [],
): TimesheetRowData[] {
  const byDate = new Map(previous.map((row) => [row.dateKey, row]));
  return period.days.map((day) => {
    const existing = byDate.get(day.dateKey);
    if (!existing) return createTimesheetRowFromDay(day);
    return finalizeTimesheetRow({
      ...existing,
      dayLabel: day.dayLabel,
      scheduledWs: day.ws,
    });
  });
}

/** Keep Actual hours on the same rows; slide the 28 calendar dates from `start`. */
export function shiftTimesheetRowsToStart(
  rows: TimesheetRowData[],
  start: Date,
): TimesheetRowData[] {
  const days = buildTimesheetDaysFromStart(start);
  return days.map((day, index) => {
    const previous = rows[index];
    if (!previous) return createTimesheetRowFromDay(day);
    return finalizeTimesheetRow({
      ...previous,
      dateKey: day.dateKey,
      date: day.date,
      dayLabel: day.dayLabel,
      scheduledWs: day.ws,
    });
  });
}
