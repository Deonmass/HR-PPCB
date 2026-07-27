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
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
      });
    }

    return NextResponse.json({ error: 'Mode export invalide' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
