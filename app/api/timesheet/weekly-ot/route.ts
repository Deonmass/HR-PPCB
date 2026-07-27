import { NextResponse } from 'next/server';
import {
  checkTimesheetImportOvertime,
  checkTimesheetManagerEdit,
  filterTimesheetEmployees,
  getTimesheetAccessFromSession,
  requireTimesheetDepartmentAccess,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';
import { matchesDepartment, canAccessEmployeeMatricule } from '@/lib/timesheet-permissions';
import { parseWeeklyOvertimeImportBuffer } from '@/lib/timesheet-ot-import';
import type { WeeklyOvertimeEntry } from '@/lib/timesheet-weekly-ot';
import {
  buildWeeklyEntriesForAgents,
  getDepartmentWeeklyOtForMatricule,
  getImportedWeekIndexes,
  getLockedWeekIndexes,
  getWeeklyOvertimeWeek,
  importWeeklyOvertimeBulk,
  importWeeklyOvertimeRows,
  lockWeeklyOvertimeWeek,
  saveWeeklyOvertimeWeek,
} from '@/lib/timesheet-weekly-ot-store';

function parsePeriod(searchParams: URLSearchParams) {
  const year = Number.parseInt(searchParams.get('year') ?? '', 10);
  const month = Number.parseInt(searchParams.get('month') ?? '', 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
  return { year, month };
}

function resolveDepartmentName(rawDepartment: string, knownDepartments: string[]): string | null {
  const trimmed = rawDepartment.trim();
  if (!trimmed) return null;
  return (
    knownDepartments.find((department) => matchesDepartment(department, trimmed)) ?? null
  );
}

export async function GET(request: Request) {
  const result = await requireTimesheetModuleAccess();
  if ('error' in result && result.error) return result.error;

  const { searchParams } = new URL(request.url);
  const period = parsePeriod(searchParams);
  const department = searchParams.get('department')?.trim();
  const weekIndex = Number.parseInt(searchParams.get('weekIndex') ?? '', 10);

  if (!period || !department) {
    return NextResponse.json({ error: 'Paramètres year, month et department requis' }, { status: 400 });
  }

  const accessResult = await requireTimesheetDepartmentAccess(department);
  if ('error' in accessResult && accessResult.error) return accessResult.error;

  const matricule = searchParams.get('matricule')?.trim();
  if (matricule && !Number.isFinite(weekIndex)) {
    if (!canAccessEmployeeMatricule(accessResult.access, accessResult.employees, matricule)) {
      return NextResponse.json({ error: 'Accès timesheet refusé pour cet employé' }, { status: 403 });
    }
    const byWeek = await getDepartmentWeeklyOtForMatricule(
      period.year,
      period.month,
      department,
      matricule,
    );
    return NextResponse.json({ byWeek });
  }

  if (Number.isFinite(weekIndex)) {
    const week = await getWeeklyOvertimeWeek(period.year, period.month, department, weekIndex);
    const scopedEmployees = filterTimesheetEmployees(accessResult, department);
    const entries = buildWeeklyEntriesForAgents(
      scopedEmployees.map((employee) => employee.matricule),
      week.entries,
    );
    return NextResponse.json({ week: { ...week, entries } });
  }

  const [lockedWeekIndexes, importedWeekIndexes] = await Promise.all([
    getLockedWeekIndexes(period.year, period.month, department),
    getImportedWeekIndexes(period.year, period.month, department),
  ]);
  return NextResponse.json({ lockedWeekIndexes, importedWeekIndexes });
}

export async function PUT(request: Request) {
  const denied = await checkTimesheetManagerEdit();
  if (denied) return denied;

  const userResult = await requireTimesheetModuleAccess();
  if ('error' in userResult && userResult.error) return userResult.error;

  try {
    const body = (await request.json()) as {
      year: number;
      month: number;
      department: string;
      weekIndex: number;
      entries: WeeklyOvertimeEntry[];
    };

    const accessResult = await requireTimesheetDepartmentAccess(body.department);
    if ('error' in accessResult && accessResult.error) return accessResult.error;

    const week = await saveWeeklyOvertimeWeek({
      year: body.year,
      month: body.month,
      department: body.department,
      weekIndex: body.weekIndex,
      entries: body.entries,
      userId: userResult.session.user.id,
    });

    return NextResponse.json({ week });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Enregistrement impossible' },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  const userResult = await requireTimesheetModuleAccess();
  if ('error' in userResult && userResult.error) return userResult.error;

  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('multipart/form-data')) {
    const denied = await checkTimesheetImportOvertime();
    if (denied) return denied;

    try {
      const form = await request.formData();
      const file = form.get('file');
      const year = Number.parseInt(String(form.get('year') ?? ''), 10);
      const month = Number.parseInt(String(form.get('month') ?? ''), 10);
      const weekIndex = Number.parseInt(String(form.get('weekIndex') ?? ''), 10);
      const bulk = String(form.get('bulk') ?? 'true') !== 'false';
      const department = String(form.get('department') ?? '').trim();

      if (!(file instanceof File) || !Number.isFinite(weekIndex)) {
        return NextResponse.json({ error: 'Fichier ou paramètres invalides' }, { status: 400 });
      }

      const buffer = await file.arrayBuffer();
      const parsed = parseWeeklyOvertimeImportBuffer(buffer);

      if (!bulk && department) {
        const accessResult = await requireTimesheetDepartmentAccess(department);
        if ('error' in accessResult && accessResult.error) return accessResult.error;

        const scopedEmployees = filterTimesheetEmployees(accessResult, department);
        const allowedMatricules = new Set(scopedEmployees.map((employee) => employee.matricule));
        const { week, imported, skipped } = await importWeeklyOvertimeRows({
          year,
          month,
          department,
          weekIndex,
          rows: parsed.rows,
          allowedMatricules,
          userId: userResult.session.user.id,
        });
        return NextResponse.json({ week, imported, skipped, sheetName: parsed.sheetName });
      }

      const context = await getTimesheetAccessFromSession();
      if (!context) {
        return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
      }

      const knownDepartments = Array.from(
        new Set(
          context.employees
            .map((employee) => employee.departement?.trim())
            .filter((value): value is string => Boolean(value)),
        ),
      );

      const employeesByMatricule = new Map(
        context.employees.map((employee) => [employee.matricule, employee] as const),
      );

      type PreparedRow = {
        entry: WeeklyOvertimeEntry;
        hrDepartment: string;
        fileDepartment: string;
      };

      const prepared: PreparedRow[] = [];
      for (const row of parsed.rows) {
        const employee = employeesByMatricule.get(row.matricule);
        if (!employee) continue;
        if (!canAccessEmployeeMatricule(context.access, context.employees, row.matricule)) continue;

        const hrRaw = employee.departement?.trim() ?? '';
        if (!hrRaw) continue;
        const hrDepartment = resolveDepartmentName(hrRaw, knownDepartments) ?? hrRaw;

        prepared.push({
          entry: {
            matricule: row.matricule,
            ot13: row.ot13,
            ot16: row.ot16,
            ot2: row.ot2,
            night: row.night,
          },
          hrDepartment,
          fileDepartment: row.department.trim() || '—',
        });
      }

      if (!prepared.length) {
        return NextResponse.json(
          { error: 'Aucun matricule reconnu (ou accessible) dans le fichier' },
          { status: 400 },
        );
      }

      const rowsByDepartment = new Map<string, WeeklyOvertimeEntry[]>();
      for (const item of prepared) {
        const bucket = rowsByDepartment.get(item.hrDepartment) ?? [];
        bucket.push(item.entry);
        rowsByDepartment.set(item.hrDepartment, bucket);
      }

      const allowedByDepartment = new Map<string, Set<string>>();
      for (const dept of rowsByDepartment.keys()) {
        const accessResult = await requireTimesheetDepartmentAccess(dept);
        if ('error' in accessResult && accessResult.error) continue;
        const scopedEmployees = filterTimesheetEmployees(accessResult, dept);
        allowedByDepartment.set(
          dept,
          new Set(scopedEmployees.map((employee) => employee.matricule)),
        );
      }

      const { results: hrResults, importedMatriculeKeys, totalImported, totalSkipped } =
        await importWeeklyOvertimeBulk({
          year,
          month,
          weekIndex,
          rowsByDepartment,
          allowedByDepartment,
          userId: userResult.session.user.id,
        });

      const lockedHr = new Set(
        hrResults.filter((item) => item.status === 'locked').map((item) => item.department),
      );

      const fileImported = new Map<string, number>();
      const fileLocked = new Set<string>();

      for (const item of prepared) {
        const allowed = allowedByDepartment.get(item.hrDepartment);
        if (!allowed?.has(item.entry.matricule)) continue;

        if (lockedHr.has(item.hrDepartment)) {
          fileLocked.add(item.fileDepartment);
          continue;
        }

        const key = `${item.hrDepartment}::${item.entry.matricule}`;
        if (!importedMatriculeKeys.has(key)) continue;

        fileImported.set(
          item.fileDepartment,
          (fileImported.get(item.fileDepartment) ?? 0) + 1,
        );
      }

      const results = [
        ...Array.from(fileImported.entries()).map(([department, imported]) => ({
          department,
          status: 'imported' as const,
          imported,
        })),
        ...Array.from(fileLocked)
          .filter((department) => !fileImported.has(department))
          .map((department) => ({
            department,
            status: 'locked' as const,
            imported: 0,
          })),
      ];

      if (!results.length && totalImported === 0) {
        return NextResponse.json(
          { error: 'Aucune ligne importée pour les départements autorisés' },
          { status: 400 },
        );
      }

      return NextResponse.json({
        results,
        imported: totalImported,
        skipped: totalSkipped,
        lockedDepartments: Array.from(fileLocked),
        sheetName: parsed.sheetName,
      });
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Import impossible' },
        { status: 400 },
      );
    }
  }

  const denied = await checkTimesheetManagerEdit();
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      action: 'confirm';
      year: number;
      month: number;
      department: string;
      weekIndex: number;
    };

    if (body.action !== 'confirm') {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
    }

    const accessResult = await requireTimesheetDepartmentAccess(body.department);
    if ('error' in accessResult && accessResult.error) return accessResult.error;

    const week = await lockWeeklyOvertimeWeek({
      year: body.year,
      month: body.month,
      department: body.department,
      weekIndex: body.weekIndex,
      userId: userResult.session.user.id,
    });

    return NextResponse.json({ week });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Confirmation impossible' },
      { status: 400 },
    );
  }
}
