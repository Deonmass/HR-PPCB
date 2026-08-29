import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_RECRUTEMENT_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { DEFAULT_RECRUITMENT_ROWS } from './exco-recruitment-fy27';
import { readEmployeesBundle } from './employees-json-store';
import { getPostesBundle } from './postes-store';
import { enrichRecrutementRow, seedFilledAt } from './recrutement-match';
import type {
  RecrutementBundle,
  RecrutementCatalogOption,
  RecrutementCategory,
  RecrutementDashboard,
  RecrutementInput,
  RecrutementRow,
  RecrutementRowEnriched,
} from './recrutement-types';
import {
  isRecrutementCategory,
  normalizeBudgeted,
  normalizeRecrutementStatus,
  stripExcoMarkup,
} from './recrutement-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface StoreData {
  rows: RecrutementRow[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'recrutement.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'recrutement.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'recrutement.json');
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

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return `rec-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function seedRows(): RecrutementRow[] {
  const stamped = nowIso();
  return DEFAULT_RECRUITMENT_ROWS.map((row) => {
    const category: RecrutementCategory = row.category === 'replacement' ? 'replacement' : 'new';
    const position = stripExcoMarkup(row.position);
    const location = stripExcoMarkup(row.location);
    return {
      id: row.id,
      category,
      position,
      grade: stripExcoMarkup(row.grade),
      status: normalizeRecrutementStatus(row.status),
      comments: stripExcoMarkup(row.comments),
      budgeted: normalizeBudgeted(row.budgeted),
      department: stripExcoMarkup(row.department),
      location,
      contractType: stripExcoMarkup(row.contractType),
      filledAt: seedFilledAt(position, location, category) || undefined,
      createdAt: stamped,
      updatedAt: stamped,
    };
  });
}

function normalize(raw: unknown): RecrutementRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RecrutementRow>;
  if (!r.id) return null;
  const category: RecrutementCategory = isRecrutementCategory(String(r.category || ''))
    ? (r.category as RecrutementCategory)
    : 'new';
  return {
    id: String(r.id),
    category,
    position: stripExcoMarkup(String(r.position || '')),
    grade: stripExcoMarkup(String(r.grade || '')),
    status: normalizeRecrutementStatus(String(r.status || 'Not started')),
    comments: stripExcoMarkup(String(r.comments || '')),
    budgeted: normalizeBudgeted(String(r.budgeted || '')),
    department: stripExcoMarkup(String(r.department || '')),
    location: stripExcoMarkup(String(r.location || '')),
    contractType: stripExcoMarkup(String(r.contractType || '')),
    filledAt: r.filledAt ? String(r.filledAt).slice(0, 10) : undefined,
    createdAt: String(r.createdAt || nowIso()),
    updatedAt: String(r.updatedAt || r.createdAt || nowIso()),
    createdBy: r.createdBy ? String(r.createdBy) : undefined,
  };
}

function fromInput(input: RecrutementInput, prev?: RecrutementRow, createdBy?: string): RecrutementRow {
  const position = stripExcoMarkup(input.position);
  if (!position) throw new Error('Poste (position) requis');
  const category: RecrutementCategory = isRecrutementCategory(String(input.category || ''))
    ? input.category
    : prev?.category || 'new';
  const filledAt = input.filledAt != null ? String(input.filledAt).trim().slice(0, 10) : prev?.filledAt;
  return {
    id: prev?.id || newId(),
    category,
    position,
    grade: stripExcoMarkup(input.grade ?? prev?.grade ?? ''),
    status: normalizeRecrutementStatus(input.status ?? prev?.status ?? 'Not started'),
    comments: stripExcoMarkup(input.comments ?? prev?.comments ?? ''),
    budgeted: normalizeBudgeted(input.budgeted ?? prev?.budgeted ?? ''),
    department: stripExcoMarkup(input.department ?? prev?.department ?? ''),
    location: stripExcoMarkup(input.location ?? prev?.location ?? ''),
    contractType: stripExcoMarkup(input.contractType ?? prev?.contractType ?? ''),
    filledAt: filledAt || undefined,
    createdAt: prev?.createdAt || nowIso(),
    updatedAt: nowIso(),
    createdBy: prev?.createdBy || createdBy,
  };
}

async function readStore(): Promise<StoreData> {
  const filePath = resolvePath();
  await hydrateDurableFile(DURABLE_RECRUTEMENT_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData> | RecrutementRow[];
    const list = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as StoreData).rows)
        ? (parsed as StoreData).rows
        : [];
    const rows = list.map(normalize).filter((r): r is RecrutementRow => Boolean(r));
    if (rows.length) return { rows };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code && code !== 'ENOENT') throw err;
  }
  const seeded = seedRows();
  await writeStore({ rows: seeded });
  return { rows: seeded };
}

async function writeStore(store: StoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify({ rows: store.rows }, null, 2), 'utf8');
  await persistDurableFile(DURABLE_RECRUTEMENT_KEY, filePath);
}

function buildDashboard(rows: RecrutementRowEnriched[]): RecrutementDashboard {
  const statusOf = (s: string) => String(s).toLowerCase();
  return {
    total: rows.length,
    replacements: rows.filter((r) => r.category === 'replacement').length,
    newPositions: rows.filter((r) => r.category === 'new').length,
    ongoing: rows.filter((r) => statusOf(r.status) === 'ongoing').length,
    started: rows.filter((r) => statusOf(r.status) === 'started').length,
    done: rows.filter((r) => statusOf(r.status) === 'done').length,
    notStarted: rows.filter((r) => statusOf(r.status) === 'not started').length,
    filledAugust: rows.filter((r) => r.filledInAugust).length,
    catalogLinked: rows.filter((r) => r.catalogMatch).length,
  };
}

async function enrichAll(rows: RecrutementRow[]): Promise<RecrutementBundle> {
  const [postes, { employees }] = await Promise.all([getPostesBundle(), readEmployeesBundle()]);
  const enriched = rows.map((row) =>
    enrichRecrutementRow(row, postes.groups, postes.vacants, employees),
  );
  const catalogMap = new Map<string, RecrutementCatalogOption>();
  for (const g of postes.groups) {
    catalogMap.set(`c:${g.title.toLowerCase()}`, {
      title: g.title,
      department: g.department,
      location: g.location,
      grade: g.grade,
      occupants: g.count,
      source: 'catalogue',
    });
  }
  for (const v of postes.vacants) {
    const key = `v:${v.title.toLowerCase()}`;
    if (catalogMap.has(`c:${v.title.toLowerCase()}`)) continue;
    catalogMap.set(key, {
      title: v.title,
      department: v.department,
      location: v.location,
      grade: v.grade,
      occupants: 0,
      source: 'vacant',
    });
  }
  const catalog = [...catalogMap.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  return {
    rows: enriched,
    dashboard: buildDashboard(enriched),
    catalog,
  };
}

export async function getRecrutementBundle(): Promise<RecrutementBundle> {
  const store = await readStore();
  return enrichAll(store.rows);
}

export async function createRecrutement(
  input: RecrutementInput,
  createdBy?: string,
): Promise<RecrutementRowEnriched> {
  const store = await readStore();
  const row = fromInput(input, undefined, createdBy);
  store.rows.push(row);
  await writeStore(store);
  const bundle = await enrichAll([row]);
  return bundle.rows[0];
}

export async function updateRecrutement(
  id: string,
  input: RecrutementInput,
): Promise<RecrutementRowEnriched | null> {
  const store = await readStore();
  const index = store.rows.findIndex((r) => r.id === id);
  if (index < 0) return null;
  const next = fromInput(input, store.rows[index]);
  store.rows[index] = next;
  await writeStore(store);
  const bundle = await enrichAll([next]);
  return bundle.rows[0];
}

export async function deleteRecrutement(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.rows.filter((r) => r.id !== id);
  if (next.length === store.rows.length) return false;
  store.rows = next;
  await writeStore(store);
  return true;
}

export async function getRecrutementById(id: string): Promise<RecrutementRow | null> {
  const store = await readStore();
  return store.rows.find((r) => r.id === id) || null;
}
