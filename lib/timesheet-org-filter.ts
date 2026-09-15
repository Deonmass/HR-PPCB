import type { Employee } from './types';
import { EXCO_CANONICAL_SERVICES, normalizeServiceName, resolveExcoDepartment } from './exco-department-map';
import { matchesDepartment, type TimesheetViewScope } from './timesheet-permissions';

export type TimesheetOrgKind = 'department' | 'service';

export interface TimesheetOrgOption {
  kind: TimesheetOrgKind;
  name: string;
  count: number;
}

export interface TimesheetOrgScopeFilter {
  scope?: TimesheetViewScope | null;
  allowedDepartments?: string[];
  allowedServices?: string[];
}

export function timesheetOrgValue(kind: TimesheetOrgKind, name: string): string {
  return kind === 'service' ? `svc:${name}` : `dept:${name}`;
}

export function parseTimesheetOrgValue(value: string): { kind: TimesheetOrgKind; name: string } | null {
  if (!value) return null;
  if (value.startsWith('svc:')) return { kind: 'service', name: value.slice(4) };
  if (value.startsWith('dept:')) return { kind: 'department', name: value.slice(5) };
  return { kind: 'department', name: value };
}

export function countNamedUnits(
  employees: Employee[],
  pick: (employee: Employee) => string,
): TimesheetOrgOption[] {
  const counts = new Map<string, number>();
  for (const employee of employees) {
    if (!employee.nom.trim()) continue;
    const name = pick(employee).trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([name, count]) => ({ kind: 'department', name, count }));
}

function employeeHasService(employee: Employee): boolean {
  return Boolean(normalizeServiceName((employee.service || '').trim()));
}

function serviceNamesEqual(a: string, b: string): boolean {
  const na = normalizeServiceName(a) || a.trim();
  const nb = normalizeServiceName(b) || b.trim();
  return Boolean(na) && na === nb;
}

/** Département = agents sans service renseigné. Service = agents avec ce service. */
export function listTimesheetDepartments(employees: Employee[]): TimesheetOrgOption[] {
  return countNamedUnits(
    employees.filter((employee) => employee.nom.trim() && !employeeHasService(employee)),
    (employee) => resolveExcoDepartment(employee.departement).department || employee.departement,
  ).map((item) => ({
    ...item,
    kind: 'department',
  }));
}

export function listTimesheetServices(
  employees: Employee[],
  options?: { padCanonical?: boolean; allowedServiceNames?: string[] | null },
): TimesheetOrgOption[] {
  const counted = countNamedUnits(
    employees.filter((employee) => employee.nom.trim() && employeeHasService(employee)),
    (employee) => normalizeServiceName((employee.service || '').trim()),
  );
  const byName = new Map(counted.map((item) => [item.name, { ...item, kind: 'service' as const }]));
  const allowed = (options?.allowedServiceNames ?? [])
    .map((name) => normalizeServiceName(name) || name.trim())
    .filter(Boolean);
  const allowedSet = allowed.length ? new Set(allowed) : null;
  const padCanonical = options?.padCanonical !== false;

  if (padCanonical) {
    for (const spec of EXCO_CANONICAL_SERVICES) {
      if (allowedSet && !allowedSet.has(spec.serviceName)) continue;
      if (!byName.has(spec.serviceName)) {
        byName.set(spec.serviceName, { kind: 'service', name: spec.serviceName, count: 0 });
      }
    }
  }

  let list = Array.from(byName.values());
  if (allowedSet) {
    list = list.filter((item) => allowedSet.has(normalizeServiceName(item.name) || item.name));
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** Options département/service respectant le périmètre HS du superviseur. */
export function listScopedTimesheetOrgOptions(
  employees: Employee[],
  access: TimesheetOrgScopeFilter,
): { departments: TimesheetOrgOption[]; services: TimesheetOrgOption[] } {
  const unrestricted = access.scope === 'all';
  const allowedDepartments = (access.allowedDepartments ?? []).map((name) => name.trim()).filter(Boolean);
  const allowedServices = (access.allowedServices ?? []).map((name) => name.trim()).filter(Boolean);

  let departments = listTimesheetDepartments(employees);
  let services = listTimesheetServices(employees, {
    padCanonical: unrestricted || allowedServices.length > 0,
    allowedServiceNames: unrestricted ? null : allowedServices,
  });

  if (!unrestricted && allowedDepartments.length) {
    departments = departments.filter((item) =>
      allowedDepartments.some((name) => matchesDepartment(item.name, name)),
    );
  } else if (!unrestricted) {
    departments = [];
  }

  if (!unrestricted && allowedServices.length) {
    services = services.filter((item) =>
      allowedServices.some((name) => serviceNamesEqual(item.name, name)),
    );
  } else if (!unrestricted && allowedDepartments.length) {
    services = services.filter((item) => {
      const parent = departmentForService(employees, item.name);
      return allowedDepartments.some((name) => matchesDepartment(parent, name));
    });
  } else if (!unrestricted) {
    services = [];
  }

  return { departments, services };
}

export function employeesForOrgFilter(
  employees: Employee[],
  kind: TimesheetOrgKind,
  name: string,
): Employee[] {
  if (!name) return [];
  return employees
    .filter((employee) => {
      if (!employee.nom.trim()) return false;
      if (kind === 'service') {
        const stored = normalizeServiceName((employee.service || '').trim());
        return Boolean(stored) && stored === normalizeServiceName(name);
      }
      // Département : uniquement les agents sans service (sinon ils sont dans le service).
      if (employeeHasService(employee)) return false;
      return matchesDepartment(employee.departement, name);
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export function departmentForService(
  employees: Employee[],
  serviceName: string,
  options?: { preferDepartments?: string[]; allowCanonicalFallback?: boolean },
): string {
  const wanted = normalizeServiceName(serviceName) || serviceName;
  const counts = new Map<string, number>();
  for (const employee of employees) {
    if (normalizeServiceName(employee.service || '') !== wanted) continue;
    const dept = employee.departement?.trim();
    if (!dept) continue;
    counts.set(dept, (counts.get(dept) ?? 0) + 1);
  }
  let best = '';
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  if (best) return best;

  const preferred = (options?.preferDepartments ?? []).map((name) => name.trim()).filter(Boolean);
  if (preferred.length) {
    const match = preferred.find((name) =>
      employees.some(
        (employee) =>
          normalizeServiceName(employee.service || '') === wanted &&
          matchesDepartment(employee.departement, name),
      ),
    );
    if (match) return match;
    return preferred[0];
  }

  if (options?.allowCanonicalFallback === false) return '';
  return EXCO_CANONICAL_SERVICES.find((spec) => spec.serviceName === wanted)?.department ?? '';
}
