import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, getSessionCookieName } from '@/lib/auth-store';
import { readEmployees } from '@/lib/employees-store';
import { canPerformAction } from '@/lib/permission-check';
import { checkPermission } from '@/lib/require-permission';
import {
  buildTimesheetAccessContext,
  canAccessDepartment,
  canAccessEmployeeMatricule,
  filterEmployeesForTimesheetScope,
  TIMESHEET_MENU,
} from '@/lib/timesheet-permissions';

export async function getTimesheetAccessFromSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await getSession(token);
  if (!session) return null;

  const employees = await readEmployees();
  const access = buildTimesheetAccessContext(session.user, session.menus, employees);
  return { session, access, employees };
}

export async function requireTimesheetModuleAccess(): Promise<
  | { error: NextResponse }
  | Awaited<ReturnType<typeof getTimesheetAccessFromSession>> & { error?: undefined }
> {
  const context = await getTimesheetAccessFromSession();
  if (!context) {
    return { error: NextResponse.json({ error: 'Non authentifié' }, { status: 401 }) };
  }

  const canView =
    canPerformAction(context.session.menus, TIMESHEET_MENU.self, 'view') ||
    canPerformAction(context.session.menus, TIMESHEET_MENU.department, 'view') ||
    canPerformAction(context.session.menus, TIMESHEET_MENU.all, 'view');

  if (!canView) {
    return { error: NextResponse.json({ error: 'Permission refusée' }, { status: 403 }) };
  }

  return context;
}

export async function requireTimesheetEmployeeAccess(matricule: string) {
  const result = await requireTimesheetModuleAccess();
  if ('error' in result && result.error) return result;

  const { access, employees } = result;
  if (!canAccessEmployeeMatricule(access, employees, matricule)) {
    return { error: NextResponse.json({ error: 'Accès timesheet refusé pour cet employé' }, { status: 403 }) };
  }

  return result;
}

export async function requireTimesheetDepartmentAccess(department: string) {
  const result = await requireTimesheetModuleAccess();
  if ('error' in result && result.error) return result;

  const { access } = result;
  if (!canAccessDepartment(access, department)) {
    return { error: NextResponse.json({ error: 'Accès département refusé' }, { status: 403 }) };
  }

  return result;
}

export async function checkTimesheetOwnEdit(): Promise<NextResponse | null> {
  return checkPermission(TIMESHEET_MENU.self, 'edit');
}

export async function checkTimesheetManagerEdit(): Promise<NextResponse | null> {
  const deniedDept = await checkPermission(TIMESHEET_MENU.department, 'edit');
  if (!deniedDept) return null;
  return checkPermission(TIMESHEET_MENU.all, 'edit');
}

export async function checkTimesheetOwnExport(): Promise<NextResponse | null> {
  return checkPermission(TIMESHEET_MENU.self, 'export');
}

export async function checkTimesheetImportOvertime(): Promise<NextResponse | null> {
  return checkPermission(TIMESHEET_MENU.importOvertime, 'create');
}

export async function checkTimesheetDepartmentExport(): Promise<NextResponse | null> {
  const deniedDept = await checkPermission(TIMESHEET_MENU.department, 'export');
  if (!deniedDept) return null;
  return checkPermission(TIMESHEET_MENU.all, 'export');
}

export async function checkTimesheetCloseMonth(): Promise<NextResponse | null> {
  const deniedCompilation = await checkPermission(TIMESHEET_MENU.compilation, 'edit');
  if (!deniedCompilation) return null;
  return checkPermission(TIMESHEET_MENU.all, 'edit');
}

export function filterTimesheetEmployees(
  context: NonNullable<Awaited<ReturnType<typeof getTimesheetAccessFromSession>>>,
  department?: string,
) {
  return filterEmployeesForTimesheetScope(context.employees, context.access, department);
}
