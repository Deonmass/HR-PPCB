import { NextResponse } from 'next/server';
import {
  filterTimesheetEmployees,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';

export async function GET(request: Request) {
  const result = await requireTimesheetModuleAccess();
  if ('error' in result && result.error) return result.error;

  const department = new URL(request.url).searchParams.get('department')?.trim() || undefined;
  const employees = filterTimesheetEmployees(result, department).map((employee) => ({
    matricule: employee.matricule,
    nom: employee.nom,
    departement: employee.departement,
    grade: employee.grade,
    jobTitle: employee.jobTitle,
    localisation: employee.localisation ?? '',
  }));

  return NextResponse.json(employees);
}
