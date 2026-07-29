import { NextResponse } from 'next/server';
import {
  checkTimesheetDepartmentExport,
  filterTimesheetEmployees,
  requireTimesheetDepartmentAccess,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';
import { buildCompilationData } from '@/lib/timesheet-compilation.server';
import { buildCompilationWorkbookBuffer } from '@/lib/timesheet-compilation-export.server';
import type { Employee } from '@/lib/types';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';
import { logAuditError } from '@/lib/audit-log-store';

const ALL_DEPARTMENTS = '__ALL__';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number.parseInt(searchParams.get('year') ?? '', 10);
  const month = Number.parseInt(searchParams.get('month') ?? '', 10);
  const department = searchParams.get('department')?.trim();

  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: 'Paramètres year et month requis' }, { status: 400 });
  }

  const denied = await checkTimesheetDepartmentExport();
  if (denied) return denied;

  let employees: Employee[];
  let label: string;

  if (!department || department === ALL_DEPARTMENTS) {
    const accessResult = await requireTimesheetModuleAccess();
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    employees = filterTimesheetEmployees(accessResult);
    label = ALL_DEPARTMENTS;
  } else {
    const accessResult = await requireTimesheetDepartmentAccess(department);
    if ('error' in accessResult && accessResult.error) return accessResult.error;
    employees = filterTimesheetEmployees(accessResult, department);
    label = department;
  }

  employees = employees
    .filter((employee) => employee.nom.trim())
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  try {
    // data.rows = brutes ; le builder produit aussi la feuille Politique
    const data = await buildCompilationData(year, month, label, employees);
    const buffer = await buildCompilationWorkbookBuffer(data);
    await auditSimpleAction({
      module: 'timesheet.compilation',
      action: 'export',
      summary: `Export compilation OT ${month}/${year} — ${label}`,
      details: `Export Excel compilation OT ${month}/${year} (${label})`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
    });
  } catch (err) {
    await logAuditError({
      message: err instanceof Error ? err.message : 'Export impossible',
      details: `Échec export compilation OT: ${err instanceof Error ? err.message : 'Export impossible'}`,
      module: 'timesheet.compilation',
      path: '/api/timesheet/compilation/export',
      method: 'GET',
      stack: err instanceof Error ? err.stack : undefined,
      user: await getAuditActor(),
    });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Export impossible' },
      { status: 500 },
    );
  }
}
