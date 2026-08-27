/**
 * Synchronise départements / services EXCO selon le mapping BASE.
 */
import 'server-only';

import {
  EXCO_CANONICAL_DEPARTMENTS,
  EXCO_CANONICAL_SERVICES,
  EXCO_LEGACY_DEPARTMENTS_TO_DEACTIVATE,
  resolveExcoDepartment,
} from './exco-department-map';
import { resolveExcoBaseWorkbook } from './exco-base-source';
import { parseExcoNewReport } from './exco-new-report-parse';
import { readEmployeesBundle, upsertEmployee } from './employees-json-store';
import {
  listDepartments,
  listServices,
  upsertDepartment,
  upsertService,
} from './settings-store';

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function syncExcoDepartmentsAndServices(input: {
  year: number;
  month: number;
}): Promise<{
  createdDepartments: number;
  renamedDepartments: number;
  deactivatedServiceDepts: number;
  createdServices: number;
  employeesUpdated: number;
}> {
  const { year, month } = input;
  const newReport = await resolveExcoBaseWorkbook(year, month);
  if (!newReport) {
    throw new Error('New report.xlsx requis (feuille BASE)');
  }
  const snap = parseExcoNewReport(newReport.buffer, newReport.originalName);

  const neededDepts = new Set<string>([...EXCO_CANONICAL_DEPARTMENTS]);
  for (const e of snap.employees) {
    const resolved = resolveExcoDepartment(e.department);
    if (resolved.department) neededDepts.add(resolved.department);
  }

  let existing = await listDepartments();
  const byNorm = new Map(existing.map((d) => [norm(d.name), d]));

  let createdDepartments = 0;
  let renamedDepartments = 0;

  for (const name of neededDepts) {
    const key = norm(name);
    const found = byNorm.get(key);
    if (found) {
      if (found.name !== name || found.active === false) {
        await upsertDepartment({
          id: found.id,
          name,
          code: name,
          active: true,
        });
        renamedDepartments += 1;
      }
      continue;
    }
    const created = await upsertDepartment({
      id: '',
      name,
      code: name,
      active: true,
    });
    byNorm.set(key, created);
    createdDepartments += 1;
  }

  existing = await listDepartments();
  const deptByNorm = new Map(existing.map((d) => [norm(d.name), d]));

  let deactivatedServiceDepts = 0;
  for (const bad of EXCO_LEGACY_DEPARTMENTS_TO_DEACTIVATE) {
    const found = deptByNorm.get(norm(bad));
    if (!found || found.active === false) continue;
    if (EXCO_CANONICAL_DEPARTMENTS.some((c) => norm(c) === norm(found.name))) continue;
    await upsertDepartment({
      id: found.id,
      name: found.name,
      code: found.code || found.name,
      active: false,
    });
    deactivatedServiceDepts += 1;
  }

  const services = await listServices();
  let createdServices = 0;
  for (const spec of EXCO_CANONICAL_SERVICES) {
    const parent = deptByNorm.get(norm(spec.department));
    if (!parent) continue;
    const exists = services.some(
      (s) =>
        s.departmentId === parent.id
        && norm(s.name) === norm(spec.serviceName),
    );
    if (exists) continue;
    await upsertService({
      id: '',
      name: spec.serviceName,
      code: spec.serviceName,
      departmentId: parent.id,
      active: true,
    });
    createdServices += 1;
  }

  const bundle = await readEmployeesBundle();
  let employeesUpdated = 0;
  const baseByMat = new Map(snap.employees.map((e) => [e.matricule, e]));
  for (const emp of [...bundle.employees, ...bundle.exits]) {
    const base = baseByMat.get(emp.matricule);
    const fromBase = base?.department
      ? resolveExcoDepartment(base.department)
      : null;
    const fromEmp = resolveExcoDepartment(emp.departement || '');
    const target = fromBase?.department || fromEmp.department;
    if (!target) continue;
    if (
      norm(emp.departement || '') === norm(target)
      && norm(emp.departmentHr || '') === norm(target)
    ) {
      continue;
    }
    await upsertEmployee({
      ...emp,
      departement: target,
      departmentHr: target,
    });
    employeesUpdated += 1;
  }

  return {
    createdDepartments,
    renamedDepartments,
    deactivatedServiceDepts,
    createdServices,
    employeesUpdated,
  };
}
