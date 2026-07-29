import type { MenuPermission, SessionUser } from './auth-types';
import { canPerformAction } from './permission-check';
import type { Employee } from './types';

export const TIMESHEET_MENU = {
  self: 'employes.heures',
  department: 'employes.heures.dept',
  all: 'employes.heures.all',
  importOvertime: 'employes.heures.import',
  validateOvertime: 'employes.heures.validate',
  editValidated: 'employes.heures.edit-validated',
  policy: 'employes.heures.policy',
  export: 'employes.heures.export',
  simulation: 'employes.heures.simulation',
  /** @deprecated kept for stored permissions compatibility */
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
    validateOvertime: boolean;
    editValidatedOvertime: boolean;
    viewAll: boolean;
    applyPolicy: boolean;
    closeMonth: boolean;
    simulation: boolean;
  };
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/** True if any standard action is granted on the menu (for capability menus). */
function hasAnyAction(menus: MenuPermission[] | null | undefined, menuId: string): boolean {
  return (
    canPerformAction(menus, menuId, 'view') ||
    canPerformAction(menus, menuId, 'create') ||
    canPerformAction(menus, menuId, 'edit') ||
    canPerformAction(menus, menuId, 'delete') ||
    canPerformAction(menus, menuId, 'export')
  );
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

  const importOvertime = hasAnyAction(menus, TIMESHEET_MENU.importOvertime);
  const validateOvertime =
    hasAnyAction(menus, TIMESHEET_MENU.validateOvertime) ||
    canPerformAction(menus, TIMESHEET_MENU.department, 'edit') ||
    canPerformAction(menus, TIMESHEET_MENU.all, 'edit');
  const editValidatedOvertime = hasAnyAction(menus, TIMESHEET_MENU.editValidated);
  const applyPolicy =
    hasAnyAction(menus, TIMESHEET_MENU.policy) ||
    canPerformAction(menus, TIMESHEET_MENU.compilation, 'create') ||
    canPerformAction(menus, TIMESHEET_MENU.compilation, 'edit');
  const exportDepartment =
    canPerformAction(menus, TIMESHEET_MENU.export, 'export') ||
    canPerformAction(menus, TIMESHEET_MENU.export, 'view') ||
    canPerformAction(menus, TIMESHEET_MENU.department, 'export') ||
    canPerformAction(menus, TIMESHEET_MENU.all, 'export');
  const simulation =
    hasAnyAction(menus, TIMESHEET_MENU.simulation) ||
    canPerformAction(menus, TIMESHEET_MENU.compilation, 'view');

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
        canPerformAction(menus, TIMESHEET_MENU.all, 'edit') ||
        validateOvertime ||
        editValidatedOvertime,
      exportDepartment,
      importOvertime,
      validateOvertime,
      editValidatedOvertime,
      viewAll: canPerformAction(menus, TIMESHEET_MENU.all, 'view'),
      applyPolicy,
      closeMonth:
        canPerformAction(menus, TIMESHEET_MENU.compilation, 'edit') ||
        canPerformAction(menus, TIMESHEET_MENU.all, 'edit') ||
        validateOvertime,
      simulation,
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
    canPerformAction(menus, TIMESHEET_MENU.export, 'export') ||
    canPerformAction(menus, TIMESHEET_MENU.export, 'view') ||
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
