import type { TimesheetHourBreakdown } from './timesheet-types';

export interface WeeklyOvertimeEntry {
  matricule: string;
  ot13: number;
  ot16: number;
  ot2: number;
  night: number;
}

export interface WeeklyOvertimeWeek {
  weekIndex: number;
  department: string;
  /** Affichage "du JJ/MM/AAAA au JJ/MM/AAAA" (calculé / persisté). */
  weekFromTo?: string;
  locked: boolean;
  /** Dernière modification des heures (sauvegarde / import). */
  updatedAt?: string;
  updatedBy?: string;
  /** Confirmation OT de la semaine. */
  confirmedAt?: string;
  confirmedBy?: string;
  /** Clôture (mois / semaine). */
  closedAt?: string;
  closedBy?: string;
  /** @deprecated alias de confirmedAt ou closedAt pour compat API. */
  lockedAt?: string;
  lockedBy?: string;
  entries: Record<string, WeeklyOvertimeEntry>;
}

export interface WeeklyOvertimePeriod {
  weeks: Record<string, WeeklyOvertimeWeek>;
}

export interface WeeklyOvertimeData {
  periods: Record<string, WeeklyOvertimePeriod>;
}

export function weeklyOtKey(year: number, month: number): string {
  return `${year}-${month}`;
}

export function weeklyOtWeekKey(department: string, weekIndex: number): string {
  return `${department.trim()}::${weekIndex}`;
}

export function emptyWeeklyOvertimeEntry(matricule: string): WeeklyOvertimeEntry {
  return { matricule, ot13: 0, ot16: 0, ot2: 0, night: 0 };
}

export function sumWeeklyOvertime(entries: WeeklyOvertimeEntry[]): WeeklyOvertimeEntry {
  return entries.reduce(
    (acc, entry) => ({
      matricule: '',
      ot13: acc.ot13 + entry.ot13,
      ot16: acc.ot16 + entry.ot16,
      ot2: acc.ot2 + entry.ot2,
      night: acc.night + entry.night,
    }),
    emptyWeeklyOvertimeEntry(''),
  );
}

export function mapToNormalHoursColumns(
  shiftType: import('./timesheet-types').TimesheetShiftType | null,
  calc: TimesheetHourBreakdown,
): { ordinary: number; shift1: number; shift2: number; shift3: number; night: number } {
  if (!shiftType) return { ordinary: 0, shift1: 0, shift2: 0, shift3: 0, night: 0 };
  switch (shiftType) {
    case 'general':
      return { ordinary: calc.ordinary, shift1: 0, shift2: 0, shift3: 0, night: calc.night };
    case 'shift1':
      return { ordinary: 0, shift1: calc.shift1, shift2: 0, shift3: 0, night: calc.night };
    case 'shift2':
      return { ordinary: 0, shift1: 0, shift2: calc.shift2, shift3: 0, night: calc.night };
    case 'shift3':
      return { ordinary: 0, shift1: 0, shift2: 0, shift3: calc.shift3, night: calc.night };
    case 'off':
      return { ordinary: calc.ordinary, shift1: 0, shift2: 0, shift3: 0, night: calc.night };
    default:
      return { ordinary: 0, shift1: 0, shift2: 0, shift3: 0, night: 0 };
  }
}
