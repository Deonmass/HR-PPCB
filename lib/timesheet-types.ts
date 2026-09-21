export type TimesheetShiftType =
  | 'general'
  | 'shift1'
  | 'shift2'
  | 'shift3'
  | 'off'
  | 'al'
  | 'sl'
  | 'a';

/** Shifts without a normal work schedule (rest / leave / absence). */
export type TimesheetNonWorkingShift = 'off' | 'al' | 'sl' | 'a';

export type TimesheetWorkingShiftType = Exclude<TimesheetShiftType, TimesheetNonWorkingShift>;

export const TIMESHEET_NON_WORKING_SHIFTS: readonly TimesheetNonWorkingShift[] = [
  'off',
  'al',
  'sl',
  'a',
];

export function isTimesheetNonWorkingShift(
  shiftType: TimesheetShiftType | null | undefined,
): shiftType is TimesheetNonWorkingShift {
  return shiftType === 'off' || shiftType === 'al' || shiftType === 'sl' || shiftType === 'a';
}

export function isTimesheetLeaveOrAbsentShift(
  shiftType: TimesheetShiftType | null | undefined,
): boolean {
  return shiftType === 'al' || shiftType === 'sl' || shiftType === 'a';
}

/** WS export / display code for non-working shifts. */
export function timesheetShiftWsCode(shiftType: TimesheetShiftType | null | undefined): string | null {
  if (shiftType === 'off') return 'OFF';
  if (shiftType === 'al') return 'AL';
  if (shiftType === 'sl') return 'SL';
  if (shiftType === 'a') return 'A';
  return null;
}

export interface TimesheetHourBreakdown {
  ordinary: number;
  shift1: number;
  shift2: number;
  shift3: number;
  night: number;
}

export interface TimesheetDayEntry {
  matricule: string;
  present: boolean;
  from: string;
  to: string;
  shiftType: TimesheetShiftType | null;
  /** Public holiday — all worked hours count as overtime. */
  holiday?: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface TimesheetRowData {
  dateKey: string;
  date: Date;
  dayLabel: string;
  /** Week label from the period (HS Sem. X). OFF in the WS column comes from empty Actual. */
  scheduledWs: string;
  from: string;
  to: string;
  shiftType: TimesheetShiftType | null;
  /** Public holiday — all worked hours count as overtime. */
  holiday?: boolean;
  ordinary: number;
  shift1: number;
  shift2: number;
  shift3: number;
  night: number;
}

export const TIMESHEET_SHIFT_OPTIONS: {
  id: TimesheetShiftType;
  label: string;
  shortLabel: string;
  planningLabel: string;
  schedule: string;
  /** Accent color for the option / selected control. */
  color?: string;
}[] = [
  {
    id: 'general',
    label: 'Général',
    shortLabel: 'Gén.',
    planningLabel: 'General Shift',
    schedule: '07h00 – 16h30',
  },
  {
    id: 'shift1',
    label: 'Shift 1 (Morning)',
    shortLabel: 'S1',
    planningLabel: 'Shift 1 (Morning)',
    schedule: '06h00 – 14h00',
  },
  {
    id: 'shift2',
    label: 'Shift 2 (After)',
    shortLabel: 'S2',
    planningLabel: 'Shift 2 (After)',
    schedule: '14h00 – 22h00',
  },
  {
    id: 'shift3',
    label: 'Shift 3 (Night)',
    shortLabel: 'S3',
    planningLabel: 'Shift 3 (Night)',
    schedule: '22h00 – 06h00',
  },
  {
    id: 'off',
    label: 'OFF',
    shortLabel: 'OFF',
    planningLabel: 'OFF',
    schedule: 'Jour de repos — heures prestées = HS',
  },
  {
    id: 'al',
    label: 'AL — Annual Leave',
    shortLabel: 'AL',
    planningLabel: 'AL — Annual Leave',
    schedule: 'Congé annuel',
    color: '#059669',
  },
  {
    id: 'sl',
    label: 'SL — Sick Leave',
    shortLabel: 'SL',
    planningLabel: 'SL — Sick Leave',
    schedule: 'Congé maladie',
    color: '#d97706',
  },
  {
    id: 'a',
    label: 'A — Absent',
    shortLabel: 'A',
    planningLabel: 'A — Absent',
    schedule: 'Absence',
    color: '#dc2626',
  },
];
