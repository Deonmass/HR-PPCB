export type TimesheetShiftType = 'general' | 'shift1' | 'shift2' | 'shift3' | 'off';

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
}[] = [
  { id: 'general', label: 'Général', shortLabel: 'Gén.', planningLabel: 'General Shift', schedule: '07h00 – 16h30' },
  { id: 'shift1', label: 'Shift 1', shortLabel: 'S1', planningLabel: 'Shift 1', schedule: '06h00 – 14h00' },
  { id: 'shift2', label: 'Shift 2', shortLabel: 'S2', planningLabel: 'Shift 2', schedule: '14h00 – 22h00' },
  { id: 'shift3', label: 'Shift 3', shortLabel: 'S3', planningLabel: 'Shift 3', schedule: '22h00 – 06h00' },
  { id: 'off', label: 'OFF', shortLabel: 'OFF', planningLabel: 'OFF', schedule: 'Jour de repos — heures prestées = HS' },
];
