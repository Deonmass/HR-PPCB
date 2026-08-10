import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_POSTES_VACANTS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { readEmployeesBundle, upsertEmployee } from './employees-json-store';
import type {
  CatalogPosteUpdate,
  EmployeePosteUpdate,
  PosteFieldSuggestions,
  PosteGroup,
  PosteOccupant,
  PostesBundle,
  PostesDashboard,
  PostesStatRow,
  VacantPoste,
  VacantPosteInput,
} from './postes-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { Employee } from './types';

function resolveVacantsPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'postes-vacants.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'postes-vacants.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'postes-vacants.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

interface VacantsStore {
  vacants: VacantPoste[];
}

function resolveTitle(emp: Employee): string {
  return (emp.jobTitle || emp.position || '').trim();
}

function majority(values: string[]): string {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const v = raw.trim();
    if (!v) continue;
    counts.set(v, (counts.get(v) || 0) + 1);
  }
  let best = '';
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
}

function toOccupant(emp: Employee): PosteOccupant {
  return {
    matricule: emp.matricule,
    nom: emp.nom,
    departement: emp.departement || emp.departmentHr || '',
    grade: emp.grade || emp.patersonGrade || '',
    localisation: emp.localisation || '',
    jobTitle: emp.jobTitle || '',
    position: emp.position || '',
    statut: emp.statut || '',
    company: emp.company || '',
    centreCout: emp.centreCout || '',
    lineManagerName: emp.lineManagerName || '',
    lineManagerPosition: emp.lineManagerPosition || '',
  };
}

function buildGroups(employees: Employee[]): PosteGroup[] {
  const map = new Map<string, PosteGroup>();
  for (const emp of employees) {
    if (String(emp.statut || '').toLowerCase() === 'inactive') continue;
    const title = resolveTitle(emp);
    if (!title) continue;
    const key = title.toLowerCase();
    const dept = (emp.departement || emp.departmentHr || '').trim();
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        title,
        count: 1,
        departments: dept ? [dept] : [],
        department: '',
        location: '',
        grade: '',
        costCenter: '',
        reportsTo: '',
        company: '',
        occupants: [toOccupant(emp)],
      });
    } else {
      existing.count += 1;
      existing.occupants.push(toOccupant(emp));
      if (dept && !existing.departments.some((d) => d.toLowerCase() === dept.toLowerCase())) {
        existing.departments.push(dept);
      }
    }
  }

  for (const g of map.values()) {
    g.department = majority(g.occupants.map((o) => o.departement));
    g.location = majority(g.occupants.map((o) => o.localisation));
    g.grade = majority(g.occupants.map((o) => o.grade));
    g.costCenter = majority(g.occupants.map((o) => o.centreCout));
    g.company = majority(g.occupants.map((o) => o.company));
    g.reportsTo = majority(
      g.occupants.flatMap((o) =>
        [o.lineManagerName, o.lineManagerPosition].filter(Boolean),
      ),
    );
    g.departments.sort((a, b) => a.localeCompare(b, 'fr'));
  }

  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

function topCounts(map: Map<string, number>, limit = 8): PostesStatRow[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .slice(0, limit)
    .map(([label, value]) => ({ label, value }));
}

function buildDashboard(
  groups: PosteGroup[],
  vacantSlots: number,
): PostesDashboard {
  const totalPostes = groups.length;
  const totalOccupants = groups.reduce((s, g) => s + g.count, 0);
  let monoOccupant = 0;
  let multiOccupant = 0;
  const deptMap = new Map<string, number>();
  const locMap = new Map<string, number>();
  const topMap = new Map<string, number>();

  for (const g of groups) {
    if (g.count <= 1) monoOccupant += 1;
    else multiOccupant += 1;
    topMap.set(g.title, g.count);
    for (const o of g.occupants) {
      const d = o.departement.trim() || 'Non renseigné';
      deptMap.set(d, (deptMap.get(d) || 0) + 1);
      const loc = o.localisation.trim() || 'Non renseigné';
      locMap.set(loc, (locMap.get(loc) || 0) + 1);
    }
  }

  return {
    totalPostes,
    totalOccupants,
    totalVacantSlots: vacantSlots,
    monoOccupant,
    multiOccupant,
    byDepartment: topCounts(deptMap, 10),
    byLocation: topCounts(locMap, 8),
    topPostes: topCounts(topMap, 8),
    occupancy: [
      {
        label: 'Occupés',
        value: totalOccupants,
        color: '#047857',
      },
      {
        label: 'Vacants',
        value: vacantSlots,
        color: '#e30613',
      },
    ].filter((s) => s.value > 0),
  };
}

