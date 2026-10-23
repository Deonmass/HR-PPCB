import { NextResponse } from 'next/server';
import {
  checkTimesheetCloseMonth,
  filterTimesheetEmployees,
  isContractantTimesheetMatricule,
  requireTimesheetDepartmentAccess,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';
import type { CompilationData } from '@/lib/timesheet-compilation';
import { buildCompilationData, compilationWeekIndexes } from '@/lib/timesheet-compilation.server';
import { applyCompilationPolicy } from '@/lib/timesheet-compilation-policy';
import {
  compilationDataFromSnapshot,
  deleteCompilationSnapshot,
  getCompilationSnapshot,
  saveCompilationSnapshot,
} from '@/lib/timesheet-compilation-snapshot-store';
import { resolveTimesheetPeriod } from '@/lib/timesheet-period-bounds-store';
import { setWeeklyOvertimeMonthClosed } from '@/lib/timesheet-weekly-ot-store';
import type { Employee } from '@/lib/types';
import { withAudit } from '@/lib/with-audit';

const ALL_DEPARTMENTS = '__ALL__';
const COMPILATION_ACCESS = { includeContractants: false } as const;

function isAllDepartments(department: string | undefined | null): boolean {
  return !department || department === ALL_DEPARTMENTS;
}

function ppcEmployeesOnly(employees: Employee[]): Employee[] {
  return employees.filter((employee) => !isContractantTimesheetMatricule(employee.matricule));
}

function ndjsonResponse(produce: (send: (value: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (value: unknown) => {
        controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
      };
      try {
        await produce(send);
      } catch (err) {
        send({
          type: 'error',
          error: err instanceof Error ? err.message : 'Compilation impossible',
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
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
    const accessResult = await requireTimesheetModuleAccess(COMPILATION_ACCESS);
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    employees = filterTimesheetEmployees(accessResult);
    label = ALL_DEPARTMENTS;
  } else {
    const accessResult = await requireTimesheetDepartmentAccess(department as string, COMPILATION_ACCESS);
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    employees = filterTimesheetEmployees(accessResult, department as string);
    label = department as string;
  }

  employees = ppcEmployeesOnly(employees)
    .filter((employee) => employee.nom.trim())
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  return ndjsonResponse(async (send) => {
    const snapshot = await getCompilationSnapshot(year, month, label);
    if (snapshot) {
      const frozen = compilationDataFromSnapshot(snapshot);
      const pairs = frozen.rows
        .map((row, index) => ({ row, policyRow: frozen.policyRows?.[index] }))
        .filter((pair) => !isContractantTimesheetMatricule(pair.row.matricule));
      const policyChanges = (frozen.policyChanges ?? []).filter(
        (change) => !isContractantTimesheetMatricule(change.matricule),
      );
      const meta: CompilationData = {
        ...frozen,
        rows: [],
        policyRows: pairs.some((pair) => pair.policyRow) ? [] : undefined,
        policyChanges,
      };
      send({ type: 'meta', data: meta });
      for (const pair of pairs) {
        send(pair.policyRow ? { type: 'row', row: pair.row, policyRow: pair.policyRow } : { type: 'row', row: pair.row });
      }
      return;
    }

    await buildCompilationData(year, month, label, employees, {
      onHeader: (header) => {
        send({ type: 'meta', data: { ...header, rows: [] } });
      },
      onRow: (row) => {
        send({ type: 'row', row });
      },
    });
  });
}

export async function POST(request: Request) {
  const denied = await checkTimesheetCloseMonth();
  if (denied) return denied;

  const userResult = await requireTimesheetModuleAccess(COMPILATION_ACCESS);
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

    const period = await resolveTimesheetPeriod(year as number, month as number);
    const weekIndexes = compilationWeekIndexes(period.days.length);

    let departments: string[];
    let label: string;
    let employees: Employee[];

    if (isAllDepartments(department)) {
      employees = filterTimesheetEmployees(userResult);
      departments = Array.from(
        new Set(employees.map((employee) => employee.departement?.trim()).filter(Boolean) as string[]),
      );
      label = ALL_DEPARTMENTS;
    } else {
      const accessResult = await requireTimesheetDepartmentAccess(
        department as string,
        COMPILATION_ACCESS,
      );
      if ('error' in accessResult && accessResult.error) return accessResult.error;
      departments = [department as string];
      label = department as string;
      employees = filterTimesheetEmployees(accessResult, department as string);
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

    if (action === 'close') {
      const scopedEmployees = ppcEmployeesOnly(employees)
        .filter((employee) => employee.nom.trim())
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      const data = await buildCompilationData(
        year as number,
        month as number,
        label,
        scopedEmployees,
      );
      const policy = applyCompilationPolicy(data.rows);
      await saveCompilationSnapshot({
        year: year as number,
        month: month as number,
        department: label,
        data: { ...data, closed: true },
        policyRows: policy.rows,
        policyChanges: policy.changes,
        source: 'close',
        userId: userResult.session.user.id,
      });
    } else {
      await deleteCompilationSnapshot(year as number, month as number, label);
    }

    await withAudit(
      {
        module: 'timesheet.compilation',
        action: 'other',
        actionLabel: action === 'close' ? 'Clôture' : 'Réouverture',
        summary:
          action === 'close'
            ? `Clôture compilation OT ${month}/${year}`
            : `Réouverture compilation OT ${month}/${year}`,
        details: `Départements: ${departments.join(', ') || '—'}`,
        undoable: false,
        meta: { action, year, month, departments },
        path: '/api/timesheet/compilation',
        method: 'POST',
      },
      async () => ({ closed: action === 'close' }),
    );

    return NextResponse.json({ closed: action === 'close' });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Opération impossible' },
      { status: 400 },
    );
  }
}
