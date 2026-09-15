import type { Employee } from './types';
import { compareExcoDepartments, normalizeServiceName, resolveExcoDepartment } from './exco-department-map';

export function getDepartments(employees: Employee[]): string[] {
  return [...new Set(employees.map((employee) => employee.departement).filter(Boolean))].sort(
    compareExcoDepartments,
  );
}

export function getLocalisations(employees: Employee[]): string[] {
  return [...new Set(employees.map((e) => (e.localisation || '').trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
}

/**
 * Département : libellé canonique.
 * Service : champ Service de la fiche, ou ancien libellé département qui était en réalité un service
 * (ex. Packaging & Logistics → Packing Plant). Jamais déduit du poste.
 */
export function applyEmployeeServicePrefill(employee: Employee): Employee {
  const resolved = resolveExcoDepartment(employee.departement || '');
  const nextDept = resolved.department || employee.departement || '';
  const storedService = (employee.service || '').trim();
  const nextService = storedService
    ? normalizeServiceName(storedService)
    : resolved.serviceName
      ? normalizeServiceName(resolved.serviceName)
      : '';
  if (nextDept === (employee.departement || '') && nextService === storedService) {
    return employee;
  }
  return { ...employee, departement: nextDept, service: nextService };
}