function buildSuggestions(
  employees: Employee[],
  vacants: VacantPoste[],
  groups: PosteGroup[],
): PosteFieldSuggestions {
  const departments = uniqueSorted([
    ...employees.flatMap((e) => [e.departement, e.departmentHr]),
    ...vacants.map((v) => v.department),
    ...groups.flatMap((g) => g.departments),
  ]);
  const locations = uniqueSorted([
    ...employees.map((e) => e.localisation),
    ...vacants.map((v) => v.location),
  ]);
  const grades = uniqueSorted([
    ...employees.flatMap((e) => [e.grade, e.patersonGrade]),
    ...vacants.map((v) => v.grade),
  ]);
  const costCenters = uniqueSorted([
    ...employees.map((e) => e.centreCout),
    ...vacants.map((v) => v.costCenter),
  ]);
  const reportsTo = uniqueSorted([
    ...employees.flatMap((e) => [e.lineManagerName, e.lineManagerPosition]),
    ...vacants.map((v) => v.reportsTo),
  ]);
  const titles = uniqueSorted([
    ...groups.map((g) => g.title),
    ...vacants.map((v) => v.title),
  ]);
  return { departments, locations, grades, costCenters, reportsTo, titles };
}

async function readVacantsStore(): Promise<VacantsStore> {
  const filePath = resolveVacantsPath();
  await hydrateDurableFile(DURABLE_POSTES_VACANTS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<VacantsStore>;
    const vacants = Array.isArray(parsed.vacants)
      ? parsed.vacants
          .map((v) => normalizeVacant(v))
          .filter((v): v is VacantPoste => Boolean(v))
      : [];
    return { vacants };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { vacants: [] };
    throw err;
  }
}

async function writeVacantsStore(store: VacantsStore): Promise<void> {
  const filePath = resolveVacantsPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
  await persistDurableFile(DURABLE_POSTES_VACANTS_KEY, filePath);
}

function normalizeVacant(raw: unknown): VacantPoste | null {
  if (!raw || typeof raw !== 'object') return null;
  const v = raw as Partial<VacantPoste>;
  if (!v.id || !v.title) return null;
  return {
    id: String(v.id),
    title: String(v.title || '').trim(),
    department: String(v.department || '').trim(),
    location: String(v.location || '').trim(),
    grade: String(v.grade || '').trim(),
    reportsTo: String(v.reportsTo || '').trim(),
    costCenter: String(v.costCenter || '').trim(),
    jobDescription: String(v.jobDescription || '').trim(),
    jobLevel: String(v.jobLevel || '').trim(),
    headcount: Math.max(1, Number(v.headcount) || 1),
    notes: String(v.notes || '').trim(),
    createdAt: String(v.createdAt || new Date().toISOString()),
    updatedAt: String(v.updatedAt || v.createdAt || new Date().toISOString()),
  };
}

export async function getPostesBundle(): Promise<PostesBundle> {
  const [{ employees }, vacantsStore] = await Promise.all([
    readEmployeesBundle(),
    readVacantsStore(),
  ]);
  const groups = buildGroups(employees);
  const vacants = [...vacantsStore.vacants].sort((a, b) =>
    a.title.localeCompare(b.title, 'fr'),
  );
  const totalVacantSlots = vacants.reduce((sum, v) => sum + v.headcount, 0);
  const titles = groups.map((g) => g.title);
  return {
    titles,
    groups,
    vacants,
    totalOccupied: groups.reduce((sum, g) => sum + g.count, 0),
    totalVacantSlots,
    suggestions: buildSuggestions(employees, vacants, groups),
    dashboard: buildDashboard(groups, totalVacantSlots),
  };
}

