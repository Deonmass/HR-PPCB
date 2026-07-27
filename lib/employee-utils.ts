import type { Employee } from './types';

export function getDepartments(employees: Employee[]): string[] {
  return [...new Set(employees.map((employee) => employee.departement).filter(Boolean))].sort();
}
