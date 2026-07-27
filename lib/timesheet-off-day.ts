import { rowTotalHours } from './timesheet-calc';
import type { TimesheetRowData } from './timesheet-types';

type WorkedHoursRow = Pick<
  TimesheetRowData,
  'from' | 'to' | 'ordinary' | 'shift1' | 'shift2' | 'shift3' | 'night'
>;

/** True when the employee entered time or has calculated overtime hours. */
export function hasTimesheetWorkedHours(row: WorkedHoursRow): boolean {
  if (row.from.trim() || row.to.trim()) return true;
  return rowTotalHours(row) > 0;
}

/** Scheduled rest day: shift Off (week-end for general, cycle end for shifter). */
export function isTimesheetOffShift(row: Pick<TimesheetRowData, 'shiftType'>): boolean {
  return row.shiftType === 'off';
}

/** Gray highlight: Off day with no hours worked (overtime on Off removes the gray). */
export function shouldShowOffDayHighlight(row: TimesheetRowData): boolean {
  return isTimesheetOffShift(row) && !hasTimesheetWorkedHours(row);
}
