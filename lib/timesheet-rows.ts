import { buildTimesheetDaysFromStart, type TimesheetPeriod } from './timesheet-period';
import { hydrateTimesheetActualFromPlanning } from './timesheet-shift-hours';
import type { TimesheetDayEntry, TimesheetRowData } from './timesheet-types';
import { createTimesheetRowFromDay, finalizeTimesheetRow } from './timesheet-ws';

/** Jour hors période réactivé au planning (shift / heures / jour férié enregistrés). */
function hasTimesheetDayActivity(entry: TimesheetDayEntry | undefined): boolean {
  if (!entry) return false;
  if (entry.shiftType != null) return true;
  if (entry.from?.trim() || entry.to?.trim()) return true;
  return Boolean(entry.holiday);
}

export function buildEmployeeTimesheetRows(
  period: TimesheetPeriod,
  entries: Record<string, TimesheetDayEntry> = {},
  localisation = '',
): TimesheetRowData[] {
  return period.days.map((day) => {
    const entry = entries[day.dateKey];
    // Hors période sans planning : OFF. Si un shift a été planifié (journée réactivée), on l’applique.
    if (day.isInactive && !hasTimesheetDayActivity(entry)) {
      return createTimesheetRowFromDay(day, { shiftType: 'off', from: '', to: '' });
    }
    const row = createTimesheetRowFromDay(day, {
      from: entry?.from ?? '',
      to: entry?.to ?? '',
      shiftType: entry?.shiftType ?? null,
      holiday: Boolean(entry?.holiday),
    });
    return finalizeTimesheetRow(hydrateTimesheetActualFromPlanning(row, localisation));
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
  const days = buildTimesheetDaysFromStart(start, rows.length || undefined);
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
