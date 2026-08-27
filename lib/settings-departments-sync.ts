/**
 * Aligne data/settings/departments.json sur les libellés canoniques EXCO.
 */
import 'server-only';

import {
  EXCO_CANONICAL_DEPARTMENTS,
  EXCO_CANONICAL_SERVICES,
  EXCO_LEGACY_DEPARTMENTS_TO_DEACTIVATE,
  normalizeDepartmentName,
} from './exco-department-map';
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

export async function syncCanonicalDepartmentsSettings(): Promise<{
  created: number;
  renamed: number;
  deactivated: number;
  servicesCreated: number;
}> {
  let existing = await listDepartments();
  const byNorm = new Map(existing.map((d) => [norm(d.name), d]));

  let created = 0;
  let renamed = 0;
  let deactivated = 0;
  let servicesCreated = 0;

  for (const name of EXCO_CANONICAL_DEPARTMENTS) {
    const key = norm(name);
    const found = byNorm.get(key);
    if (found) {
      if (found.name !== name || found.code !== name || found.active === false) {
        await upsertDepartment({
          id: found.id,
          name,
          code: name,
          active: true,
        });
        renamed += 1;
      }
      continue;
    }
    const createdItem = await upsertDepartment({
      id: '',
      name,
      code: name,
      active: true,
    });
    byNorm.set(key, createdItem);
    created += 1;
  }

  existing = await listDepartments();
  const deptByNorm = new Map(existing.map((d) => [norm(d.name), d]));

  for (const d of existing) {
    const canonical = normalizeDepartmentName(d.name);
    const isLegacy = EXCO_LEGACY_DEPARTMENTS_TO_DEACTIVATE.some(
      (x) => norm(x) === norm(d.name),
    );
    const isCanonical = EXCO_CANONICAL_DEPARTMENTS.some((c) => norm(c) === norm(d.name));

    if (isLegacy || (!isCanonical && canonical && norm(canonical) !== norm(d.name))) {
      if (d.active) {
        await upsertDepartment({
          id: d.id,
          name: d.name,
          code: d.code || d.name,
          active: false,
        });
        deactivated += 1;
      }
      continue;
    }

    // Rename & → and when the row is the canonical dept under old spelling
    if (isCanonical && d.name !== canonical && canonical) {
      await upsertDepartment({
        id: d.id,
        name: canonical,
        code: canonical,
        active: true,
      });
      renamed += 1;
    }
  }

  existing = await listDepartments();
  const parents = new Map(existing.map((d) => [norm(d.name), d]));
  const services = await listServices();

  for (const spec of EXCO_CANONICAL_SERVICES) {
    const parent = parents.get(norm(spec.department));
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
    servicesCreated += 1;
  }

  return { created, renamed, deactivated, servicesCreated };
}
