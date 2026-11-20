import { NextResponse } from 'next/server';
import {
  checkTimesheetApplyPolicy,
  checkTimesheetCloseMonth,
  isContractantTimesheetMatricule,
  requireTimesheetDepartmentAccess,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';
import type { CompilationData } from '@/lib/timesheet-compilation';
import { addCompilationExtraMatricules } from '@/lib/timesheet-compilation-extras-store';
import { compilationCandidatePool, compilationRoster } from '@/lib/timesheet-compilation-roster.server';
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
import { auditSimpleAction, withAudit } from '@/lib/with-audit';

const ALL_DEPARTMENTS = '__ALL__';
const COMPILATION_ACCESS = { includeContractants: false } as const;

function isAllDepartments(department: string | undefined | null): boolean {
  return !department || department === ALL_DEPARTMENTS;
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
  let accessResult: Awaited<ReturnType<typeof requireTimesheetModuleAccess>>;

  if (isAllDepartments(department)) {
    accessResult = await requireTimesheetModuleAccess(COMPILATION_ACCESS);
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    label = ALL_DEPARTMENTS;
  } else {
    accessResult = await requireTimesheetDepartmentAccess(department as string, COMPILATION_ACCESS);
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    label = department as string;
  }

  if (searchParams.get('candidates') === '1') {
    const roster = await compilationRoster(
      accessResult,
      year,
      month,
      label,
      isAllDepartments(department) ? undefined : department,
    );
    const snapshot = await getCompilationSnapshot(year, month, label);
    const present = new Set(roster.map((employee) => employee.matricule));
    for (const row of snapshot?.data.rows ?? []) present.add(row.matricule);
    const candidates = compilationCandidatePool(accessResult)
      .filter((employee) => !present.has(employee.matricule))
      .map((employee) => ({
        matricule: employee.matricule,
        nom: employee.nom,
        departement: employee.departement,
        grade: employee.grade,
        jobTitle: employee.jobTitle,
        localisation: employee.localisation ?? '',
        service: employee.service ?? '',
        statut: employee.statut ?? '',
      }));
    return NextResponse.json(candidates);
  }

  employees = await compilationRoster(
    accessResult,
    year,
    month,
    label,
    isAllDepartments(department) ? undefined : department,
  );

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
      action?: 'close' | 'reopen' | 'add-agents';
      year?: number;
      month?: number;
      department?: string;
      matricules?: string[];
    };
    const { action, year, month } = body;
    const department = body.department?.trim();

    if (action === 'add-agents') {
      const policyDenied = await checkTimesheetApplyPolicy();
      const closeDenied = await checkTimesheetCloseMonth();
      if (policyDenied && closeDenied) return policyDenied;
      if (!Number.isFinite(year) || !Number.isFinite(month)) {
        return NextResponse.json({ error: 'Paramètres year et month requis' }, { status: 400 });
      }
      const requested = Array.from(
        new Set((body.matricules ?? []).map((item) => item.trim()).filter(Boolean)),
      );
      if (!requested.length) {
        return NextResponse.json({ error: 'Sélectionnez au moins un agent' }, { status: 400 });
      }

      const label = isAllDepartments(department) ? ALL_DEPARTMENTS : (department as string);
      const accessResult = isAllDepartments(department)
        ? await requireTimesheetModuleAccess(COMPILATION_ACCESS)
        : await requireTimesheetDepartmentAccess(department as string, COMPILATION_ACCESS);
      if ('error' in accessResult && accessResult.error) return accessResult.error;

      const roster = await compilationRoster(
        accessResult,
        year as number,
        month as number,
        label,
        isAllDepartments(department) ? undefined : department,
      );
      const present = new Set(roster.map((employee) => employee.matricule));
      const pool = new Map(
        compilationCandidatePool(accessResult).map((employee) => [employee.matricule, employee]),
      );
      const accepted = requested.filter((matricule) => pool.has(matricule) && !present.has(matricule));
      if (!accepted.length) {
        return NextResponse.json({ error: 'Ces agents sont déjà dans la compilation' }, { status: 400 });
      }

      await addCompilationExtraMatricules(year as number, month as number, label, accepted);
      const addedEmployees = accepted
        .map((matricule) => pool.get(matricule))
        .filter((employee): employee is Employee => Boolean(employee));
      const built = await buildCompilationData(year as number, month as number, label, addedEmployees);
      const policy = applyCompilationPolicy(built.rows);
      const snapshot = await getCompilationSnapshot(year as number, month as number, label);
      if (snapshot) {
        await saveCompilationSnapshot({
          year: year as number,
          month: month as number,
          department: label,
          data: {
            ...snapshot.data,
            rows: [...snapshot.data.rows, ...built.rows],
            closed: snapshot.data.closed,
          },
          policyRows: [...snapshot.policyRows, ...policy.rows],
          policyChanges: [...snapshot.policyChanges, ...policy.changes],
          source: snapshot.source,
          userId: accessResult.session.user.id,
        });
      }

      await auditSimpleAction({
        module: 'timesheet.compilation',
        action: 'other',
        summary: `Ajout compilation OT ${month}/${year} — ${accepted.length} agent(s)`,
        details: accepted.join(', '),
      });

      return NextResponse.json({ added: accepted.length, matricules: accepted });
    }

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
      employees = await compilationRoster(
        userResult,
        year as number,
        month as number,
        ALL_DEPARTMENTS,
      );
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
      employees = await compilationRoster(
        accessResult,
        year as number,
        month as number,
        label,
        department as string,
      );
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
      const data = await buildCompilationData(
        year as number,
        month as number,
        label,
        employees,
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
