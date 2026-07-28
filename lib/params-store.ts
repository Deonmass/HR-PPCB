import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import type { CostCenterSetting, DepartmentSetting } from './auth-types';
import {
  DURABLE_COST_CENTERS_KEY,
  DURABLE_DEPARTMENTS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface DepartmentsStore {
  departments: DepartmentSetting[];
}

interface CostCentersStore {
  costCenters: CostCenterSetting[];
}

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) return path.join(process.cwd(), relativePath);
  const writable = path.join(getWritableDataRoot(), relativePath.replace(/^data[\\/]/, ''));
  const bundled = path.join(process.cwd(), relativePath);
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

function departmentsPath(): string {
  return resolveStorePath(path.join('data', 'settings', 'departments.json'));
}

function costCentersPath(): string {
  return resolveStorePath(path.join('data', 'settings', 'cost-centers.json'));
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

export function departmentIdFromName(name: string): string {
  return `dept-${slugify(name)}`;
}

export function costCenterIdFromCode(code: string): string {
  return `cc-${slugify(code)}`;
}

/** @deprecated Prefer costCenterIdFromCode — kept for API compatibility. */
export function costCenterIdFromRow(rowIndex: number): string {
  return `cc-${rowIndex}`;
}

async function readJsonFile<T>(repoKey: string, filePath: string, fallback: T): Promise<T> {
  await hydrateDurableFile(repoKey, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(repoKey: string, filePath: string, value: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  await persistDurableFile(repoKey, filePath);
}

async function readDepartmentsStore(): Promise<DepartmentsStore> {
  const store = await readJsonFile<DepartmentsStore>(DURABLE_DEPARTMENTS_KEY, departmentsPath(), {
    departments: [],
  });
  return { departments: Array.isArray(store.departments) ? store.departments : [] };
}

async function readCostCentersStore(): Promise<CostCentersStore> {
  const store = await readJsonFile<CostCentersStore>(DURABLE_COST_CENTERS_KEY, costCentersPath(), {
    costCenters: [],
  });
  return { costCenters: Array.isArray(store.costCenters) ? store.costCenters : [] };
}

export async function listDepartmentsFromParams(): Promise<DepartmentSetting[]> {
  const store = await readDepartmentsStore();
  return [...store.departments]
    .filter((item) => item?.name?.trim())
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

export async function listCostCentersFromParams(): Promise<CostCenterSetting[]> {
  const store = await readCostCentersStore();
  return [...store.costCenters]
    .filter((item) => item?.code?.trim())
    .sort((a, b) => a.code.localeCompare(b.code, 'fr'));
}

export async function upsertDepartmentInParams(item: DepartmentSetting): Promise<DepartmentSetting> {
  const store = await readDepartmentsStore();
  const nextName = item.name.trim();
  if (!nextName) throw new Error('Nom du département requis');

  const next: DepartmentSetting = {
    id: departmentIdFromName(nextName),
    name: nextName,
    code: item.code?.trim() || nextName,
    active: item.active ?? true,
  };

  const existingIndex = item.id
    ? store.departments.findIndex((dept) => dept.id === item.id)
    : store.departments.findIndex((dept) => dept.id === next.id);

  const previous = existingIndex >= 0 ? store.departments[existingIndex] : null;
  if (existingIndex >= 0) store.departments[existingIndex] = next;
  else store.departments.push(next);

  // Keep cost-center department links in sync when renaming.
  if (previous && previous.id !== next.id) {
    const ccStore = await readCostCentersStore();
    let changed = false;
    for (const cc of ccStore.costCenters) {
      if (cc.departmentId !== previous.id) continue;
      cc.departmentId = next.id;
      changed = true;
    }
    if (changed) {
      await writeJsonFile(DURABLE_COST_CENTERS_KEY, costCentersPath(), ccStore);
    }
  }

  await writeJsonFile(DURABLE_DEPARTMENTS_KEY, departmentsPath(), store);
  return next;
}

export async function deleteDepartmentFromParams(id: string): Promise<boolean> {
  const store = await readDepartmentsStore();
  const next = store.departments.filter((item) => item.id !== id);
  if (next.length === store.departments.length) return false;
  await writeJsonFile(DURABLE_DEPARTMENTS_KEY, departmentsPath(), { departments: next });

  const ccStore = await readCostCentersStore();
  let changed = false;
  for (const cc of ccStore.costCenters) {
    if (cc.departmentId !== id) continue;
    cc.departmentId = undefined;
    changed = true;
  }
  if (changed) {
    await writeJsonFile(DURABLE_COST_CENTERS_KEY, costCentersPath(), ccStore);
  }
  return true;
}

export async function upsertCostCenterInParams(item: CostCenterSetting): Promise<CostCenterSetting> {
  const store = await readCostCentersStore();
  const code = item.code.trim();
  const name = item.name.trim() || code;
  if (!code) throw new Error('Code centre de coût requis');

  const next: CostCenterSetting = {
    id: item.id?.trim() || costCenterIdFromCode(code),
    code,
    name,
    departmentId: item.departmentId?.trim() || undefined,
    active: item.active ?? true,
  };

  const existingIndex = store.costCenters.findIndex((cc) => cc.id === next.id);
  if (existingIndex >= 0) store.costCenters[existingIndex] = next;
  else {
    const byCode = store.costCenters.findIndex(
      (cc) => cc.code.trim().toLowerCase() === code.toLowerCase(),
    );
    if (byCode >= 0) {
      next.id = store.costCenters[byCode].id;
      store.costCenters[byCode] = next;
    } else {
      store.costCenters.push(next);
    }
  }

  await writeJsonFile(DURABLE_COST_CENTERS_KEY, costCentersPath(), store);
  return next;
}

export async function deleteCostCenterFromParams(id: string): Promise<boolean> {
  const store = await readCostCentersStore();
  const next = store.costCenters.filter((item) => item.id !== id);
  if (next.length === store.costCenters.length) return false;
  await writeJsonFile(DURABLE_COST_CENTERS_KEY, costCentersPath(), { costCenters: next });
  return true;
}

export function createDepartmentId(name: string): string {
  return departmentIdFromName(name);
}

export function createCostCenterId(codeOrRow?: string | number): string {
  if (typeof codeOrRow === 'string' && codeOrRow.trim()) {
    return costCenterIdFromCode(codeOrRow);
  }
  if (typeof codeOrRow === 'number') return costCenterIdFromRow(codeOrRow);
  return '';
}
