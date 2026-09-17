import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_TRAINING_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import {
  DEFAULT_TRAINING_KPIS,
  monthKey,
  type TrainingCostEntry,
  type TrainingDashboardView,
  type TrainingKpis,
  type TrainingMonthCost,
  type TrainingStoreData,
} from './training-types';
import { buildTrainingDashboard } from './training-compute';

export { DURABLE_TRAINING_KEY };
export { buildTrainingDashboard };

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'training', 'training.json');
  }
  const writable = path.join(getWritableDataRoot(), 'training', 'training.json');
  const bundled = path.join(process.cwd(), 'data', 'training', 'training.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore
  }
  return writable;
}

function nowIso(): string {
  return new Date().toISOString();
}

function newId(prefix = 'tr'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Seed from New report Training sheet (Apr–Jun aggregates + Jul–Aug detail). */
function seedStore(): TrainingStoreData {
  const stamped = nowIso();
  const monthlyCosts: Record<string, TrainingMonthCost> = {
    [monthKey(2026, 4)]: { year: 2026, month: 4, hq: 2500, plant: 2170, fromEntries: false, updatedAt: stamped },
    [monthKey(2026, 5)]: { year: 2026, month: 5, hq: 25720, plant: 2342, fromEntries: false, updatedAt: stamped },
    [monthKey(2026, 6)]: { year: 2026, month: 6, hq: 2700, plant: 30, fromEntries: false, updatedAt: stamped },
    [monthKey(2026, 7)]: { year: 2026, month: 7, hq: 1370, plant: 2500, fromEntries: true, updatedAt: stamped },
    [monthKey(2026, 8)]: { year: 2026, month: 8, hq: 6550, plant: 400, fromEntries: true, updatedAt: stamped },
  };

  const seedLines: Array<Omit<TrainingCostEntry, 'id' | 'importedAt'>> = [
    { postingDate: '2026-07-01', amount: 600, costCenterType: 'HQ', text: 'Perdiem des formateurs', year: 2026, month: 7, documentNumber: '1900006474' },
    { postingDate: '2026-07-02', amount: 2500, costCenterType: 'Plant', text: 'C.N.P.R.ITRAINING COURSE FEES', year: 2026, month: 7, documentNumber: '5000085759' },
    { postingDate: '2026-07-15', amount: 200, costCenterType: 'HQ', text: 'Trainee Elliot', year: 2026, month: 7, documentNumber: '100114207' },
    { postingDate: '2026-07-24', amount: 285, costCenterType: 'HQ', text: 'Formation anglais CALI ANGELE', year: 2026, month: 7, documentNumber: '100114943' },
    { postingDate: '2026-07-27', amount: 285, costCenterType: 'HQ', text: "Frais de Formation d'anglais CALI 3 Rimels NTONDO", year: 2026, month: 7, documentNumber: '100114957' },
    { postingDate: '2026-08-07', amount: 200, costCenterType: 'Plant', text: 'Trainee Pevid Luambo', year: 2026, month: 8, documentNumber: '100007448' },
    { postingDate: '2026-08-07', amount: 200, costCenterType: 'Plant', text: 'Trainee Kutu Medina', year: 2026, month: 8, documentNumber: '100115761' },
    { postingDate: '2026-08-12', amount: 4050, costCenterType: 'HQ', text: 'Chartered management accountant training', year: 2026, month: 8, documentNumber: '100116817' },
    { postingDate: '2026-08-31', amount: 2500, costCenterType: 'HQ', text: 'C.N.P.R.ITRAINING COURSE FEES', year: 2026, month: 8, documentNumber: '100119617' },
  ];

  return {
    kpis: { ...DEFAULT_TRAINING_KPIS },
    monthlyCosts,
    entries: seedLines.map((e) => ({
      ...e,
      id: newId('seed'),
      importedAt: stamped,
      sourceFile: 'New report - Aout 26.xlsx / Training',
    })),
    updatedAt: stamped,
  };
}

function normalizeStore(raw: unknown): TrainingStoreData {
  if (!raw || typeof raw !== 'object') return seedStore();
  const o = raw as Partial<TrainingStoreData>;
  return {
    kpis: { ...DEFAULT_TRAINING_KPIS, ...(o.kpis || {}) },
    monthlyCosts: o.monthlyCosts && typeof o.monthlyCosts === 'object' ? o.monthlyCosts : {},
    entries: Array.isArray(o.entries) ? o.entries : [],
    updatedAt: o.updatedAt || nowIso(),
  };
}

async function readRaw(): Promise<TrainingStoreData> {
  const file = resolvePath();
  await hydrateDurableFile(DURABLE_TRAINING_KEY, file);
  try {
    const text = await fsPromises.readFile(file, 'utf8');
    return normalizeStore(JSON.parse(text));
  } catch {
    const seeded = seedStore();
    await writeStore(seeded);
    return seeded;
  }
}

async function writeStore(data: TrainingStoreData): Promise<void> {
  const file = resolvePath();
  await fsPromises.mkdir(path.dirname(file), { recursive: true });
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fsPromises.writeFile(file, payload, 'utf8');
  await persistDurableFile(DURABLE_TRAINING_KEY, file);
}

export async function getTrainingStore(): Promise<TrainingStoreData> {
  return readRaw();
}

export function entryDedupeKey(e: Pick<TrainingCostEntry, 'documentNumber' | 'postingDate' | 'amount' | 'text'>): string {
  return [
    String(e.documentNumber || '').trim(),
    e.postingDate,
    String(e.amount),
    String(e.text || '').trim().toLowerCase(),
  ].join('|');
}

function isHq(type: string): boolean {
  return /^hq$/i.test(String(type || '').trim());
}

function isPlant(type: string): boolean {
  return /^plant$/i.test(String(type || '').trim());
}

/** Recompute monthly aggregates for given months from entries; keep other months. */
export function rebuildMonthlyFromEntries(
  store: TrainingStoreData,
  monthsToRebuild: Array<{ year: number; month: number }>,
): TrainingStoreData {
  const next = { ...store, monthlyCosts: { ...store.monthlyCosts } };
  const stamped = nowIso();
  for (const { year, month } of monthsToRebuild) {
    const key = monthKey(year, month);
    const lines = store.entries.filter((e) => e.year === year && e.month === month);
    if (!lines.length) continue;
    let hq = 0;
    let plant = 0;
    for (const e of lines) {
      if (isHq(e.costCenterType)) hq += e.amount;
      else if (isPlant(e.costCenterType)) plant += e.amount;
      else hq += e.amount;
    }
    next.monthlyCosts[key] = {
      year,
      month,
      hq: Math.round(hq * 100) / 100,
      plant: Math.round(plant * 100) / 100,
      fromEntries: true,
      updatedAt: stamped,
    };
  }
  next.updatedAt = stamped;
  return next;
}

export async function mergeTrainingCostEntries(
  incoming: Array<Omit<TrainingCostEntry, 'id' | 'importedAt'> & { id?: string; importedAt?: string }>,
  sourceFile?: string,
): Promise<{ store: TrainingStoreData; added: number; updated: number }> {
  const store = await readRaw();
  const byKey = new Map(store.entries.map((e) => [entryDedupeKey(e), e]));
  let added = 0;
  let updated = 0;
  const touched = new Map<string, { year: number; month: number }>();
  const stamped = nowIso();

  for (const row of incoming) {
    const key = entryDedupeKey(row);
    const existing = byKey.get(key);
    touched.set(monthKey(row.year, row.month), { year: row.year, month: row.month });
    if (existing) {
      byKey.set(key, {
        ...existing,
        ...row,
        id: existing.id,
        importedAt: stamped,
        sourceFile: sourceFile || existing.sourceFile,
      });
      updated += 1;
    } else {
      byKey.set(key, {
        ...row,
        id: row.id || newId(),
        importedAt: stamped,
        sourceFile,
      });
      added += 1;
    }
  }

  let next: TrainingStoreData = {
    ...store,
    entries: [...byKey.values()].sort((a, b) => a.postingDate.localeCompare(b.postingDate)),
    updatedAt: stamped,
  };
  next = rebuildMonthlyFromEntries(next, [...touched.values()]);
  await writeStore(next);
  return { store: next, added, updated };
}

export async function updateTrainingKpis(patch: Partial<TrainingKpis>): Promise<TrainingStoreData> {
  const store = await readRaw();
  const next: TrainingStoreData = {
    ...store,
    kpis: { ...store.kpis, ...patch },
    updatedAt: nowIso(),
  };
  await writeStore(next);
  return next;
}

/** Manual edit of a month HQ/Plant cell — keeps history, does not wipe other months. */
export async function upsertTrainingMonthCost(input: {
  year: number;
  month: number;
  hq?: number;
  plant?: number;
}): Promise<TrainingStoreData> {
  const store = await readRaw();
  const key = monthKey(input.year, input.month);
  const prev = store.monthlyCosts[key];
  const stamped = nowIso();
  const next: TrainingStoreData = {
    ...store,
    monthlyCosts: {
      ...store.monthlyCosts,
      [key]: {
        year: input.year,
        month: input.month,
        hq: input.hq != null && Number.isFinite(input.hq) ? input.hq : (prev?.hq ?? 0),
        plant: input.plant != null && Number.isFinite(input.plant) ? input.plant : (prev?.plant ?? 0),
        fromEntries: false,
        updatedAt: stamped,
      },
    },
    updatedAt: stamped,
  };
  await writeStore(next);
  return next;
}

export async function getTrainingDashboard(
  year?: number,
  month?: number | null,
): Promise<TrainingDashboardView> {
  const store = await getTrainingStore();
  return buildTrainingDashboard(
    store,
    year ?? new Date().getFullYear(),
    month === undefined ? null : month,
    'calendar',
  );
}
