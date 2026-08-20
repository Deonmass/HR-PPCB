import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_MISSION_ORDERS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import type { MissionOrderHistoryRow, MissionOrderHistoryStoreData } from './mission-order-history-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import { computeBudgetTotal, computeTripDays, type TravelFormFields } from './travel-form';
import {
  buildNextMissionRef,
  inferMissionSiteFromRef,
} from './travel-mission-ref';
import {
  isMissionSiteId,
  type MissionSiteId,
} from './travel-mission-sites';
import type { CashRequestRecord } from './travel-types';

function resolveStorePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'travel', 'mission-orders.json');
  }
  const writable = path.join(getWritableDataRoot(), 'travel', 'mission-orders.json');
  const bundled = path.join(process.cwd(), 'data', 'travel', 'mission-orders.json');
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

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function emptyStore(): MissionOrderHistoryStoreData {
  return { rows: [] };
}

async function readJsonFile(): Promise<MissionOrderHistoryStoreData> {
  const storePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_MISSION_ORDERS_KEY, storePath);
  try {
    const raw = await fsPromises.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as MissionOrderHistoryStoreData;
    return { rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyStore();
    throw err;
  }
}

async function writeJsonFile(data: MissionOrderHistoryStoreData): Promise<void> {
  const storePath = resolveStorePath();
  await fsPromises.mkdir(path.dirname(storePath), { recursive: true });
  await fsPromises.writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_MISSION_ORDERS_KEY, storePath);
}

async function collectCashRequestRefs(): Promise<string[]> {
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'travel', 'cash-requests.json');
    const raw = await fsPromises.readFile(jsonPath, 'utf8');
    const json = JSON.parse(raw) as { cashRequests?: Array<{ missionRef?: string }> };
    return (json.cashRequests ?? []).map((item) => str(item.missionRef)).filter(Boolean);
  } catch {
    return [];
  }
}

async function collectVoyageHistoryRefs(): Promise<string[]> {
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'travel', 'history.json');
    const raw = await fsPromises.readFile(jsonPath, 'utf8');
    const json = JSON.parse(raw) as { rows?: Array<{ ref?: string }> };
    return (json.rows ?? []).map((item) => str(item.ref)).filter(Boolean);
  } catch {
    return [];
  }
}

export async function listMissionOrderHistory(
  site?: MissionSiteId,
): Promise<MissionOrderHistoryRow[]> {
  const store = await readJsonFile();
  const rows = site ? store.rows.filter((row) => row.site === site) : store.rows;
  return [...rows].sort((a, b) => {
    const refCmp = b.missionRef.localeCompare(a.missionRef, 'fr');
    if (refCmp !== 0) return refCmp;
    return b.employeeName.localeCompare(a.employeeName, 'fr');
  });
}

export async function collectMissionRefsForSite(site: MissionSiteId): Promise<string[]> {
  const store = await readJsonFile();
  const historyRefs = store.rows
    .filter((row) => row.site === site)
    .map((row) => row.missionRef);
  const extra = [...(await collectCashRequestRefs()), ...(await collectVoyageHistoryRefs())].filter(
    (ref) => inferMissionSiteFromRef(ref) === site,
  );
  return [...new Set([...historyRefs, ...extra])];
}

export async function previewNextMissionRef(
  site: MissionSiteId,
  date: Date = new Date(),
): Promise<string> {
  const refs = await collectMissionRefsForSite(site);
  return buildNextMissionRef(refs, site, date);
}

export async function allocateMissionRef(
  site: MissionSiteId,
  date: Date = new Date(),
): Promise<string> {
  return previewNextMissionRef(site, date);
}

function resolveMissionSite(travel: TravelFormFields, missionRef?: string): MissionSiteId {
  if (isMissionSiteId(travel.missionSite)) return travel.missionSite;
  if (missionRef) {
    const inferred = inferMissionSiteFromRef(missionRef);
    if (inferred) return inferred;
  }
  return 'zamba';
}

export function historyRowFromRecord(
  record: CashRequestRecord,
  site?: MissionSiteId,
): MissionOrderHistoryRow {
  const travel = record.travel;
  const missionRef = str(record.missionRef);
  const resolvedSite = site ?? resolveMissionSite(travel ?? ({} as TravelFormFields), missionRef);
  const days = travel
    ? computeTripDays(travel.departureDate, travel.returnDate)
    : 0;
  const amount = travel
    ? computeBudgetTotal(travel.budgetLines, travel.peopleCount, days)
    : num(record.total);
  return {
    id: `mo-${record.id || Date.now()}`,
    site: resolvedSite,
    sr: '',
    registerDate: travel?.documentDate || record.requestDate || '',
    missionRef,
    matricule: str(record.employeeMatricule),
    employeeName: str(record.employeeName),
    category: str(travel?.missionCategory),
    title: str(travel?.position),
    purpose: str(travel?.tripPurpose || record.objet),
    destination: str(travel?.destinationPlace),
    transportMeans: str(travel?.transportMeans),
    departureDate: str(travel?.departureDate),
    returnDate: str(travel?.returnDate),
    days,
    type: str(travel?.missionType),
    amount: amount > 0 ? amount : null,
    observation: str(travel?.missionObservation),
    recordId: str(record.id),
    source: 'app',
    createdAt: record.createdAt || new Date().toISOString(),
  };
}

export async function appendMissionOrderHistoryRow(
  record: CashRequestRecord,
): Promise<MissionOrderHistoryRow | null> {
  const missionRef = str(record.missionRef);
  if (!missionRef) return null;
  const store = await readJsonFile();
  const existing = store.rows.find(
    (row) =>
      row.missionRef === missionRef
      && row.employeeName.trim().toLowerCase() === str(record.employeeName).toLowerCase(),
  );
  const row = historyRowFromRecord(record);
  if (existing) {
    Object.assign(existing, {
      ...row,
      id: existing.id,
      sr: existing.sr,
      source: existing.source,
    });
    await writeJsonFile(store);
    return existing;
  }
  const siteRows = store.rows.filter((item) => item.site === row.site);
  const maxSr = siteRows.reduce((max, item) => {
    const parsed = Number.parseInt(item.sr, 10);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  row.sr = String(maxSr + 1).padStart(3, '0');
  store.rows.push(row);
  await writeJsonFile(store);
  return row;
}

export async function getMissionOrderHistoryRow(
  id: string,
): Promise<MissionOrderHistoryRow | null> {
  const store = await readJsonFile();
  return store.rows.find((row) => row.id === id) ?? null;
}

export async function deleteMissionOrderHistoryRow(id: string): Promise<MissionOrderHistoryRow | null> {
  const store = await readJsonFile();
  const index = store.rows.findIndex((row) => row.id === id);
  if (index < 0) return null;
  const [removed] = store.rows.splice(index, 1);
  await writeJsonFile(store);
  return removed;
}

export async function restoreMissionOrderHistoryRow(
  snapshot: MissionOrderHistoryRow,
): Promise<MissionOrderHistoryRow> {
  const store = await readJsonFile();
  const row: MissionOrderHistoryRow = {
    ...snapshot,
    id: str(snapshot.id) || `mo-${Date.now()}`,
    missionRef: str(snapshot.missionRef),
    employeeName: str(snapshot.employeeName),
  };
  if (!row.missionRef) throw new Error('Référence ordre de mission manquante');
  const byId = store.rows.findIndex((item) => item.id === row.id);
  if (byId >= 0) store.rows[byId] = row;
  else store.rows.push(row);
  await writeJsonFile(store);
  return row;
}
