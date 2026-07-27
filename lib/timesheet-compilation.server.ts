import 'server-only';

import { normalHoursBreakdown, standardShiftBreakdown } from './timesheet-calc';
import { buildTimesheetPeriod, type TimesheetPeriodDay } from './timesheet-period';
import {
  roundCompilationHours,
  type CompilationData,
  type CompilationRow,
  type CompilationWeek,
} from './timesheet-compilation';
import { getEmployeeTimesheetEntries } from './timesheet-store';
import type { TimesheetDayEntry } from './timesheet-types';
import { getLockedWeekIndexes, getWeeklyOvertimeWeek } from './timesheet-weekly-ot-store';
import type { Employee } from './types';

export function compilationWeekIndexes(daysCount: number): number[] {
  const count = Math.min(MAX_WEEKS, Math.ceil(daysCount / 7));
  return Array.from({ length: count }, (_, index) => index);
}

const MAX_WEEKS = 5;

function formatWeekRange(days: TimesheetPeriodDay[]): string {
  if (!days.length) return '';
  const fmt = (date: Date) => date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  const first = days[0].date;
  const last = days[days.length - 1].date;
  const year = last.getFullYear();
  return `${fmt(first)} - ${fmt(last)} ${year}`;
}

/** Night hours from normal (planning) hours for a single day entry. */
function dayNormalNight(
  entry: TimesheetDayEntry | undefined,
  ctx: { date: Date; localisation: string },
): number {
  if (!entry?.shiftType) return 0;
  if (entry.from?.trim() && entry.to?.trim()) {
    return normalHoursBreakdown(entry.from, entry.to, entry.shiftType).night;
  }
  return standardShiftBreakdown(entry.shiftType, ctx).night;
}

export async function buildCompilationData(
  year: number,
  month: number,
  department: string,
  employees: Employee[],
): Promise<CompilationData> {
  const period = buildTimesheetPeriod(year, month);
  const weekCount = Math.min(MAX_WEEKS, Math.ceil(period.days.length / 7));

  const weeks: CompilationWeek[] = [];
  for (let index = 0; index < weekCount; index += 1) {
    const weekDays = period.days.slice(index * 7, index * 7 + 7);
    if (!weekDays.length) break;
    weeks.push({ index, label: `Semaine ${index + 1}`, range: formatWeekRange(weekDays) });
  }

  // Distinct departments involved (supports the "all departments" aggregate view).
  const departments = Array.from(
    new Set(employees.map((employee) => employee.departement?.trim()).filter(Boolean) as string[]),
  );

  // For each department, fetch weekly OT entries per week and the locked weeks.
  const weekEntriesByDept = new Map<string, Record<string, { ot13: number; ot16: number; ot2: number; night: number }>[]>();
  const lockedByDept = new Map<string, Set<number>>();
  await Promise.all(
    departments.map(async (dept) => {
      const entriesPerWeek = await Promise.all(
        weeks.map(async (week) => (await getWeeklyOvertimeWeek(year, month, dept, week.index)).entries),
      );
      weekEntriesByDept.set(dept, entriesPerWeek);
      lockedByDept.set(dept, new Set(await getLockedWeekIndexes(year, month, dept)));
    }),
  );

  const closed =
    departments.length > 0 &&
    weeks.length > 0 &&
    departments.every((dept) => {
      const locked = lockedByDept.get(dept);
      return locked ? weeks.every((week) => locked.has(week.index)) : false;
    });

  const rows: CompilationRow[] = [];
  for (const employee of employees) {
    const entries = await getEmployeeTimesheetEntries(year, month, employee.matricule);

    let nightNormal = 0;
    for (const day of period.days) {
      nightNormal += dayNormalNight(entries[day.dateKey], {
        date: day.date,
        localisation: employee.localisation ?? '',
      });
    }

    const deptEntries = weekEntriesByDept.get(employee.departement?.trim() ?? '');
    const weekData = weeks.map((_, weekPos) => {
      const entry = deptEntries?.[weekPos]?.[employee.matricule];
      return {
        ot13: roundCompilationHours(entry?.ot13 ?? 0),
        ot16: roundCompilationHours(entry?.ot16 ?? 0),
        ot2: roundCompilationHours(entry?.ot2 ?? 0),
        night: roundCompilationHours(entry?.night ?? 0),
      };
    });

    rows.push({
      matricule: employee.matricule,
      nom: employee.nom,
      departement: employee.departement,
      localisation: employee.localisation ?? '',
      grade: employee.grade,
      weeks: weekData,
      nightNormal: roundCompilationHours(nightNormal),
    });
  }

  return { year, month, department, weeks, rows, closed };
}
