import { recalculateRow } from './timesheet-calc';
import { isTimesheetWeekend } from './timesheet-period';
import { applyShiftSelection } from './timesheet-shift-hours';
import { finalizeTimesheetRow } from './timesheet-ws';
import type { TimesheetRowData, TimesheetShiftType } from './timesheet-types';

const SHIFTER_PATTERN: TimesheetShiftType[] = [
  'shift1',
  'shift1',
  'shift2',
  'shift2',
  'shift3',
  'shift3',
  'off',
  'off',
];

/** General: week-ends = Off (editable for OT). Shifter: Off after each full rotation above. */
export function applyGeneralShiftToPeriod(rows: TimesheetRowData[]): TimesheetRowData[] {
  return rows.map((row) => {
    const shiftType: TimesheetShiftType = isTimesheetWeekend(row.date) ? 'off' : 'general';
    return finalizeTimesheetRow(applyShiftSelection(row, shiftType));
  });
}

export function applyShifterPatternToPeriod(rows: TimesheetRowData[]): TimesheetRowData[] {
  return rows.map((row, index) => {
    const shiftType = SHIFTER_PATTERN[index % SHIFTER_PATTERN.length];
    const base = { ...row, from: '', to: '', shiftType: null };
    return finalizeTimesheetRow(applyShiftSelection(base, shiftType));
  });
}
