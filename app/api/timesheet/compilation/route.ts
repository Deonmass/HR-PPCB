import { NextResponse } from 'next/server';
import {
  checkTimesheetCloseMonth,
  filterTimesheetEmployees,
  requireTimesheetDepartmentAccess,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';
import { buildCompilationData, compilationWeekIndexes } from '@/lib/timesheet-compilation.server';
import { buildTimesheetPeriod } from '@/lib/timesheet-period';
import { setWeeklyOvertimeMonthClosed } from '@/lib/timesheet-weekly-ot-store';
import type { Employee } from '@/lib/types';

const ALL_DEPARTMENTS = '__ALL__';

function isAllDepartments(department: string | undefined | null): boolean {
  return !department || department === ALL_DEPARTMENTS;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number.parseInt(searchParams.get('year') ?? '', 10);
  const month = Number.parseInt(searchParams.get('month') ?? '', 10);
  const department = searchParams.get('department')?.trim();

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Paramètres year et month requis' }, { status: 400 });
  }

  let employees: Employee[];
  let label: string;

  if (isAllDepartments(department)) {
    const accessResult = await requireTimesheetModuleAccess();
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    employees = filterTimesheetEmployees(accessResult);
    label = ALL_DEPARTMENTS;
  } else {
    const accessResult = await requireTimesheetDepartmentAccess(department as string);
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    employees = filterTimesheetEmployees(accessResult, department as string);
    label = department as string;
  }

  employees = employees
    .filter((employee) => employee.nom.trim())
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  try {
    const data = await buildCompilationData(year, month, label, employees);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Compilation impossible' },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const denied = await checkTimesheetCloseMonth();
  if (denied) return denied;

  const userResult = await requireTimesheetModuleAccess();
  if ('error' in userResult && userResult.error) return userResult.error;

  try {
    const body = (await request.json()) as {
      action?: 'close' | 'reopen';
      year?: number;
      month?: number;
      department?: string;
    };
    const { action, year, month } = body;
    const department = body.department?.trim();

    if (action !== 'close' && action !== 'reopen') {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
    }
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      return NextResponse.json({ error: 'Paramètres year et month requis' }, { status: 400 });
    }

    const period = buildTimesheetPeriod(year as number, month as number);
    const weekIndexes = compilationWeekIndexes(period.days.length);

    let departments: string[];
    if (isAllDepartments(department)) {
      const employees = filterTimesheetEmployees(userResult);
      departments = Array.from(
        new Set(employees.map((employee) => employee.departement?.trim()).filter(Boolean) as string[]),
      );
    } else {
      const accessResult = await requireTimesheetDepartmentAccess(department as string);
      if ('error' in accessResult && accessResult.error) return accessResult.error;
      departments = [department as string];
    }

    for (const dept of departments) {
      await setWeeklyOvertimeMonthClosed({
        year: year as number,
        month: month as number,
        department: dept,
        weekIndexes,
        closed: action === 'close',
        userId: userResult.session.user.id,
      });
    }

    return NextResponse.json({ closed: action === 'close' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Opération impossible' },
      { status: 400 },
    );
  }
}
