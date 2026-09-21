import { rowTotalHours } from './timesheet-calc';
import { isTimesheetNonWorkingShift, type TimesheetRowData } from './timesheet-types';

type WorkedHoursRow = Pick<
  TimesheetRowData,
  'from' | 'to' | 'ordinary' | 'shift1' | 'shift2' | 'shift3' | 'night'
>;

/** True when Actual From and To are both filled. */
export function hasTimesheetActualTimes(row: Pick<TimesheetRowData, 'from' | 'to'>): boolean {
  return Boolean(row.from?.trim() && row.to?.trim());
}

/** True when the employee entered time or has calculated overtime hours. */
export function hasTimesheetWorkedHours(row: WorkedHoursRow): boolean {
  if (row.from.trim() || row.to.trim()) return true;
  return rowTotalHours(row) > 0;
}

/** Rest day in the template: Off / leave / absence, or no planned shift and no Actual times. */
export function shouldGrayTimesheetTemplateRow(row: TimesheetRowData): boolean {
  if (row.holiday) return false;
  if (row.shiftType && !isTimesheetNonWorkingShift(row.shiftType)) return false;
  return !hasTimesheetActualTimes(row);
}

/** Scheduled rest day: shift Off (week-end for general, cycle end for shifter). */
export function isTimesheetOffShift(row: Pick<TimesheetRowData, 'shiftType'>): boolean {
  return isTimesheetNonWorkingShift(row.shiftType);
}

/** Gray highlight: Off day with no hours worked (overtime on Off removes the gray). */
export function shouldShowOffDayHighlight(row: TimesheetRowData): boolean {
  return isTimesheetOffShift(row) && !hasTimesheetWorkedHours(row);
}
