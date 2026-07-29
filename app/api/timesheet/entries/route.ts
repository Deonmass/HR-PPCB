import { NextResponse } from 'next/server';
import {
  checkTimesheetManagerEdit,
  filterTimesheetEmployees,
  requireTimesheetDepartmentAccess,
  requireTimesheetEmployeeAccess,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';
import { canAccessEmployeeMatricule } from '@/lib/timesheet-permissions';
import {
  getDayEntriesMap,
  getDepartmentCalendarStatus,
  getEmployeeTimesheetEntries,
  getPlanningCompleteWeekIndexes,
  getWeekPlanningEntries,
  saveDayEntries,
  savePlanningDayEntries,
  savePlanningWeekEntries,
} from '@/lib/timesheet-store';
import { buildTimesheetPeriod } from '@/lib/timesheet-period';
import type { TimesheetShiftType } from '@/lib/timesheet-types';
import { withAudit } from '@/lib/with-audit';

function parsePeriod(searchParams: URLSearchParams): { year: number; month: number } | null {
  const year = Number.parseInt(searchParams.get('year') ?? '', 10);
  const month = Number.parseInt(searchParams.get('month') ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function GET(request: Request) {
  const result = await requireTimesheetModuleAccess();
  if ('error' in result && result.error) return result.error;

  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams);
  if (!period) {
    return NextResponse.json({ error: 'Paramètres year et month requis' }, { status: 400 });
  }

  const matricule = searchParams.get('matricule')?.trim();
  const dateKey = searchParams.get('dateKey')?.trim();
  const department = searchParams.get('department')?.trim();
  const scope = searchParams.get('scope')?.trim();

  try {
    if (matricule) {
      const accessResult = await requireTimesheetEmployeeAccess(matricule);
      if ('error' in accessResult && accessResult.error) return accessResult.error;

      const entries = await getEmployeeTimesheetEntries(period.year, period.month, matricule);
      return NextResponse.json({ entries });
    }

    if (department && scope === 'calendar') {
      const accessResult = await requireTimesheetDepartmentAccess(department);
      if ('error' in accessResult && accessResult.error) return accessResult.error;

      const scopedEmployees = filterTimesheetEmployees(accessResult, department);
      const matricules = new Set(scopedEmployees.map((employee) => employee.matricule));
      const periodData = buildTimesheetPeriod(period.year, period.month);
      const { savedDateKeys, completeDateKeys, planningCompleteDateKeys } =
        await getDepartmentCalendarStatus(periodData.year, periodData.month, matricules);
      const planningCompleteWeekIndexes = await getPlanningCompleteWeekIndexes(
        periodData.year,
        periodData.month,
        matricules,
        periodData.days.map((day) => day.dateKey),
      );
      return NextResponse.json({
        savedDateKeys,
        completeDateKeys,
        planningCompleteDateKeys,
        planningCompleteWeekIndexes,
      });
    }

    const weekIndex = Number.parseInt(searchParams.get('weekIndex') ?? '', 10);
    if (department && scope === 'planning-week' && Number.isFinite(weekIndex)) {
      const accessResult = await requireTimesheetDepartmentAccess(department);
      if ('error' in accessResult && accessResult.error) return accessResult.error;

      const periodData = buildTimesheetPeriod(period.year, period.month);
      const weekDays = periodData.days.slice(weekIndex * 7, weekIndex * 7 + 7);
      const dateKeys = weekDays.map((day) => day.dateKey);
      const entries = await getWeekPlanningEntries(period.year, period.month, dateKeys);
      return NextResponse.json({ days: weekDays, entries });
    }

    if (dateKey && department) {
      const accessResult = await requireTimesheetDepartmentAccess(department);
      if ('error' in accessResult && accessResult.error) return accessResult.error;

      const dayEntries = await getDayEntriesMap(period.year, period.month, dateKey);
      const { employees, access } = accessResult;
      const filtered: Record<string, (typeof dayEntries)[string]> = {};
      for (const [key, entry] of Object.entries(dayEntries)) {
        if (canAccessEmployeeMatricule(access, employees, key)) {
          filtered[key] = entry;
        }
      }
      return NextResponse.json({ entries: filtered });
    }

    return NextResponse.json({ error: 'matricule ou (dateKey + department) requis' }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Lecture impossible' },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  const denied = await checkTimesheetManagerEdit();
  if (denied) return denied;

  const userResult = await requireTimesheetModuleAccess();
  if ('error' in userResult && userResult.error) return userResult.error;

  const { session } = userResult;

  try {
    const body = (await request.json()) as {
      year: number;
      month: number;
      dateKey?: string;
      department: string;
      mode?: string;
      weekIndex?: number;
      grid?: Array<{
        matricule: string;
        shifts: Array<{ dateKey: string; shiftType: TimesheetShiftType | null }>;
      }>;
      entries?: Array<{
        matricule: string;
        from: string;
        to: string;
        shiftType: TimesheetShiftType | null;
        holiday?: boolean;
      }>;
    };

    if (!body.year || !body.month || !body.department) {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const accessResult = await requireTimesheetDepartmentAccess(body.department);
    if ('error' in accessResult && accessResult.error) return accessResult.error;

    const scopedEmployees = filterTimesheetEmployees(accessResult, body.department);
    const allowedMatricules = new Set(scopedEmployees.map((employee) => employee.matricule));

    if (body.mode === 'planning-week') {
      if (!Number.isFinite(body.weekIndex) || !Array.isArray(body.grid)) {
        return NextResponse.json({ error: 'Semaine ou grille invalide' }, { status: 400 });
      }

      const flatEntries = body.grid
        .filter((row) => allowedMatricules.has(row.matricule))
        .flatMap((row) =>
          row.shifts.map((shift) => ({
            matricule: row.matricule,
            dateKey: shift.dateKey,
            shiftType: shift.shiftType,
          })),
        );

      await withAudit(
        {
          module: 'timesheet',
          action: 'update',
          summary: `Enregistrement planning semaine ${body.weekIndex} — ${body.department} (${body.month}/${body.year})`,
          undoable: false,
          meta: {
            year: body.year,
            month: body.month,
            department: body.department,
            weekIndex: body.weekIndex,
            saved: flatEntries.length,
          },
          path: '/api/timesheet/entries',
          method: 'PUT',
        },
        () =>
          savePlanningWeekEntries({
            year: body.year,
            month: body.month,
            entries: flatEntries,
            updatedBy: session.user.id,
          }),
      );

      return NextResponse.json({ ok: true, saved: flatEntries.length });
    }

    if (!body.dateKey || !Array.isArray(body.entries)) {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const entries = body.entries.filter((entry) => allowedMatricules.has(entry.matricule));
    const saveFn = body.mode === 'planning' ? savePlanningDayEntries : saveDayEntries;
    const saved = await withAudit(
      {
        module: 'timesheet',
        action: 'update',
        summary: `Enregistrement timesheet ${body.dateKey} — ${body.department}`,
        undoable: false,
        meta: {
          year: body.year,
          month: body.month,
          dateKey: body.dateKey,
          department: body.department,
          mode: body.mode ?? 'day',
          count: entries.length,
        },
        path: '/api/timesheet/entries',
        method: 'PUT',
      },
      () =>
        saveFn({
          year: body.year,
          month: body.month,
          dateKey: body.dateKey!,
          entries,
          updatedBy: session.user.id,
        }),
    );

    return NextResponse.json({ entries: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enregistrement impossible' },
      { status: 500 },
    );
  }
}
