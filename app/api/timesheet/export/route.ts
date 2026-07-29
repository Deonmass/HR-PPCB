import { NextResponse } from 'next/server';
import {
  checkTimesheetDepartmentExport,
  checkTimesheetOwnExport,
  filterTimesheetEmployees,
  requireTimesheetDepartmentAccess,
  requireTimesheetEmployeeAccess,
} from '@/lib/timesheet-access-server';
import type { DepartmentExportPayload, TimesheetExportPayload } from '@/lib/timesheet-export';
import {
  buildDepartmentTimesheetWorkbookBuffer,
  buildTimesheetWorkbookBuffer,
} from '@/lib/timesheet-export.server';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';
import { logAuditError } from '@/lib/audit-log-store';

type ExportRequestBody =
  | ({ mode: 'employee' } & TimesheetExportPayload)
  | ({ mode: 'department' } & DepartmentExportPayload);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExportRequestBody;

    if (body.mode === 'department') {
      const denied = await checkTimesheetDepartmentExport();
      if (denied) return denied;

      const accessResult = await requireTimesheetDepartmentAccess(body.department);
      if ('error' in accessResult && accessResult.error) return accessResult.error;

      const scopedEmployees = filterTimesheetEmployees(accessResult, body.department);
      const allowedMatricules = new Set(scopedEmployees.map((employee) => employee.matricule));
      const localisationByMatricule = new Map(
        scopedEmployees.map((employee) => [employee.matricule, employee.localisation ?? '']),
      );
      const filteredEmployees = body.employees
        .filter((employee) => allowedMatricules.has(employee.matricule))
        .map((employee) => ({
          ...employee,
          localisation: localisationByMatricule.get(employee.matricule) ?? '',
        }));

      const buffer = await buildDepartmentTimesheetWorkbookBuffer({
        ...body,
        employees: filteredEmployees,
      });
      await auditSimpleAction({
        module: 'timesheet',
        action: 'export',
        summary: `Export timesheet département ${body.department}`,
        details: `Export département ${body.department} — ${body.period.month}/${body.period.year}`,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    if (body.mode === 'employee') {
      const denied = await checkTimesheetOwnExport();
      if (denied) return denied;

      const accessResult = await requireTimesheetEmployeeAccess(body.matricule);
      if ('error' in accessResult && accessResult.error) return accessResult.error;

      const localisation =
        accessResult.employees.find((employee) => employee.matricule === body.matricule)?.localisation ?? '';
      const buffer = await buildTimesheetWorkbookBuffer({ ...body, localisation });
      await auditSimpleAction({
        module: 'timesheet',
        action: 'export',
        summary: `Export timesheet employé ${body.matricule}`,
        details: `Export individuel ${body.matricule} — ${body.period.month}/${body.period.year}`,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    return NextResponse.json({ error: 'Mode export invalide' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export impossible';
    await logAuditError({
      message,
      details: `Échec export timesheet: ${message}`,
      module: 'timesheet',
      path: '/api/timesheet/export',
      method: 'POST',
      stack: error instanceof Error ? error.stack : undefined,
      user: await getAuditActor(),
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
