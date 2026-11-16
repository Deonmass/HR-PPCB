import 'server-only';

import { after as scheduleAfter } from 'next/server';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_SICK_LEAVE_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type {
  SickLeaveAttestation,
  SickLeaveAttestationInput,
  SickLeaveBalance,
  SickLeaveStoreData,
} from './sick-leave-types';
import {
  isSickAttestationYes,
  normalizeSickMatricule,
  normalizeSickProvenance,
  parseIsoDateParts,
  parseSickMonth,
  sickLeaveKey,
} from './sick-leave-utils';

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'sante', 'sick-leave.json');
  }
  const writable = path.join(getWritableDataRoot(), 'sante', 'sick-leave.json');
  const bundled = path.join(process.cwd(), 'data', 'sante', 'sick-leave.json');
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

let persistQueued = 0;

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeBalance(raw: Partial<SickLeaveBalance>, now: string): SickLeaveBalance | null {
  const matricule = normalizeSickMatricule(raw.matricule);
  const year = Number(raw.year);
  const month = Number(raw.month);
  if (!matricule || !Number.isFinite(year) || month < 1 || month > 12) return null;
  const days = Number(raw.days);
  return {
    id: String(raw.id || uid('slb')),
    matricule,
    firstName: String(raw.firstName || '').trim(),
    lastName: String(raw.lastName || '').trim(),
    nom: String(raw.nom || '').trim() || `${raw.firstName || ''} ${raw.lastName || ''}`.trim(),
    department: String(raw.department || '').trim(),
    site: String(raw.site || '').trim(),
    leaveType: String(raw.leaveType || 'Sick').trim() || 'Sick',
    leaveDescription: String(raw.leaveDescription || '').trim(),
    year,
    month,
    days: Number.isFinite(days) ? days : 0,
    attestationImported: String(raw.attestationImported || '').trim(),
    observations: String(raw.observations || '').trim(),
    provenance: normalizeSickProvenance(raw.provenance),
    statut: String(raw.statut || '').trim(),
    sourceSheet: String(raw.sourceSheet || '').trim(),
    sourceFile: String(raw.sourceFile || '').trim(),
    updatedAt: String(raw.updatedAt || now),
  };
}

function normalizeAttestation(raw: Partial<SickLeaveAttestation>, now: string): SickLeaveAttestation | null {
  const matricule = normalizeSickMatricule(raw.matricule);
  if (!matricule) return null;
  const start = parseIsoDateParts(String(raw.startDate || '')) || parseIsoDateParts(`${raw.year}-${String(raw.month).padStart(2, '0')}-01`);
  if (!start) return null;
  const year = Number(raw.year) || start.year;
  const month = Number(raw.month) || start.month;
  const daysRaw = raw.days == null || raw.days === ('' as unknown) ? null : Number(raw.days);
  return {
    id: String(raw.id || uid('sla')),
    matricule,
    nom: String(raw.nom || '').trim(),
    site: String(raw.site || '').trim(),
    department: String(raw.department || '').trim(),
    startDate: String(raw.startDate || start.iso).slice(0, 10),
    endDate: String(raw.endDate || raw.startDate || start.iso).slice(0, 10),
    year,
    month,
    days: Number.isFinite(daysRaw as number) ? Number(daysRaw) : null,
    hospital: String(raw.hospital || '').trim(),
    confirmation: String(raw.confirmation || '').trim(),
    observations: String(raw.observations || '').trim(),
    provenance: normalizeSickProvenance(raw.provenance),
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
    createdBy: raw.createdBy,
    updatedBy: raw.updatedBy,
  };
}

async function readStore(): Promise<SickLeaveStoreData> {
  const filePath = resolvePath();
  if (persistQueued === 0) {
    await hydrateDurableFile(DURABLE_SICK_LEAVE_KEY, filePath);
  }
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SickLeaveStoreData>;
    const now = new Date().toISOString();
    return {
      balances: Array.isArray(parsed.balances)
        ? parsed.balances.map((item) => normalizeBalance(item, now)).filter((item): item is SickLeaveBalance => Boolean(item))
        : [],
      attestations: Array.isArray(parsed.attestations)
        ? parsed.attestations.map((item) => normalizeAttestation(item, now)).filter((item): item is SickLeaveAttestation => Boolean(item))
        : [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { balances: [], attestations: [] };
    throw err;
  }
}

async function writeStore(store: SickLeaveStoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  persistQueued += 1;
  scheduleAfter(() => persistDurableFile(DURABLE_SICK_LEAVE_KEY, filePath)
    .catch((err) => {
      console.error('[sick-leave] persist failed', err);
    })
    .finally(() => {
      persistQueued = Math.max(0, persistQueued - 1);
    }));
}

export async function readSickLeaveStore(): Promise<SickLeaveStoreData> {
  return readStore();
}

export async function mergeSickLeaveBalances(
  incoming: SickLeaveBalance[],
): Promise<{ added: number; updated: number; store: SickLeaveStoreData }> {
  const store = await readStore();
  const index = new Map<string, number>();
  store.balances.forEach((item, i) => {
    index.set(sickLeaveKey(item.matricule, item.year, item.month), i);
  });
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    const key = sickLeaveKey(item.matricule, item.year, item.month);
    const existing = index.get(key);
    if (existing == null) {
      index.set(key, store.balances.length);
      store.balances.push(item);
      added += 1;
    } else {
      store.balances[existing] = {
        ...store.balances[existing],
        ...item,
        id: store.balances[existing].id,
      };
      updated += 1;
    }
  }
  await writeStore(store);
  return { added, updated, store };
}

