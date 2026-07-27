import type { MenuPermission, SessionUser } from './auth-types';
import { canPerformAction } from './permission-check';
import type { Employee } from './types';

export const TIMESHEET_MENU = {
  self: 'employes.heures',
  department: 'employes.heures.dept',
  all: 'employes.heures.all',
  importOvertime: 'employes.heures.import',
  compilation: 'employes.heures.compilation',
} as const;

export type TimesheetViewScope = 'self' | 'department' | 'all';

export interface TimesheetAccessContext {
  scope: TimesheetViewScope;
  linkedEmployee: Employee | null;
  userDepartment: string | null;
  permissions: {
    viewOwn: boolean;
    editOwn: boolean;
    exportOwn: boolean;
    viewManager: boolean;
    editManager: boolean;
    exportDepartment: boolean;
    importOvertime: boolean;
    viewAll: boolean;
    applyPolicy: boolean;
    closeMonth: boolean;
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesDepartment(employeeDepartment: string, selectedDepartment: string): boolean {
  return normalize(employeeDepartment) === normalize(selectedDepartment);
}

export function resolveTimesheetViewScope(menus: MenuPermission[] | null | undefined): TimesheetViewScope {
  if (canPerformAction(menus, TIMESHEET_MENU.all, 'view')) return 'all';
  if (canPerformAction(menus, TIMESHEET_MENU.department, 'view')) return 'department';
  return 'self';
}

export function resolveEmployeeForSession(
  user: SessionUser,
  employees: Employee[],
): Employee | null {
  if (user.matricule) {
    return employees.find((employee) => employee.matricule === user.matricule) ?? null;
  }

  const byUsername = employees.find((employee) => employee.matricule === user.username);
  if (byUsername) return byUsername;

  const displayName = normalize(user.displayName);
  if (!displayName) return null;

  return (
    employees.find((employee) => normalize(employee.nom) === displayName) ??
    employees.find((employee) => displayName.includes(normalize(employee.nom))) ??
    null
  );
}

export function buildTimesheetAccessContext(
  user: SessionUser,
  menus: MenuPermission[],
  employees: Employee[],
): TimesheetAccessContext {
  const scope = resolveTimesheetViewScope(menus);
  const linkedEmployee = resolveEmployeeForSession(user, employees);

  return {
    scope,
    linkedEmployee,
    userDepartment: linkedEmployee?.departement?.trim() || null,
    permissions: {
      viewOwn: canPerformAction(menus, TIMESHEET_MENU.self, 'view'),
      editOwn: canPerformAction(menus, TIMESHEET_MENU.self, 'edit'),
      exportOwn: canPerformAction(menus, TIMESHEET_MENU.self, 'export'),
      viewManager:
        canPerformAction(menus, TIMESHEET_MENU.department, 'view') ||
        canPerformAction(menus, TIMESHEET_MENU.all, 'view'),
      editManager:
        canPerformAction(menus, TIMESHEET_MENU.department, 'edit') ||
        canPerformAction(menus, TIMESHEET_MENU.all, 'edit'),
      exportDepartment:
        canPerformAction(menus, TIMESHEET_MENU.department, 'export') ||
        canPerformAction(menus, TIMESHEET_MENU.all, 'export'),
      importOvertime: canPerformAction(menus, TIMESHEET_MENU.importOvertime, 'create'),
      viewAll: canPerformAction(menus, TIMESHEET_MENU.all, 'view'),
      applyPolicy:
        canPerformAction(menus, TIMESHEET_MENU.compilation, 'create') ||
        canPerformAction(menus, TIMESHEET_MENU.all, 'edit'),
      closeMonth:
        canPerformAction(menus, TIMESHEET_MENU.compilation, 'edit') ||
        canPerformAction(menus, TIMESHEET_MENU.all, 'edit'),
    },
  };
}

export function filterEmployeesForTimesheetScope(
  employees: Employee[],
  access: TimesheetAccessContext,
  selectedDepartment?: string,
): Employee[] {
  const withName = employees.filter((employee) => employee.nom.trim());

  if (access.scope === 'all') {
    if (selectedDepartment) {
      return withName.filter((employee) => matchesDepartment(employee.departement, selectedDepartment));
    }
    return withName;
  }

  if (access.scope === 'department') {
    const dept = access.userDepartment;
    if (!dept) return [];
    return withName.filter((employee) => matchesDepartment(employee.departement, dept));
  }

  if (!access.linkedEmployee) return [];
  return withName.filter((employee) => employee.matricule === access.linkedEmployee?.matricule);
}

export function canAccessEmployeeMatricule(
  access: TimesheetAccessContext,
  employees: Employee[],
  matricule: string,
): boolean {
  const employee = employees.find((item) => item.matricule === matricule);
  if (!employee) return false;

  if (access.scope === 'all') return true;

  if (access.scope === 'department') {
    if (!access.userDepartment) return false;
    return matchesDepartment(employee.departement, access.userDepartment);
  }

  return access.linkedEmployee?.matricule === matricule;
}

export function canAccessDepartment(
  access: TimesheetAccessContext,
  department: string,
): boolean {
  if (access.scope === 'all') return Boolean(department.trim());
  if (access.scope === 'department') {
    if (!access.userDepartment) return false;
    return matchesDepartment(department, access.userDepartment);
  }
  return false;
}

export function canEditOwnTimesheet(access: TimesheetAccessContext, matricule: string): boolean {
  if (!access.permissions.editOwn) return false;
  return access.linkedEmployee?.matricule === matricule;
}

export function canViewTimesheetModule(menus: MenuPermission[] | null | undefined): boolean {
  return (
    canPerformAction(menus, TIMESHEET_MENU.self, 'view') ||
    canPerformAction(menus, TIMESHEET_MENU.department, 'view') ||
    canPerformAction(menus, TIMESHEET_MENU.all, 'view')
  );
}

export function canViewTimesheetManager(menus: MenuPermission[] | null | undefined): boolean {
  return (
    canPerformAction(menus, TIMESHEET_MENU.department, 'view') ||
    canPerformAction(menus, TIMESHEET_MENU.all, 'view')
  );
}

export function canExportTimesheetOwn(menus: MenuPermission[] | null | undefined): boolean {
  return canPerformAction(menus, TIMESHEET_MENU.self, 'export');
}

export function canExportTimesheetDepartment(menus: MenuPermission[] | null | undefined): boolean {
  return (
    canPerformAction(menus, TIMESHEET_MENU.department, 'export') ||
    canPerformAction(menus, TIMESHEET_MENU.all, 'export')
  );
}

export function canEditTimesheetForMatricule(
  access: TimesheetAccessContext,
  matricule: string,
): boolean {
  if (access.scope === 'self') {
    return access.permissions.editOwn;
  }

  const isOwn = access.linkedEmployee?.matricule === matricule;
  if (isOwn) return access.permissions.editOwn;
  return access.permissions.editManager;
}
