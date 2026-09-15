import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_SANTE_VISITS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { SanteVisit, SanteVisitInput } from './sante-types';
import { formatSanteExcelMonthLabel } from './sante-utils';

interface StoreData {
  visits: SanteVisit[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'sante', 'visits.json');
  }
  const writable = path.join(getWritableDataRoot(), 'sante', 'visits.json');
  const bundled = path.join(process.cwd(), 'data', 'sante', 'visits.json');
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

function uid(): string {
  return `sante-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function parseDate(value: string): { date: string; year: number; month: number } {
  const iso = (value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error('Date invalide');
  }
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  return { date: iso, year, month };
}

function normalizeVisit(raw: Partial<SanteVisit>, now: string): SanteVisit | null {
  const nom = String(raw.nom || '').trim();
  const pathologie = String(raw.pathologie || '').trim();
  if (!pathologie) return null;
  let date = String(raw.date || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const year = Number(raw.year) || Number(date.slice(0, 4));
  const month = Number(raw.month) || Number(date.slice(5, 7));
  const sexeRaw = String(raw.sexe || '').trim().toUpperCase();
  const sexe: SanteVisit['sexe'] = sexeRaw.startsWith('F') ? 'F' : sexeRaw.startsWith('M') ? 'M' : '';
  const ageNum = raw.age == null || raw.age === ('' as unknown) ? null : Number(raw.age);
  return {
    id: String(raw.id || uid()),
    date,
    nom,
    postnom: String(raw.postnom || '').trim(),
    sexe,
    age: Number.isFinite(ageNum as number) ? Number(ageNum) : null,
    typeMalade: String(raw.typeMalade || 'AGENT').trim() || 'AGENT',
    pathologie,
    traitement: String(raw.traitement || '').trim(),
    reference: String(raw.reference || 'NON').trim() || 'NON',
    year,
    month,
    employeeMatricule: String(raw.employeeMatricule || '').trim(),
    employeeNom: String(raw.employeeNom || '').trim(),
    dependantId: typeof raw.dependantId === 'number' ? raw.dependantId : null,
    createdAt: String(raw.createdAt || now),
    updatedAt: String(raw.updatedAt || now),
    createdBy: raw.createdBy,
    updatedBy: raw.updatedBy,
  };
}

async function readStore(): Promise<StoreData> {
  const filePath = resolvePath();
  await hydrateDurableFile(DURABLE_SANTE_VISITS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoreData;
    const now = new Date().toISOString();
    return {
      visits: Array.isArray(parsed.visits)
        ? parsed.visits.map((item) => normalizeVisit(item, now)).filter((item): item is SanteVisit => Boolean(item))
        : [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { visits: [] };
    throw err;
  }
}

async function writeStore(store: StoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await persistDurableFile(DURABLE_SANTE_VISITS_KEY, filePath);
}

export async function listSanteVisits(): Promise<SanteVisit[]> {
  const store = await readStore();
  return store.visits.slice().sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
}

export async function getSanteVisit(id: string): Promise<SanteVisit | null> {
  const store = await readStore();
  return store.visits.find((item) => item.id === id) ?? null;
}

export async function createSanteVisit(input: SanteVisitInput, actor?: string): Promise<SanteVisit> {
  const { date, year, month } = parseDate(input.date);
  if (!input.nom.trim()) throw new Error('Nom requis');
  if (!input.pathologie.trim()) throw new Error('Pathologie requise');
  const now = new Date().toISOString();
  const visit: SanteVisit = {
    id: uid(),
    date,
    nom: input.nom.trim(),
    postnom: (input.postnom || '').trim(),
    sexe: input.sexe === 'F' || input.sexe === 'M' ? input.sexe : '',
    age: input.age == null || input.age === ('' as unknown) ? null : Number(input.age),
    typeMalade: (input.typeMalade || 'AGENT').trim(),
    pathologie: input.pathologie.trim(),
    traitement: (input.traitement || '').trim(),
    reference: (input.reference || 'NON').trim() || 'NON',
    year,
    month,
    employeeMatricule: (input.employeeMatricule || '').trim(),
    employeeNom: (input.employeeNom || '').trim(),
    dependantId: input.dependantId ?? null,
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
    updatedBy: actor,
  };
  if (visit.age != null && !Number.isFinite(visit.age)) visit.age = null;
  const store = await readStore();
  store.visits.unshift(visit);
  await writeStore(store);
  return visit;
}

export async function updateSanteVisit(
  id: string,
  input: SanteVisitInput,
  actor?: string,
): Promise<SanteVisit> {
  const store = await readStore();
  const index = store.visits.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Visite introuvable');
  const { date, year, month } = parseDate(input.date);
  const prev = store.visits[index];
  const next: SanteVisit = {
    ...prev,
    date,
    year,
    month,
    nom: input.nom.trim(),
    postnom: (input.postnom || '').trim(),
    sexe: input.sexe === 'F' || input.sexe === 'M' ? input.sexe : '',
    age: input.age == null ? null : Number(input.age),
    typeMalade: (input.typeMalade || prev.typeMalade).trim(),
    pathologie: input.pathologie.trim(),
    traitement: (input.traitement || '').trim(),
    reference: (input.reference || 'NON').trim() || 'NON',
    employeeMatricule: (input.employeeMatricule || '').trim(),
    employeeNom: (input.employeeNom || '').trim(),
    dependantId: input.dependantId ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  if (next.age != null && !Number.isFinite(next.age)) next.age = null;
  if (!next.nom) throw new Error('Nom requis');
  if (!next.pathologie) throw new Error('Pathologie requise');
  store.visits[index] = next;
  await writeStore(store);
  return next;
}

export async function deleteSanteVisit(id: string): Promise<SanteVisit> {
  const store = await readStore();
  const index = store.visits.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Visite introuvable');
  const [removed] = store.visits.splice(index, 1);
  await writeStore(store);
  return removed;
}

export async function replaceSanteVisits(visits: SanteVisit[]): Promise<number> {
  const now = new Date().toISOString();
  const normalized = visits.map((item) => normalizeVisit(item, now)).filter((item): item is SanteVisit => Boolean(item));
  await writeStore({ visits: normalized });
  return normalized.length;
}

export function santeExcelMonthLabel(visit: SanteVisit): string {
  return formatSanteExcelMonthLabel(visit.year, visit.month);
}