function resolveAttestationPeriod(input: SickLeaveAttestationInput): { year: number; month: number; startDate: string; endDate: string } {
  const start = parseIsoDateParts(input.startDate);
  if (!start) throw new Error('Date de début invalide');
  const end = parseIsoDateParts(input.endDate) || start;
  const month = input.month && input.month >= 1 && input.month <= 12
    ? input.month
    : parseSickMonth(input.month) || start.month;
  const year = Number(input.year) || start.year;
  return { year, month, startDate: start.iso, endDate: end.iso };
}

export async function createSickLeaveAttestation(
  input: SickLeaveAttestationInput,
  actor?: string,
): Promise<SickLeaveAttestation> {
  const matricule = normalizeSickMatricule(input.matricule);
  if (!matricule) throw new Error('Matricule requis');
  if (!input.nom.trim()) throw new Error('Nom requis');
  const period = resolveAttestationPeriod(input);
  const now = new Date().toISOString();
  const item: SickLeaveAttestation = {
    id: uid('sla'),
    matricule,
    nom: input.nom.trim(),
    site: (input.site || '').trim(),
    department: (input.department || '').trim(),
    startDate: period.startDate,
    endDate: period.endDate,
    year: period.year,
    month: period.month,
    days: input.days == null || input.days === ('' as unknown) ? null : Number(input.days),
    hospital: (input.hospital || '').trim(),
    confirmation: (input.confirmation || '').trim(),
    observations: (input.observations || '').trim(),
    provenance: (input.provenance || '').trim(),
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
  };
  const store = await readStore();
  store.attestations.push(item);
  syncBalanceFromAttestation(store, item, 'Oui');
  await writeStore(store);
  return item;
}

export async function updateSickLeaveAttestation(
  id: string,
  input: SickLeaveAttestationInput,
  actor?: string,
): Promise<SickLeaveAttestation> {
  const store = await readStore();
  const index = store.attestations.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Attestation introuvable');
  const matricule = normalizeSickMatricule(input.matricule);
  if (!matricule) throw new Error('Matricule requis');
  const period = resolveAttestationPeriod(input);
  const now = new Date().toISOString();
  const next: SickLeaveAttestation = {
    ...store.attestations[index],
    matricule,
    nom: input.nom.trim(),
    site: (input.site || '').trim(),
    department: (input.department || '').trim(),
    startDate: period.startDate,
    endDate: period.endDate,
    year: period.year,
    month: period.month,
    days: input.days == null || input.days === ('' as unknown) ? null : Number(input.days),
    hospital: (input.hospital || '').trim(),
    confirmation: (input.confirmation || '').trim(),
    observations: (input.observations || '').trim(),
    provenance: (input.provenance || '').trim(),
    updatedAt: now,
    updatedBy: actor,
  };
  store.attestations[index] = next;
  syncBalanceFromAttestation(store, next, 'Oui');
  await writeStore(store);
  return next;
}

export async function deleteSickLeaveAttestation(id: string): Promise<void> {
  const store = await readStore();
  const found = store.attestations.find((item) => item.id === id);
  const next = store.attestations.filter((item) => item.id !== id);
  if (next.length === store.attestations.length) throw new Error('Attestation introuvable');
  store.attestations = next;
  if (found) syncBalanceFromAttestation(store, found, 'Non');
  await writeStore(store);
}

function syncBalanceFromAttestation(
  store: SickLeaveStoreData,
  item: SickLeaveAttestation,
  attestationImported: string,
) {
  const key = sickLeaveKey(item.matricule, item.year, item.month);
  const index = store.balances.findIndex((row) => sickLeaveKey(row.matricule, row.year, row.month) === key);
  if (index < 0) return;
  store.balances[index] = {
    ...store.balances[index],
    attestationImported,
    observations: item.observations || store.balances[index].observations,
    provenance: item.provenance || store.balances[index].provenance,
    updatedAt: item.updatedAt,
  };
}

export async function patchSickLeaveBalance(
  key: string,
  patch: { attestationImported?: string; provenance?: string; observations?: string },
): Promise<SickLeaveBalance> {
  const store = await readStore();
  const index = store.balances.findIndex((row) => sickLeaveKey(row.matricule, row.year, row.month) === key);
  if (index < 0) throw new Error('Ligne introuvable');
  const next: SickLeaveBalance = { ...store.balances[index], updatedAt: new Date().toISOString() };
  if (patch.attestationImported != null) {
    const raw = String(patch.attestationImported).trim();
    next.attestationImported = isSickAttestationYes(raw) ? 'Oui' : 'Non';
  }
  if (patch.provenance != null) next.provenance = normalizeSickProvenance(patch.provenance);
  if (patch.observations != null) next.observations = String(patch.observations).trim();
  store.balances[index] = next;
  await writeStore(store);
  return next;
}
