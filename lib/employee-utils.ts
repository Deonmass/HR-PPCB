import type { Employee } from './types';
import { compareExcoDepartments, resolveExcoDepartment } from './exco-department-map';

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
 * Si l’ancien « département » est désormais un service (mapping EXCO),
 * renseigne le département parent + le service.
 */
export function applyEmployeeServicePrefill(employee: Employee): Employee {
  const resolved = resolveExcoDepartment(employee.departement || '');
  const nextDept = resolved.department || employee.departement || '';
  const nextService = (employee.service || '').trim() || resolved.serviceName || '';
  if (nextDept === (employee.departement || '') && nextService === (employee.service || '').trim()) {
    return employee;
  }
  return { ...employee, departement: nextDept, service: nextService };
}
