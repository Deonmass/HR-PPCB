import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, getSessionCookieName } from '@/lib/auth-store';
import type { MenuPermission } from '@/lib/auth-types';
import {
  filterContractantsByScope,
  getContractantScopeFromMenus,
  isContractantOnlyUser,
} from '@/lib/contractant-scope';
import {
  flattenContractantEmployees,
  mapContractantEmployeeToPpcEmployee,
} from '@/lib/contractant-portal';
import { listContractants } from '@/lib/contractants-store';
import { readEmployees } from '@/lib/employees-json-store';
import { canPerformAction } from '@/lib/permission-check';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import { listDepartments, listServices } from '@/lib/settings-store';
import { isZambaLocalisation } from '@/lib/timesheet-calc';
import {
  buildTimesheetAccessContext,
  canAccessDepartment,
  canAccessEmployeeMatricule,
  filterEmployeesForTimesheetScope,
  TIMESHEET_MENU,
  type TimesheetAccessContext,
} from '@/lib/timesheet-permissions';
import type { Employee } from '@/lib/types';

export const CONTRACTANTS_TIMESHEET_MENU = 'employes.contractants';

export function isContractantTimesheetMatricule(matricule: string): boolean {
  return matricule.trim().toUpperCase().startsWith('CTR-');
}

function hasTimesheetMenuView(menus: MenuPermission[] | null | undefined): boolean {
  return (
    canPerformAction(menus, TIMESHEET_MENU.self, 'view') ||
    canPerformAction(menus, TIMESHEET_MENU.department, 'view') ||
    canPerformAction(menus, TIMESHEET_MENU.all, 'view')
  );
}

function hasContractantsView(menus: MenuPermission[] | null | undefined): boolean {
  return canPerformAction(menus, CONTRACTANTS_TIMESHEET_MENU, 'view');
}

/** Contractant planning mode: no PPC timesheet menus (or contractant-only user). */
export function isContractantTimesheetMode(menus: MenuPermission[] | null | undefined): boolean {
  if (isContractantOnlyUser(menus)) return true;
  return !hasTimesheetMenuView(menus) && hasContractantsView(menus);
}

function mergeEmployeesByMatricule(primary: Employee[], extra: Employee[]): Employee[] {
  const seen = new Set(primary.map((employee) => employee.matricule));
  const merged = [...primary];
  for (const employee of extra) {
    if (seen.has(employee.matricule)) continue;
    seen.add(employee.matricule);
    merged.push(employee);
  }
  return merged;
}

async function loadScopedContractantEmployees(menus: MenuPermission[]): Promise<Employee[]> {
  if (!hasContractantsView(menus)) return [];
  const all = await listContractants();
  const scope = getContractantScopeFromMenus(menus);
  const scoped = filterContractantsByScope(all, scope);
  return flattenContractantEmployees(scoped).map(mapContractantEmployeeToPpcEmployee);
}

function applyContractantTimesheetPermissions(
  access: TimesheetAccessContext,
  menus: MenuPermission[],
): TimesheetAccessContext {
  const canView = hasContractantsView(menus);
  const canEdit = canPerformAction(menus, CONTRACTANTS_TIMESHEET_MENU, 'edit');
  const canCreate = canPerformAction(menus, CONTRACTANTS_TIMESHEET_MENU, 'create');
  const canExport =
    canPerformAction(menus, CONTRACTANTS_TIMESHEET_MENU, 'export') || canEdit || canCreate;
  const canManage = canEdit || canCreate;

  return {
    ...access,
    scope: 'all',
    allowedDepartments: [],
    allowedServices: [],
    permissions: {
      viewOwn: false,
      editOwn: false,
      exportOwn: false,
      viewManager: canView,
      editManager: canManage,
      exportDepartment: canExport,
      importOvertime: canManage,
      validateOvertime: canEdit,
      editValidatedOvertime: canEdit,
      viewAll: canView,
      applyPolicy: false,
      closeMonth: canEdit,
      simulation: false,
    },
  };
}

export async function getTimesheetAccessFromSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await getSession(token);
  if (!session) return null;

  const [ppcEmployees, departments, services, contractantEmployees] = await Promise.all([
    readEmployees(),
    listDepartments(),
    listServices(),
    loadScopedContractantEmployees(session.menus),
  ]);

  const contractantMode = isContractantTimesheetMode(session.menus);
  const employees = contractantMode
    ? contractantEmployees
    : mergeEmployeesByMatricule(ppcEmployees, contractantEmployees);

  let access = buildTimesheetAccessContext(session.user, session.menus, employees, {
    departments,
    services,
  });

  if (contractantMode) {
    access = applyContractantTimesheetPermissions(access, session.menus);
  }

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
    hasTimesheetMenuView(context.session.menus) || hasContractantsView(context.session.menus);

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

const CONTRACTANT_MANAGE_ANY = [
  { menuId: CONTRACTANTS_TIMESHEET_MENU, action: 'edit' as const },
  { menuId: CONTRACTANTS_TIMESHEET_MENU, action: 'create' as const },
];

const CONTRACTANT_EDIT_ANY = [
  { menuId: CONTRACTANTS_TIMESHEET_MENU, action: 'edit' as const },
];

