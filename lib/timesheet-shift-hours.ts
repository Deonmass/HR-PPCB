import { generalShiftTimes, type ShiftScheduleContext } from './timesheet-calc';
import {
  isTimesheetNonWorkingShift,
  type TimesheetShiftType,
  type TimesheetWorkingShiftType,
} from './timesheet-types';

export const TIMESHEET_SHIFT_DEFAULT_HOURS: Record<
  TimesheetWorkingShiftType,
  { from: string; to: string }
> = {
  general: { from: '07:00', to: '16:30' },
  shift1: { from: '06:00', to: '14:00' },
  shift2: { from: '14:00', to: '22:00' },
  shift3: { from: '22:00', to: '06:00' },
};

export function getShiftDefaultHours(
  shiftType: TimesheetShiftType | null,
  ctx?: ShiftScheduleContext,
): { from: string; to: string } | null {
  if (!shiftType || isTimesheetNonWorkingShift(shiftType)) return null;
  if (shiftType === 'general') return generalShiftTimes(ctx);
  return TIMESHEET_SHIFT_DEFAULT_HOURS[shiftType];
}

export function applyShiftSelection<T extends { from: string; to: string; shiftType: TimesheetShiftType | null }>(
  row: T,
  shiftType: TimesheetShiftType | null,
  ctx?: ShiftScheduleContext,
): T {
  const defaults = getShiftDefaultHours(shiftType, ctx);
  if (defaults) {
    return { ...row, shiftType, from: defaults.from, to: defaults.to };
  }
  if (shiftType === null || isTimesheetNonWorkingShift(shiftType)) {
    return { ...row, shiftType, from: '', to: '' };
  }
  return { ...row, shiftType };
}

/** If Actual is empty, copy the planned shift hours so the timesheet shows the planning by default. */
export function hydrateTimesheetActualFromPlanning<
  T extends { from: string; to: string; shiftType: TimesheetShiftType | null; date?: Date },
>(row: T, localisation = ''): T {
  if (row.from?.trim() && row.to?.trim()) return row;
  if (isTimesheetNonWorkingShift(row.shiftType)) {
    return { ...row, from: '', to: '' };
  }
  const defaults = getShiftDefaultHours(row.shiftType, {
    date: row.date,
    localisation,
  });
  if (!defaults) return row;
  return { ...row, from: defaults.from, to: defaults.to };
}