export async function createVacantPoste(input: VacantPosteInput): Promise<VacantPoste> {
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Intitulé du poste requis');
  const store = await readVacantsStore();
  const now = new Date().toISOString();
  const item: VacantPoste = {
    id: `vac-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    department: String(input.department || '').trim(),
    location: String(input.location || '').trim(),
    grade: String(input.grade || '').trim(),
    reportsTo: String(input.reportsTo || '').trim(),
    costCenter: String(input.costCenter || '').trim(),
    jobDescription: String(input.jobDescription || '').trim(),
    jobLevel: String(input.jobLevel || '').trim(),
    headcount: Math.max(1, Number(input.headcount) || 1),
    notes: String(input.notes || '').trim(),
    createdAt: now,
    updatedAt: now,
  };
  store.vacants.push(item);
  await writeVacantsStore(store);
  return item;
}

export async function updateVacantPoste(
  id: string,
  input: VacantPosteInput,
): Promise<VacantPoste | null> {
  const store = await readVacantsStore();
  const index = store.vacants.findIndex((v) => v.id === id);
  if (index < 0) return null;
  const title = String(input.title || '').trim();
  if (!title) throw new Error('Intitulé du poste requis');
  const prev = store.vacants[index];
  const next: VacantPoste = {
    ...prev,
    title,
    department: String(input.department ?? prev.department).trim(),
    location: String(input.location ?? prev.location).trim(),
    grade: String(input.grade ?? prev.grade).trim(),
    reportsTo: String(input.reportsTo ?? prev.reportsTo).trim(),
    costCenter: String(input.costCenter ?? prev.costCenter).trim(),
    jobDescription: String(input.jobDescription ?? prev.jobDescription).trim(),
    jobLevel: String(input.jobLevel ?? prev.jobLevel).trim(),
    headcount: Math.max(1, Number(input.headcount ?? prev.headcount) || 1),
    notes: String(input.notes ?? prev.notes).trim(),
    updatedAt: new Date().toISOString(),
  };
  store.vacants[index] = next;
  await writeVacantsStore(store);
  return next;
}

export async function deleteVacantPoste(id: string): Promise<boolean> {
  const store = await readVacantsStore();
  const next = store.vacants.filter((v) => v.id !== id);
  if (next.length === store.vacants.length) return false;
  store.vacants = next;
  await writeVacantsStore(store);
  return true;
}

/** Met à jour les champs « poste » d’un employé (fichier employés). */
export async function updateEmployeePoste(input: EmployeePosteUpdate): Promise<Employee> {
  const matricule = String(input.matricule || '').trim();
  if (!matricule) throw new Error('Matricule requis');
  const jobTitle = String(input.jobTitle || '').trim();
  if (!jobTitle) throw new Error('Poste / job title requis');

  const { employees } = await readEmployeesBundle();
  const agent = employees.find(
    (e) => e.matricule.trim().toLowerCase() === matricule.toLowerCase(),
  );
  if (!agent) throw new Error('Employé introuvable');

  return upsertEmployee({
    ...agent,
    jobTitle,
    position: input.position !== undefined ? String(input.position).trim() : jobTitle,
    departement:
      input.departement !== undefined
        ? String(input.departement).trim()
        : agent.departement,
    departmentHr:
      input.departmentHr !== undefined
        ? String(input.departmentHr).trim()
        : input.departement !== undefined
          ? String(input.departement).trim()
          : agent.departmentHr,
    grade: input.grade !== undefined ? String(input.grade).trim() : agent.grade,
    localisation:
      input.localisation !== undefined
        ? String(input.localisation).trim()
        : agent.localisation,
    centreCout:
      input.centreCout !== undefined ? String(input.centreCout).trim() : agent.centreCout,
    lineManagerName:
      input.lineManagerName !== undefined
        ? String(input.lineManagerName).trim()
        : agent.lineManagerName,
    lineManagerPosition:
      input.lineManagerPosition !== undefined
        ? String(input.lineManagerPosition).trim()
        : agent.lineManagerPosition,
    patersonGrade:
      input.patersonGrade !== undefined
        ? String(input.patersonGrade).trim()
        : agent.patersonGrade,
    company: input.company !== undefined ? String(input.company).trim() : agent.company,
  });
}

/** Renomme un intitulé de poste pour tous les occupants. */
export async function renamePosteTitle(
  fromTitle: string,
  toTitle: string,
): Promise<{ updated: number }> {
  return updateCatalogPoste({
    fromTitle,
    title: toTitle,
    applyMeta: false,
  });
}

/**
 * Met à jour un poste catalogue (intitulé + méta) sur tous les employés concernés.
 */
export async function updateCatalogPoste(
  input: CatalogPosteUpdate,
): Promise<{ updated: number }> {
  const from = String(input.fromTitle || '').trim();
  const to = String(input.title || '').trim();
  if (!from || !to) throw new Error('Ancien et nouvel intitulés requis');

  const applyMeta = input.applyMeta !== false;
  const department =
    input.department !== undefined ? String(input.department).trim() : undefined;
  const location =
    input.location !== undefined ? String(input.location).trim() : undefined;
  const grade = input.grade !== undefined ? String(input.grade).trim() : undefined;
  const costCenter =
    input.costCenter !== undefined ? String(input.costCenter).trim() : undefined;
  const reportsTo =
    input.reportsTo !== undefined ? String(input.reportsTo).trim() : undefined;
  const company = input.company !== undefined ? String(input.company).trim() : undefined;

  const titleChanged = from.toLowerCase() !== to.toLowerCase();
  const hasMeta =
    applyMeta
    && (department !== undefined
      || location !== undefined
      || grade !== undefined
      || costCenter !== undefined
      || reportsTo !== undefined
      || company !== undefined);

  if (!titleChanged && !hasMeta) return { updated: 0 };

  const { employees } = await readEmployeesBundle();
  let updated = 0;
  for (const emp of employees) {
    const t = resolveTitle(emp);
    if (t.toLowerCase() !== from.toLowerCase()) continue;

    const next: Employee = {
      ...emp,
      jobTitle: titleChanged ? to : emp.jobTitle || to,
      position:
        titleChanged
          ? emp.position?.trim() === from || !emp.position?.trim()
            ? to
            : emp.position
          : emp.position,
    };

    if (applyMeta) {
      if (department !== undefined) {
        next.departement = department;
        next.departmentHr = department;
      }
      if (location !== undefined) next.localisation = location;
      if (grade !== undefined) next.grade = grade;
      if (costCenter !== undefined) next.centreCout = costCenter;
      if (reportsTo !== undefined) {
        // Conserve le poste N+1 s’il existait, met le nom / hiérarchie
        next.lineManagerName = reportsTo;
      }
      if (company !== undefined) next.company = company;
    }

    await upsertEmployee(next);
    updated += 1;
  }
  return { updated };
}
