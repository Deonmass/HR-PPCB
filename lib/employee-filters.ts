import type { Employee } from './types';

export interface EmployeeFilters {
  search: string;
  dept: string;
}

export function filterEmployees(employees: Employee[], filters: EmployeeFilters): Employee[] {
  const q = filters.search.toLowerCase().trim();
  return employees.filter((e) => {
    const matchSearch =
      !q ||
      e.nom.toLowerCase().includes(q) ||
      e.matricule.includes(q) ||
      e.departement.toLowerCase().includes(q);
    const matchDept = !filters.dept || e.departement === filters.dept;
    return matchSearch && matchDept;
  });
}

export function buildExportSuffix(filters: EmployeeFilters): string {
  const parts: string[] = [];
  if (filters.dept) parts.push(filters.dept.replace(/[^\w&-]+/g, '_'));
  if (filters.search.trim()) parts.push('filtre');
  return parts.length ? `_${parts.join('_')}` : '';
}

export function buildExportDateStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
