import { generalShiftTimes, type ShiftScheduleContext } from './timesheet-calc';
import type { TimesheetShiftType } from './timesheet-types';

export const TIMESHEET_SHIFT_DEFAULT_HOURS: Record<
  Exclude<TimesheetShiftType, 'off'>,
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
  if (!shiftType || shiftType === 'off') return null;
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
  if (shiftType === null) {
    return { ...row, shiftType: null, from: '', to: '' };
  }
  return { ...row, shiftType };
}
