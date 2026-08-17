import { isTimesheetWeekend } from './timesheet-period';
import { applyShiftSelection, TIMESHEET_SHIFT_DEFAULT_HOURS } from './timesheet-shift-hours';
import { finalizeTimesheetRow } from './timesheet-ws';
import type { TimesheetRowData, TimesheetShiftType } from './timesheet-types';

/** 8-day rotating roster: 2j S1 · 2j S2 · 2j S3 · 2j OFF */
export const SHIFTER_CYCLE: TimesheetShiftType[] = [
  'shift1',
  'shift1',
  'shift2',
  'shift2',
  'shift3',
  'shift3',
  'off',
  'off',
];

export function inferTimesheetShiftFromActual(
  from: string,
  to: string,
): TimesheetShiftType | null {
  const start = from.trim();
  const end = to.trim();
  if (!start && !end) return 'off';
  if (!start || !end) return null;
  for (const [id, times] of Object.entries(TIMESHEET_SHIFT_DEFAULT_HOURS)) {
    if (id === 'general') continue;
    if (times.from === start && times.to === end) {
      return id as TimesheetShiftType;
    }
  }
  return null;
}

export function rotateShifterCycle(startShift: TimesheetShiftType): TimesheetShiftType[] {
  const start = SHIFTER_CYCLE.indexOf(startShift);
  if (start < 0) return SHIFTER_CYCLE;
  return [...SHIFTER_CYCLE.slice(start), ...SHIFTER_CYCLE.slice(0, start)];
}

export function applyShifterDay(
  row: TimesheetRowData,
  dayIndex: number,
  cycle: TimesheetShiftType[] = SHIFTER_CYCLE,
): TimesheetRowData {
  const shiftType = cycle[dayIndex % cycle.length];
  if (shiftType === 'off') {
    return finalizeTimesheetRow({
      ...row,
      shiftType: 'off',
      from: '',
      to: '',
    });
  }
  return finalizeTimesheetRow(
    applyShiftSelection({ ...row, from: '', to: '', shiftType: null }, shiftType),
  );
}

/** General: week-ends = Off (editable for OT). Shifter: Off after each full rotation above. */
export function applyGeneralShiftToPeriod(rows: TimesheetRowData[]): TimesheetRowData[] {
  return rows.map((row) => {
    const shiftType: TimesheetShiftType = isTimesheetWeekend(row.date) ? 'off' : 'general';
    return finalizeTimesheetRow(applyShiftSelection(row, shiftType));
  });
}

export function applyShifterPatternToPeriod(
  rows: TimesheetRowData[],
  startShift: TimesheetShiftType = 'shift1',
): TimesheetRowData[] {
  const cycle = rotateShifterCycle(startShift);
  return rows.map((row, index) => applyShifterDay(row, index, cycle));
}

/** True when the month already follows a 2-2-2-2 shifter rotation. */
export function detectShifterCycleStart(rows: TimesheetRowData[]): TimesheetShiftType | null {
  if (rows.length < SHIFTER_CYCLE.length) return null;
  const inferred = rows.map((row) => inferTimesheetShiftFromActual(row.from, row.to));
  if (inferred.some((shift) => shift === null)) return null;

  const candidates: TimesheetShiftType[] = ['shift1', 'shift2', 'shift3', 'off'];
  for (const start of candidates) {
    const cycle = rotateShifterCycle(start);
    if (inferred.every((shift, index) => shift === cycle[index % cycle.length])) {
      return start;
    }
  }
  return null;
}
