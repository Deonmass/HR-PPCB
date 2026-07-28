import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_CHARROI_ACHATS_KEY,
  DURABLE_CHARROI_VEHICLES_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type {
  CharroiAchat,
  CharroiAchatInput,
  CharroiAchatsStore,
  CharroiAchatStatus,
  CharroiProprietaire,
  CharroiVehicule,
  CharroiVehiculeInput,
  CharroiVehiclesStore,
} from './charroi-types';
import {
  computeAchatTotal,
  computeAgeFromMiseCirculation,
  computeFuelCost,
  computeObservationTech,
  normalizeMarqueLabel,
  normalizeProvinceLabel,
  roundMoney,
} from './charroi-types';

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

function vehiclesPath(): string {
  return resolveStorePath(path.join('data', 'charroi', 'vehicles.json'));
}

function achatsPath(): string {
  return resolveStorePath(path.join('data', 'charroi', 'achats.json'));
}

function emptyVehiclesStore(): CharroiVehiclesStore {
  return { vehicles: [], nextSeq: 1 };
}

function emptyAchatsStore(): CharroiAchatsStore {
  return { achats: [], nextSeq: 1 };
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const cleaned = String(value).replace(/\s/g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function money(value: unknown): number {
  const n = num(value);
  return n == null ? 0 : roundMoney(n);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeProprietaire(value: unknown): CharroiProprietaire {
  const raw = str(value).toUpperCase();
  if (raw.includes('LOXEA')) return 'LOXEA';
  if (raw.includes('PPC')) return 'PPC';
  return '';
}

function normalizeStatus(value: unknown): CharroiAchatStatus {
  const raw = str(value).toLowerCase();
  if (raw === 'approuve' || raw === 'approuvé') return 'approuve';
  if (raw === 'livre' || raw === 'livré') return 'livre';
  if (raw === 'annule' || raw === 'annulé') return 'annule';
  return 'demande';
}

function vehiculeIdFromSeq(seq: number): string {
  return `veh-${String(seq).padStart(3, '0')}`;
}

function achatIdFromSeq(seq: number): string {
  return `ach-${String(seq).padStart(3, '0')}`;
}

function parseSeq(id: string, prefix: 'veh' | 'ach'): number | null {
  const match = id.trim().match(new RegExp(`^${prefix}-(\\d+)$`));
  if (!match) return null;
  const seq = Number.parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
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

function normalizeVehicule(
  raw: CharroiVehiculeInput,
  fallbackSeq: number,
  timestamps?: { createdAt?: string; updatedAt?: string },
): CharroiVehicule {
  const id = str(raw.id) || vehiculeIdFromSeq(fallbackSeq);
  const stamp = nowIso();
  const miseCirculation = str(raw.miseCirculation);
  const kilometrage = num(raw.kilometrage);
  const ageFromYear = computeAgeFromMiseCirculation(miseCirculation);
  const age = ageFromYear ?? num(raw.age);
  const observationTech = computeObservationTech({ age, kilometrage });
  return {
    id,
    numero: num(raw.numero),
    marque: normalizeMarqueLabel(raw.marque),
    type: str(raw.type),
    numeroChassis: str(raw.numeroChassis),
    plaque: str(raw.plaque),
    cv: str(raw.cv),
    assureur: str(raw.assureur),
    departement: str(raw.departement),
    user: str(raw.user),
    province: normalizeProvinceLabel(raw.province),
    proprietaire: normalizeProprietaire(raw.proprietaire),
    kilometrage,
    miseCirculation,
    age,
    observationTech,
    notes: str(raw.notes),
    createdAt: str(raw.createdAt) || timestamps?.createdAt || stamp,
    updatedAt: timestamps?.updatedAt || stamp,
  };
}

function normalizeAchat(
  raw: CharroiAchatInput,
  fallbackSeq: number,
  timestamps?: { createdAt?: string; updatedAt?: string },
): CharroiAchat {
  const id = str(raw.id) || achatIdFromSeq(fallbackSeq);
  const stamp = nowIso();
  const litres = money(raw.nbreLitrCarteEngen);
  const prixLitre = money(raw.prixLitre);
  const fuelCost = computeFuelCost(litres, prixLitre);
  const partial = {
    coutAchat: money(raw.coutAchat),
    coutPneus: money(raw.coutPneus),
    battery: money(raw.battery),
    othersConsumables: money(raw.othersConsumables),
    fuelCost,
    assuranceAnnuelle: money(raw.assuranceAnnuelle),
    taxesControlTech: money(raw.taxesControlTech),
    vignette: money(raw.vignette),
    nouvellePlaque: money(raw.nouvellePlaque),
    entretienTrimestriel: money(raw.entretienTrimestriel),
    reparationsDiverses: money(raw.reparationsDiverses),
  };
  const total = computeAchatTotal(partial);

  return {
    id,
    numero: num(raw.numero),
    nature: str(raw.nature),
    marque: normalizeMarqueLabel(raw.marque),
    type: str(raw.type),
    plaque: str(raw.plaque),
    cv: str(raw.cv),
    miseCirc: str(raw.miseCirc),
    depart: str(raw.depart),
    centreDeCout: str(raw.centreDeCout),
    province: normalizeProvinceLabel(raw.province),
    matricule: str(raw.matricule),
    secteur: str(raw.secteur),
    ...partial,
    nbreLitrCarteEngen: litres,
    prixLitre,
    total,
    status: normalizeStatus(raw.status),
    notes: str(raw.notes),
    createdAt: str(raw.createdAt) || timestamps?.createdAt || stamp,
    updatedAt: timestamps?.updatedAt || stamp,
  };
}

async function readVehiclesStore(): Promise<CharroiVehiclesStore> {
  const store = await readJsonFile<CharroiVehiclesStore>(
    DURABLE_CHARROI_VEHICLES_KEY,
    vehiclesPath(),
    emptyVehiclesStore(),
  );
  const rawList = Array.isArray(store.vehicles) ? store.vehicles : [];
  const vehicles = rawList.map((item, index) => normalizeVehicule(item, index + 1, {
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
  const maxSeq = vehicles.reduce((max, item) => {
    const seq = parseSeq(item.id, 'veh');
    return seq != null && seq > max ? seq : max;
  }, 0);
  const nextStore: CharroiVehiclesStore = {
    vehicles,
    nextSeq: Math.max(Number(store.nextSeq) || 1, maxSeq + 1),
  };
  // Migration: âge / observationTech / labels marque-province → persiste si écart
  const dirty = vehicles.some((item, index) => {
    const raw = rawList[index];
    if (!raw) return true;
    return (
      Number(raw.age ?? NaN) !== Number(item.age ?? NaN)
      || str(raw.observationTech) !== item.observationTech
      || str(raw.marque) !== item.marque
      || str(raw.province) !== item.province
    );
  });
  if (dirty && vehicles.length > 0) {
    await writeVehiclesStore(nextStore);
  }
  return nextStore;
}

async function writeVehiclesStore(store: CharroiVehiclesStore): Promise<void> {
  await writeJsonFile(DURABLE_CHARROI_VEHICLES_KEY, vehiclesPath(), store);
}

async function readAchatsStore(): Promise<CharroiAchatsStore> {
  const store = await readJsonFile<CharroiAchatsStore>(
    DURABLE_CHARROI_ACHATS_KEY,
    achatsPath(),
    emptyAchatsStore(),
  );
  const achats = Array.isArray(store.achats)
    ? store.achats.map((item, index) => normalizeAchat(item, index + 1, {
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))
    : [];
  const maxSeq = achats.reduce((max, item) => {
    const seq = parseSeq(item.id, 'ach');
    return seq != null && seq > max ? seq : max;
  }, 0);
  return {
    achats,
    nextSeq: Math.max(Number(store.nextSeq) || 1, maxSeq + 1),
  };
}

async function writeAchatsStore(store: CharroiAchatsStore): Promise<void> {
  await writeJsonFile(DURABLE_CHARROI_ACHATS_KEY, achatsPath(), store);
}

export async function listVehicules(): Promise<CharroiVehicule[]> {
  const store = await readVehiclesStore();
  return store.vehicles;
}

export async function getVehicule(id: string): Promise<CharroiVehicule | null> {
  const store = await readVehiclesStore();
  return store.vehicles.find((item) => item.id === id) ?? null;
}

export async function createVehicule(input: CharroiVehiculeInput): Promise<CharroiVehicule> {
  const store = await readVehiclesStore();
  const vehicule = normalizeVehicule(
    { ...input, id: undefined, numero: input.numero ?? store.nextSeq },
    store.nextSeq,
  );
  store.vehicles.push(vehicule);
  store.nextSeq += 1;
  await writeVehiclesStore(store);
  return vehicule;
}

export async function updateVehicule(
  id: string,
  input: CharroiVehiculeInput,
): Promise<CharroiVehicule | null> {
  const store = await readVehiclesStore();
  const index = store.vehicles.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const prev = store.vehicles[index];
  const updated = normalizeVehicule(
    { ...prev, ...input, id: prev.id },
    parseSeq(prev.id, 'veh') ?? index + 1,
    { createdAt: prev.createdAt, updatedAt: nowIso() },
  );
  store.vehicles[index] = updated;
  await writeVehiclesStore(store);
  return updated;
}

export async function deleteVehicule(id: string): Promise<boolean> {
  const store = await readVehiclesStore();
  const next = store.vehicles.filter((item) => item.id !== id);
  if (next.length === store.vehicles.length) return false;
  store.vehicles = next;
  await writeVehiclesStore(store);
  return true;
}

export async function listAchats(): Promise<CharroiAchat[]> {
  const store = await readAchatsStore();
  return store.achats;
}

export async function getAchat(id: string): Promise<CharroiAchat | null> {
  const store = await readAchatsStore();
  return store.achats.find((item) => item.id === id) ?? null;
}

export async function createAchat(input: CharroiAchatInput): Promise<CharroiAchat> {
  const store = await readAchatsStore();
  const achat = normalizeAchat(
    { ...input, id: undefined, numero: input.numero ?? store.nextSeq },
    store.nextSeq,
  );
  store.achats.push(achat);
  store.nextSeq += 1;
  await writeAchatsStore(store);
  return achat;
}

export async function updateAchat(
  id: string,
  input: CharroiAchatInput,
): Promise<CharroiAchat | null> {
  const store = await readAchatsStore();
  const index = store.achats.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const prev = store.achats[index];
  const updated = normalizeAchat(
    { ...prev, ...input, id: prev.id },
    parseSeq(prev.id, 'ach') ?? index + 1,
    { createdAt: prev.createdAt, updatedAt: nowIso() },
  );
  store.achats[index] = updated;
  await writeAchatsStore(store);
  return updated;
}

export async function deleteAchat(id: string): Promise<boolean> {
  const store = await readAchatsStore();
  const next = store.achats.filter((item) => item.id !== id);
  if (next.length === store.achats.length) return false;
  store.achats = next;
  await writeAchatsStore(store);
  return true;
}

/** Replace store contents (seed / import). */
export async function replaceVehiclesStore(store: CharroiVehiclesStore): Promise<void> {
  const vehicles = store.vehicles.map((item, index) =>
    normalizeVehicule(item, index + 1, {
      createdAt: item.createdAt || nowIso(),
      updatedAt: item.updatedAt || nowIso(),
    }));
  const maxSeq = vehicles.reduce((max, item) => {
    const seq = parseSeq(item.id, 'veh') ?? 0;
    return Math.max(max, seq, item.numero ?? 0);
  }, 0);
  await writeVehiclesStore({
    vehicles,
    nextSeq: Math.max(store.nextSeq || 1, maxSeq + 1),
  });
}

export async function replaceAchatsStore(store: CharroiAchatsStore): Promise<void> {
  const achats = store.achats.map((item, index) =>
    normalizeAchat(item, index + 1, {
      createdAt: item.createdAt || nowIso(),
      updatedAt: item.updatedAt || nowIso(),
    }));
  const maxSeq = achats.reduce((max, item) => {
    const seq = parseSeq(item.id, 'ach') ?? 0;
    return Math.max(max, seq, item.numero ?? 0);
  }, 0);
  await writeAchatsStore({
    achats,
    nextSeq: Math.max(store.nextSeq || 1, maxSeq + 1),
  });
}
