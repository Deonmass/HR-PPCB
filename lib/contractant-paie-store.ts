import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { ContractantPayrollSite } from './contractant-paie-calc';
import { CONTRACTANT_PAIE_FX_DEFAULT } from './contractant-paie-calc';

export interface ContractantPaieMonthRow {
  employeeId: string;
  jrsPrestes: number;
  jrsFeries: number;
  jrsConges: number;
  jrsMaladies: number;
  jrsFeriesDim: number;
  txJr: number;
  coutTrs: number;
  avances: number;
  mb: number;
  provPpe: number;
  provMed: number;
  ot130: number;
  ot160: number;
  ot200: number;
  ot10: number;
  ot25: number;
  dependants: number;
}

export interface ContractantPaieMonth {
  contractantId: string;
  year: number;
  month: number;
  site: ContractantPayrollSite;
  fxRate: number;
  rows: ContractantPaieMonthRow[];
  updatedAt: string;
}

interface StoreData {
  months: ContractantPaieMonth[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'contractant-paie.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'contractant-paie.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'contractant-paie.json');
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

function emptyStore(): StoreData {
  return { months: [] };
}

function normalizeRow(raw: unknown): ContractantPaieMonthRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ContractantPaieMonthRow>;
  if (!r.employeeId) return null;
  return {
    employeeId: String(r.employeeId),
    jrsPrestes: Number(r.jrsPrestes) || 0,
    jrsFeries: Number(r.jrsFeries) || 0,
    jrsConges: Number(r.jrsConges) || 0,
    jrsMaladies: Number(r.jrsMaladies) || 0,
    jrsFeriesDim: Number(r.jrsFeriesDim) || 0,
    txJr: Number(r.txJr) || 0,
    coutTrs: Number(r.coutTrs) || 0,
    avances: Number(r.avances) || 0,
    mb: Number(r.mb) || 0,
    provPpe: Number(r.provPpe) || 0,
    provMed: Number(r.provMed) || 0,
    ot130: Number(r.ot130) || 0,
    ot160: Number(r.ot160) || 0,
    ot200: Number(r.ot200) || 0,
    ot10: Number(r.ot10) || 0,
    ot25: Number(r.ot25) || 0,
    dependants: Math.max(0, Math.round(Number(r.dependants) || 0)),
  };
}

async function readStore(): Promise<StoreData> {
  try {
    const raw = await fsPromises.readFile(resolvePath(), 'utf8');
    const parsed = JSON.parse(raw) as StoreData;
    return {
      months: Array.isArray(parsed.months)
        ? parsed.months
            .filter((m) => m && typeof m === 'object')
            .map((m) => ({
              contractantId: String(m.contractantId || ''),
              year: Number(m.year) || 0,
              month: Number(m.month) || 0,
              site: (m.site === 'hors-site' ? 'hors-site' : 'site') as ContractantPayrollSite,
              fxRate: Number(m.fxRate) || CONTRACTANT_PAIE_FX_DEFAULT,
              rows: Array.isArray(m.rows)
                ? m.rows.map(normalizeRow).filter((r): r is ContractantPaieMonthRow => Boolean(r))
                : [],
              updatedAt: String(m.updatedAt || new Date().toISOString()),
            }))
            .filter((m) => m.contractantId && m.year && m.month)
        : [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: StoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

export async function getPaieMonth(
  contractantId: string,
  year: number,
  month: number,
  site: ContractantPayrollSite,
): Promise<ContractantPaieMonth | null> {
  const store = await readStore();
  return (
    store.months.find(
      (m) =>
        m.contractantId === contractantId
        && m.year === year
        && m.month === month
        && m.site === site,
    ) ?? null
  );
}

export async function upsertPaieMonth(
  input: Omit<ContractantPaieMonth, 'updatedAt'> & { updatedAt?: string },
): Promise<ContractantPaieMonth> {
  const store = await readStore();
  const record: ContractantPaieMonth = {
    contractantId: input.contractantId,
    year: input.year,
    month: input.month,
    site: input.site,
    fxRate: input.fxRate || CONTRACTANT_PAIE_FX_DEFAULT,
    rows: input.rows.map(normalizeRow).filter((r): r is ContractantPaieMonthRow => Boolean(r)),
    updatedAt: new Date().toISOString(),
  };
  const index = store.months.findIndex(
    (m) =>
      m.contractantId === record.contractantId
      && m.year === record.year
      && m.month === record.month
      && m.site === record.site,
  );
  if (index >= 0) store.months[index] = record;
  else store.months.push(record);
  await writeStore(store);
  return record;
}

/** Charge le seed septembre 2026 Capital HR si le mois n’existe pas encore. */
export async function ensureSeededPaieMonth(
  contractantId: string,
  year: number,
  month: number,
  site: ContractantPayrollSite,
): Promise<ContractantPaieMonth | null> {
  const existing = await getPaieMonth(contractantId, year, month, site);
  if (existing) return existing;

  const seedPath = path.join(
    process.cwd(),
    'data',
    'employees',
    'capital-hr-paie-septembre-2026.json',
  );
  try {
    const raw = await fsPromises.readFile(seedPath, 'utf8');
    const seed = JSON.parse(raw) as {
      contractantId?: string;
      year?: number;
      month?: number;
      fxRate?: number;
      rows?: Array<Record<string, unknown>>;
    };
    if (String(seed.contractantId) !== contractantId) return null;
    if (Number(seed.year) !== year || Number(seed.month) !== month) return null;

    const rows = (seed.rows || [])
      .filter((r) => String(r.payrollSite || '') === site)
      .map((r) =>
        normalizeRow({
          employeeId: r.employeeId,
          jrsPrestes: r.jrsPrestes,
          jrsFeries: r.jrsFeries,
          jrsConges: r.jrsConges,
          jrsMaladies: r.jrsMaladies,
          jrsFeriesDim: r.jrsFeriesDim,
          txJr: r.txJr,
          coutTrs: r.coutTrs,
          avances: r.avances,
          mb: r.mb,
          provPpe: r.provPpe,
          provMed: r.provMed,
          ot130: r.ot130,
          ot160: r.ot160,
          ot200: r.ot200,
          ot10: r.ot10,
          ot25: r.ot25,
          dependants: r.dependants,
        }),
      )
      .filter((r): r is ContractantPaieMonthRow => Boolean(r));

    if (!rows.length) return null;
    return upsertPaieMonth({
      contractantId,
      year,
      month,
      site,
      fxRate: Number(seed.fxRate) || CONTRACTANT_PAIE_FX_DEFAULT,
      rows,
    });
  } catch {
    return null;
  }
}
