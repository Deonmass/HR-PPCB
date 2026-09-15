import type { DepartmentSetting, MenuPermission, OvertimeAccessScope, ServiceSetting } from './auth-types';
import { departmentsEqual, normalizeServiceName, resolveExcoDepartment } from './exco-department-map';
import type { Employee } from './types';

const OVERTIME_DEPT_MENU = 'employes.heures.dept';

export function emptyOvertimeScope(): OvertimeAccessScope {
  return { departmentIds: [], serviceIds: [] };
}

export function normalizeOvertimeScope(
  raw?: Partial<OvertimeAccessScope> | null,
): OvertimeAccessScope {
  const unique = (values: unknown) =>
    Array.from(
      new Set(
        (Array.isArray(values) ? values : [])
          .map((value) => String(value ?? '').trim())
          .filter(Boolean),
      ),
    );
  return {
    departmentIds: unique(raw?.departmentIds),
    serviceIds: unique(raw?.serviceIds),
  };
}

export function hasExplicitOvertimeScope(scope?: OvertimeAccessScope | null): boolean {
  if (!scope) return false;
  return scope.departmentIds.length > 0 || scope.serviceIds.length > 0;
}

export function getOvertimeScopeFromMenus(
  menus: MenuPermission[] | null | undefined,
): OvertimeAccessScope {
  const menu = menus?.find((item) => item.menuId === OVERTIME_DEPT_MENU);
  return normalizeOvertimeScope(menu?.overtimeScope);
}

function nameKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesEqual(a: string, b: string): boolean {
  const ka = nameKey(a);
  const kb = nameKey(b);
  return Boolean(ka) && ka === kb;
}

export function resolveAllowedDepartmentNames(
  scope: OvertimeAccessScope,
  departments: DepartmentSetting[],
  services: ServiceSetting[],
): string[] {
  const names = new Set<string>();
  for (const id of scope.departmentIds) {
    const department = departments.find((item) => item.id === id);
    if (department?.name.trim()) names.add(department.name.trim());
  }
  for (const id of scope.serviceIds) {
    const service = services.find((item) => item.id === id);
    if (!service) continue;
    const parent = departments.find((item) => item.id === service.departmentId);
    if (parent?.name.trim()) names.add(parent.name.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Libellés service autorisés par le périmètre HS (canoniques inclus). */
export function resolveAllowedServiceNames(
  scope: OvertimeAccessScope,
  departments: DepartmentSetting[],
  services: ServiceSetting[],
): string[] {
  const names = new Set<string>();
  const addServiceName = (raw: string) => {
    const normalized = normalizeServiceName(raw) || raw.trim();
    if (normalized) names.add(normalized);
  };

  for (const id of scope.serviceIds) {
    const service = services.find((item) => item.id === id);
    if (service?.name.trim()) addServiceName(service.name);
  }

  for (const id of scope.departmentIds) {
    for (const service of services) {
      if (service.departmentId !== id || !service.name.trim()) continue;
      addServiceName(service.name);
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
}

/** Services rattachés à une liste de départements (par nom). */
export function resolveServiceNamesForDepartments(
  departmentNames: string[],
  departments: DepartmentSetting[],
  services: ServiceSetting[],
): string[] {
  const wanted = departmentNames.map((name) => name.trim()).filter(Boolean);
  if (!wanted.length) return [];
  const names = new Set<string>();
  for (const department of departments) {
    if (!wanted.some((name) => departmentsEqual(name, department.name))) continue;
    for (const service of services) {
      if (service.departmentId !== department.id || !service.name.trim()) continue;
      const normalized = normalizeServiceName(service.name) || service.name.trim();
      if (normalized) names.add(normalized);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'fr'));
}

function employeeMatchesService(
  employee: Employee,
  service: ServiceSetting,
  departments: DepartmentSetting[],
): boolean {
  const storedService = normalizeServiceName((employee.service || '').trim());
  if (!storedService) return false;

  const parent = departments.find((item) => item.id === service.departmentId);
  const serviceHit =
    namesEqual(storedService, service.name)
    || namesEqual(storedService, service.code || '')
    || namesEqual(storedService, normalizeServiceName(service.name));
  if (!serviceHit) return false;
  if (!parent) return true;
  return (
    departmentsEqual(employee.departement, parent.name)
    || departmentsEqual(resolveExcoDepartment(employee.departement || '').department, parent.name)
  );
}

export function employeeMatchesOvertimeScope(
  employee: Employee,
  scope: OvertimeAccessScope,
  departments: DepartmentSetting[],
  services: ServiceSetting[],
): boolean {
  if (!hasExplicitOvertimeScope(scope)) return false;

  for (const id of scope.departmentIds) {
    const department = departments.find((item) => item.id === id);
    if (department && departmentsEqual(employee.departement, department.name)) return true;
  }

  for (const id of scope.serviceIds) {
    const service = services.find((item) => item.id === id);
    if (service && employeeMatchesService(employee, service, departments)) return true;
  }

  return false;
}

export function canAccessDepartmentWithOvertimeScope(
  departmentName: string,
  scope: OvertimeAccessScope,
  departments: DepartmentSetting[],
  services: ServiceSetting[],
): boolean {
  if (!departmentName.trim()) return false;
  return resolveAllowedDepartmentNames(scope, departments, services).some((name) =>
    departmentsEqual(name, departmentName),
  );
}
