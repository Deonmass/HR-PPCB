import { NextResponse } from 'next/server';
import {
  filterTimesheetEmployees,
  isContractantTimesheetMatricule,
  requireTimesheetModuleAccess,
} from '@/lib/timesheet-access-server';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const includeContractants = params.get('includeContractants') !== '0';
  const result = await requireTimesheetModuleAccess({ includeContractants });
  if ('error' in result && result.error) return result.error;

  const department = params.get('department')?.trim() || undefined;
  const employees = filterTimesheetEmployees(result, department)
    .filter((employee) => includeContractants || !isContractantTimesheetMatricule(employee.matricule))
    .map((employee) => ({
    matricule: employee.matricule,
    nom: employee.nom,
    departement: employee.departement,
    grade: employee.grade,
    jobTitle: employee.jobTitle,
    localisation: employee.localisation ?? '',
    service: employee.service ?? '',
  }));

  return NextResponse.json(employees);
}
