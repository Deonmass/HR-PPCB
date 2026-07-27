import type { TimesheetPeriodDay } from './timesheet-period';

export type TimesheetCalendarCell =
  | { type: 'day'; day: TimesheetPeriodDay; index: number }
  | { type: 'week-slot'; weekIndex: number };

export function buildTimesheetCalendarCells(days: TimesheetPeriodDay[]): TimesheetCalendarCell[] {
  const cells: TimesheetCalendarCell[] = [];
  days.forEach((day, index) => {
    cells.push({ type: 'day', day, index });
    if ((index + 1) % 7 === 0) {
      cells.push({ type: 'week-slot', weekIndex: Math.floor(index / 7) });
    }
  });
  return cells;
}