const CONTRACTANT_EXPORT_ANY = [
  { menuId: CONTRACTANTS_TIMESHEET_MENU, action: 'export' as const },
  { menuId: CONTRACTANTS_TIMESHEET_MENU, action: 'edit' as const },
  { menuId: CONTRACTANTS_TIMESHEET_MENU, action: 'create' as const },
];

export async function checkTimesheetOwnEdit(): Promise<NextResponse | null> {
  return checkPermission(TIMESHEET_MENU.self, 'edit');
}

export async function checkTimesheetManagerEdit(): Promise<NextResponse | null> {
  const deniedValidate = await checkPermission(TIMESHEET_MENU.validateOvertime, 'edit');
  if (!deniedValidate) return null;
  const deniedValidateView = await checkPermission(TIMESHEET_MENU.validateOvertime, 'view');
  if (!deniedValidateView) return null;
  const deniedDept = await checkPermission(TIMESHEET_MENU.department, 'edit');
  if (!deniedDept) return null;
  const deniedAll = await checkPermission(TIMESHEET_MENU.all, 'edit');
  if (!deniedAll) return null;
  return checkAnyPermission(CONTRACTANT_MANAGE_ANY);
}

export async function checkTimesheetOwnExport(): Promise<NextResponse | null> {
  return checkPermission(TIMESHEET_MENU.self, 'export');
}

export async function checkTimesheetImportOvertime(): Promise<NextResponse | null> {
  const deniedCreate = await checkPermission(TIMESHEET_MENU.importOvertime, 'create');
  if (!deniedCreate) return null;
  const deniedView = await checkPermission(TIMESHEET_MENU.importOvertime, 'view');
  if (!deniedView) return null;
  const deniedEdit = await checkPermission(TIMESHEET_MENU.importOvertime, 'edit');
  if (!deniedEdit) return null;
  return checkAnyPermission(CONTRACTANT_MANAGE_ANY);
}

export async function checkTimesheetValidateOvertime(): Promise<NextResponse | null> {
  const deniedEdit = await checkPermission(TIMESHEET_MENU.validateOvertime, 'edit');
  if (!deniedEdit) return null;
  const deniedView = await checkPermission(TIMESHEET_MENU.validateOvertime, 'view');
  if (!deniedView) return null;
  const deniedDept = await checkPermission(TIMESHEET_MENU.department, 'edit');
  if (!deniedDept) return null;
  const deniedAll = await checkPermission(TIMESHEET_MENU.all, 'edit');
  if (!deniedAll) return null;
  return checkAnyPermission(CONTRACTANT_EDIT_ANY);
}

export async function checkTimesheetEditValidatedOvertime(): Promise<NextResponse | null> {
  const deniedEdit = await checkPermission(TIMESHEET_MENU.editValidated, 'edit');
  if (!deniedEdit) return null;
  const deniedView = await checkPermission(TIMESHEET_MENU.editValidated, 'view');
  if (!deniedView) return null;
  return checkAnyPermission(CONTRACTANT_EDIT_ANY);
}

export async function checkTimesheetDepartmentExport(): Promise<NextResponse | null> {
  const deniedExportMenu = await checkPermission(TIMESHEET_MENU.export, 'export');
  if (!deniedExportMenu) return null;
  const deniedExportView = await checkPermission(TIMESHEET_MENU.export, 'view');
  if (!deniedExportView) return null;
  const deniedDept = await checkPermission(TIMESHEET_MENU.department, 'export');
  if (!deniedDept) return null;
  const deniedAll = await checkPermission(TIMESHEET_MENU.all, 'export');
  if (!deniedAll) return null;
  return checkAnyPermission(CONTRACTANT_EXPORT_ANY);
}

export async function checkTimesheetApplyPolicy(): Promise<NextResponse | null> {
  const deniedPolicy = await checkPermission(TIMESHEET_MENU.policy, 'edit');
  if (!deniedPolicy) return null;
  const deniedPolicyView = await checkPermission(TIMESHEET_MENU.policy, 'view');
  if (!deniedPolicyView) return null;
  const deniedCompilation = await checkPermission(TIMESHEET_MENU.compilation, 'create');
  if (!deniedCompilation) return null;
  return checkPermission(TIMESHEET_MENU.compilation, 'edit');
}

export async function checkTimesheetCloseMonth(): Promise<NextResponse | null> {
  const deniedCompilation = await checkPermission(TIMESHEET_MENU.compilation, 'edit');
  if (!deniedCompilation) return null;
  const deniedValidate = await checkPermission(TIMESHEET_MENU.validateOvertime, 'edit');
  if (!deniedValidate) return null;
  const deniedAll = await checkPermission(TIMESHEET_MENU.all, 'edit');
  if (!deniedAll) return null;
  return checkAnyPermission(CONTRACTANT_EDIT_ANY);
}

export function filterTimesheetEmployees(
  context: NonNullable<Awaited<ReturnType<typeof getTimesheetAccessFromSession>>>,
  department?: string,
) {
  return filterEmployeesForTimesheetScope(context.employees, context.access, department).filter(
    (employee) =>
      isContractantTimesheetMatricule(employee.matricule) ||
      isZambaLocalisation(employee.localisation),
  );
}
