import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_CHARROI_ACHATS_KEY,
  DURABLE_CHARROI_VEHICLES_KEY,
  DURABLE_CHARROI_VOYAGES_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type {
  CharroiAchat,
  CharroiAchatInput,
  CharroiAchatsStore,
  CharroiAchatStatus,
  CharroiDocKind,
  CharroiDocPaiement,
  CharroiProprietaire,
  CharroiVehicule,
  CharroiVehiculeInput,
  CharroiVehiclesStore,
  CharroiVoyage,
  CharroiVoyageConfirmInput,
  CharroiVoyageInput,
  CharroiVoyageStatus,
  CharroiVoyageVehiculeMode,
  CharroiVoyagesStore,
} from './charroi-types';
import {
  computeAchatTotal,
  computeAgeFromMiseCirculation,
  computeFuelCost,
  computeObservationTech,
  normalizeEtatManuel,
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

function voyagesPath(): string {
  return resolveStorePath(path.join('data', 'charroi', 'voyages.json'));
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

function parseSeq(id: string, prefix: 'veh' | 'ach' | 'vyg'): number | null {
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

function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizePaiement(raw: unknown): CharroiDocPaiement | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const dateFin = str(o.dateFin);
  if (!isIsoDate(dateFin)) return null;
  const dateDebut = str(o.dateDebut);
  return {
    id: str(o.id) || `doc-${Date.now().toString(36)}`,
    dateDebut: isIsoDate(dateDebut) ? dateDebut : '',
    dateFin,
    preuveUrl: str(o.preuveUrl || o.urlPreuve),
    createdAt: str(o.createdAt) || nowIso(),
  };
}

function seedHistorique(seedFin: string): CharroiDocPaiement[] {
  if (!isIsoDate(seedFin)) return [];
  return [{
    id: `seed-${seedFin}`,
    dateDebut: '',
    dateFin: seedFin,
    preuveUrl: '',
    createdAt: nowIso(),
  }];
}

function sortHistorique(entries: CharroiDocPaiement[]): CharroiDocPaiement[] {
  return [...entries].sort((a, b) => {
    const byFin = b.dateFin.localeCompare(a.dateFin);
    if (byFin !== 0) return byFin;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function normalizeHistorique(raw: unknown, seedFin: string): CharroiDocPaiement[] {
  const list = Array.isArray(raw)
    ? raw.map(normalizePaiement).filter((x): x is CharroiDocPaiement => Boolean(x))
    : [];
  if (list.length === 0) return seedHistorique(seedFin);
  return sortHistorique(list);
}

function latestFin(entries: CharroiDocPaiement[], fallback = ''): string {
  if (entries.length === 0) return fallback;
  return sortHistorique(entries)[0]?.dateFin || fallback;
}

function histKeyOf(kind: CharroiDocKind): keyof Pick<
  CharroiVehicule,
  'assuranceHistorique' | 'vignetteHistorique' | 'controleTechniqueHistorique'
> {
  if (kind === 'assurance') return 'assuranceHistorique';
  if (kind === 'vignette') return 'vignetteHistorique';
  return 'controleTechniqueHistorique';
}

function finKeyOf(kind: CharroiDocKind): keyof Pick<
  CharroiVehicule,
  'assuranceFin' | 'vignetteFin' | 'controleTechniqueFin'
> {
  if (kind === 'assurance') return 'assuranceFin';
  if (kind === 'vignette') return 'vignetteFin';
  return 'controleTechniqueFin';
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
  const etatManuel = normalizeEtatManuel(raw.etatManuel);
  // L'état manuel (ex. Déclassé) prime sur le calcul automatique âge/km.
  const observationTech = etatManuel || computeObservationTech({ age, kilometrage });

  const assuranceHistorique = normalizeHistorique(raw.assuranceHistorique, str(raw.assuranceFin));
  const vignetteHistorique = normalizeHistorique(raw.vignetteHistorique, str(raw.vignetteFin));
  const controleTechniqueHistorique = normalizeHistorique(
    raw.controleTechniqueHistorique,
    str(raw.controleTechniqueFin),
  );

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
    etatManuel,
    assuranceHistorique,
    vignetteHistorique,
    controleTechniqueHistorique,
    assuranceFin: latestFin(assuranceHistorique, str(raw.assuranceFin)),
    vignetteFin: latestFin(vignetteHistorique, str(raw.vignetteFin)),
    controleTechniqueFin: latestFin(controleTechniqueHistorique, str(raw.controleTechniqueFin)),
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
  // Migration: âge / observationTech / labels marque-province / historiques docs → persiste si écart
  const dirty = vehicles.some((item, index) => {
    const raw = rawList[index];
    if (!raw) return true;
    return (
      Number(raw.age ?? NaN) !== Number(item.age ?? NaN)
      || str(raw.observationTech) !== item.observationTech
      || str(raw.marque) !== item.marque
      || str(raw.province) !== item.province
      || !Array.isArray((raw as CharroiVehicule).assuranceHistorique)
      || !Array.isArray((raw as CharroiVehicule).vignetteHistorique)
      || !Array.isArray((raw as CharroiVehicule).controleTechniqueHistorique)
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
  // Conserver l'historique si non fourni ; aligner les dates de fin si mises à jour seules.
  const merged: CharroiVehiculeInput = {
    ...prev,
    ...input,
    id: prev.id,
    assuranceHistorique: input.assuranceHistorique ?? prev.assuranceHistorique,
    vignetteHistorique: input.vignetteHistorique ?? prev.vignetteHistorique,
    controleTechniqueHistorique:
      input.controleTechniqueHistorique ?? prev.controleTechniqueHistorique,
  };
  const updated = normalizeVehicule(
    merged,
    parseSeq(prev.id, 'veh') ?? index + 1,
    { createdAt: prev.createdAt, updatedAt: nowIso() },
  );
  store.vehicles[index] = updated;
  await writeVehiclesStore(store);
  return updated;
}

/** Ajoute une période (paiement) ass./vignette/contr. tech. et met à jour la date de fin courante. */
export async function addVehiculeDocPaiement(
  id: string,
  kind: CharroiDocKind,
  input: { dateDebut?: string; dateFin: string; preuveUrl?: string },
): Promise<CharroiVehicule | null> {
  const store = await readVehiclesStore();
  const index = store.vehicles.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const prev = store.vehicles[index];

  const dateFin = str(input.dateFin);
  if (!isIsoDate(dateFin)) {
    throw new Error('Date de fin invalide (AAAA-MM-JJ)');
  }
  const dateDebut = str(input.dateDebut);
  if (dateDebut && !isIsoDate(dateDebut)) {
    throw new Error('Date de début invalide (AAAA-MM-JJ)');
  }
  if (dateDebut && dateFin < dateDebut) {
    throw new Error('La date de fin doit être postérieure ou égale à la date de début');
  }

  const entry: CharroiDocPaiement = {
    id: `doc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    dateDebut: isIsoDate(dateDebut) ? dateDebut : '',
    dateFin,
    preuveUrl: str(input.preuveUrl),
    createdAt: nowIso(),
  };

  const hKey = histKeyOf(kind);
  const fKey = finKeyOf(kind);
  const historique = sortHistorique([entry, ...(prev[hKey] || [])]);
  const patch: CharroiVehiculeInput = {
    ...prev,
    [hKey]: historique,
    [fKey]: latestFin(historique),
  };

  const updated = normalizeVehicule(
    patch,
    parseSeq(prev.id, 'veh') ?? index + 1,
    { createdAt: prev.createdAt, updatedAt: nowIso() },
  );
  store.vehicles[index] = updated;
  await writeVehiclesStore(store);
  return updated;
}

function parseDocDates(input: { dateDebut?: string; dateFin: string; preuveUrl?: string }) {
  const dateFin = str(input.dateFin);
  if (!isIsoDate(dateFin)) {
    throw new Error('Date de fin invalide (AAAA-MM-JJ)');
  }
  const dateDebut = str(input.dateDebut);
  if (dateDebut && !isIsoDate(dateDebut)) {
    throw new Error('Date de début invalide (AAAA-MM-JJ)');
  }
  if (dateDebut && dateFin < dateDebut) {
    throw new Error('La date de fin doit être postérieure ou égale à la date de début');
  }
  return {
    dateDebut: isIsoDate(dateDebut) ? dateDebut : '',
    dateFin,
    preuveUrl: str(input.preuveUrl),
  };
}

/** Met à jour une période dans l'historique. */
export async function updateVehiculeDocPaiement(
  id: string,
  kind: CharroiDocKind,
  entryId: string,
  input: { dateDebut?: string; dateFin: string; preuveUrl?: string },
): Promise<CharroiVehicule | null> {
  const store = await readVehiclesStore();
  const index = store.vehicles.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const prev = store.vehicles[index];
  const hKey = histKeyOf(kind);
  const fKey = finKeyOf(kind);
  const list = [...(prev[hKey] || [])];
  const entryIndex = list.findIndex((e) => e.id === entryId);
  if (entryIndex < 0) throw new Error('Période introuvable');

  const parsed = parseDocDates(input);
  list[entryIndex] = {
    ...list[entryIndex],
    ...parsed,
  };
  const historique = sortHistorique(list);
  const updated = normalizeVehicule(
    { ...prev, [hKey]: historique, [fKey]: latestFin(historique) },
    parseSeq(prev.id, 'veh') ?? index + 1,
    { createdAt: prev.createdAt, updatedAt: nowIso() },
  );
  store.vehicles[index] = updated;
  await writeVehiclesStore(store);
  return updated;
}

/** Supprime une période de l'historique. */
export async function deleteVehiculeDocPaiement(
  id: string,
  kind: CharroiDocKind,
  entryId: string,
): Promise<CharroiVehicule | null> {
  const store = await readVehiclesStore();
  const index = store.vehicles.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const prev = store.vehicles[index];
  const hKey = histKeyOf(kind);
  const fKey = finKeyOf(kind);
  const historique = sortHistorique((prev[hKey] || []).filter((e) => e.id !== entryId));
  if (historique.length === (prev[hKey] || []).length) {
    throw new Error('Période introuvable');
  }
  const updated = normalizeVehicule(
    {
      ...prev,
      [hKey]: historique,
      [fKey]: latestFin(historique, ''),
    },
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

/** Restore / upsert a vehicle snapshot (audit undo). */
export async function restoreVehicule(vehicule: CharroiVehicule): Promise<CharroiVehicule> {
  const store = await readVehiclesStore();
  const seq = parseSeq(vehicule.id, 'veh') ?? store.nextSeq;
  const restored = normalizeVehicule(vehicule, seq, {
    createdAt: vehicule.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  const index = store.vehicles.findIndex((item) => item.id === restored.id);
  if (index >= 0) store.vehicles[index] = restored;
  else {
    store.vehicles.push(restored);
    store.nextSeq = Math.max(store.nextSeq, seq + 1);
  }
  await writeVehiclesStore(store);
  return restored;
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

/** Restore / upsert an achat snapshot (audit undo). */
export async function restoreAchat(achat: CharroiAchat): Promise<CharroiAchat> {
  const store = await readAchatsStore();
  const seq = parseSeq(achat.id, 'ach') ?? store.nextSeq;
  const restored = normalizeAchat(achat, seq, {
    createdAt: achat.createdAt || nowIso(),
    updatedAt: nowIso(),
  });
  const index = store.achats.findIndex((item) => item.id === restored.id);
  if (index >= 0) store.achats[index] = restored;
  else {
    store.achats.push(restored);
    store.nextSeq = Math.max(store.nextSeq, seq + 1);
  }
  await writeAchatsStore(store);
  return restored;
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

function emptyVoyagesStore(): CharroiVoyagesStore {
  return { voyages: [], nextSeq: 1 };
}

function voyageIdFromSeq(seq: number): string {
  return `vyg-${String(seq).padStart(3, '0')}`;
}

function voyageNumeroFromSeq(seq: number): string {
  return `VYG-${String(seq).padStart(4, '0')}`;
}

function flag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function normalizeHeure(value: unknown): string {
  const match = str(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return '';
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function normalizeVoyageStatus(value: unknown): CharroiVoyageStatus {
  const raw = str(value).toLowerCase();
  if (raw === 'pending' || raw === 'confirme' || raw === 'confirmé') return 'pending';
  if (raw === 'effectue' || raw === 'effectué') return 'effectue';
  if (raw === 'annule' || raw === 'annulé') return 'annule';
  return 'demande';
}

function voyageMoney(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return roundMoney(n);
}

function normalizePersonCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(99, Math.round(n));
}

function departPassed(date: string, time: string, now = new Date()): boolean {
  const [year, month, day] = date.split('-').map((part) => Number(part));
  const [hours, minutes] = time.split(':').map((part) => Number(part));
  if (!year || !month || !day) return false;
  const instant = new Date(year, month - 1, day, hours || 0, minutes || 0, 0, 0);
  return instant.getTime() <= now.getTime();
}

function isVoyageAssigned(voyage: Pick<CharroiVoyage, 'chauffeurNom' | 'vehiculeLibelle'>): boolean {
  return Boolean(voyage.chauffeurNom.trim() && voyage.vehiculeLibelle.trim());
}

/**
 * Effectué seulement si le voyage est approuvé (chauffeur + véhicule)
 * et si la date de départ est passée. Sinon le statut reste Pending.
 * Une demande non affectée ne quitte pas l'onglet Demandes.
 */
function settleDeparted(voyage: CharroiVoyage): CharroiVoyage {
  if (voyage.status === 'annule') return voyage;
  if (!isVoyageAssigned(voyage)) {
    if (voyage.status === 'demande') return voyage;
    return { ...voyage, status: 'demande', completedAt: '' };
  }
  if (!departPassed(voyage.dateDepart, voyage.heureDepart)) {
    if (voyage.status === 'pending' && !voyage.completedAt) return voyage;
    return { ...voyage, status: 'pending', completedAt: '' };
  }
  if (voyage.status === 'effectue') return voyage;
  return {
    ...voyage,
    status: 'effectue',
    completedAt: voyage.completedAt || nowIso(),
  };
}

function normalizeVehiculeMode(value: unknown): CharroiVoyageVehiculeMode {
  const raw = str(value).toLowerCase();
  if (raw === 'flotte') return 'flotte';
  if (raw === 'location') return 'location';
  return '';
}

function normalizeVoyage(
  input: CharroiVoyageInput,
  seq: number,
  timestamps?: { createdAt?: string; updatedAt?: string },
): CharroiVoyage {
  const now = nowIso();
  const passagerNom = str(input.passagerNom);
  const depart = str(input.depart);
  const destination = str(input.destination);
  const dateDepart = str(input.dateDepart);
  const heureDepart = normalizeHeure(input.heureDepart);
  if (!passagerNom) throw new Error('Nom du passager requis');
  if (!depart) throw new Error('Départ requis');
  if (!destination) throw new Error('Destination requise');
  if (depart.toLowerCase() === destination.toLowerCase()) {
    throw new Error('Le départ et la destination doivent être différents');
  }
  if (!isIsoDate(dateDepart)) throw new Error('Date de départ invalide');
  if (!heureDepart) throw new Error('Heure de départ invalide');
  const dateArrivee = str(input.dateArrivee);
  if (dateArrivee && !isIsoDate(dateArrivee)) throw new Error("Date d'arrivée invalide");
  return {
    id: str(input.id) || voyageIdFromSeq(seq),
    numero: str(input.numero) || voyageNumeroFromSeq(seq),
    passagerNom,
    passagerMatricule: str(input.passagerMatricule),
    passagerInterne: flag(input.passagerInterne),
    nombrePersonnes: normalizePersonCount(input.nombrePersonnes),
    depart,
    destination,
    dateDepart,
    heureDepart,
    dateArrivee,
    heureArrivee: normalizeHeure(input.heureArrivee),
    motif: str(input.motif),
    notes: str(input.notes),
    status: normalizeVoyageStatus(input.status),
    chauffeurNom: str(input.chauffeurNom),
    chauffeurMatricule: str(input.chauffeurMatricule),
    chauffeurInterne: flag(input.chauffeurInterne),
    vehiculeMode: normalizeVehiculeMode(input.vehiculeMode),
    vehiculeId: str(input.vehiculeId),
    vehiculeLibelle: str(input.vehiculeLibelle),
    foodAllowance: voyageMoney(input.foodAllowance),
    foodForTheRoad: voyageMoney(input.foodForTheRoad),
    tollGate: voyageMoney(input.tollGate),
    confirmedAt: str(input.confirmedAt),
    completedAt: str(input.completedAt),
    createdAt: timestamps?.createdAt || str(input.createdAt) || now,
    updatedAt: timestamps?.updatedAt || now,
  };
}

async function readVoyagesStore(): Promise<CharroiVoyagesStore> {
  const store = await readJsonFile<CharroiVoyagesStore>(
    DURABLE_CHARROI_VOYAGES_KEY,
    voyagesPath(),
    emptyVoyagesStore(),
  );
  const voyages = Array.isArray(store.voyages)
    ? store.voyages.map((item, index) => normalizeVoyage(item, index + 1, {
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    }))
    : [];
  const maxSeq = voyages.reduce((max, item) => {
    const seq = parseSeq(item.id, 'vyg');
    return seq != null && seq > max ? seq : max;
  }, 0);
  return {
    voyages,
    nextSeq: Math.max(Number(store.nextSeq) || 1, maxSeq + 1),
  };
}

async function writeVoyagesStore(store: CharroiVoyagesStore): Promise<void> {
  await writeJsonFile(DURABLE_CHARROI_VOYAGES_KEY, voyagesPath(), store);
}

export async function listVoyages(): Promise<CharroiVoyage[]> {
  const store = await readVoyagesStore();
  let dirty = false;
  store.voyages = store.voyages.map((item) => {
    const next = settleDeparted(item);
    if (next.status !== item.status) dirty = true;
    return next;
  });
  if (dirty) await writeVoyagesStore(store);
  return [...store.voyages].sort((a, b) => {
    const left = `${a.dateDepart}T${a.heureDepart}`;
    const right = `${b.dateDepart}T${b.heureDepart}`;
    return right.localeCompare(left);
  });
}

export async function getVoyage(id: string): Promise<CharroiVoyage | null> {
  const store = await readVoyagesStore();
  return store.voyages.find((item) => item.id === id) ?? null;
}

export async function createVoyage(input: CharroiVoyageInput): Promise<CharroiVoyage> {
  const store = await readVoyagesStore();
  const seq = store.nextSeq;
  const voyage = normalizeVoyage(
    {
      ...input,
      id: voyageIdFromSeq(seq),
      numero: voyageNumeroFromSeq(seq),
      status: 'demande',
      chauffeurNom: '',
      chauffeurMatricule: '',
      chauffeurInterne: false,
      vehiculeMode: '',
      vehiculeId: '',
      vehiculeLibelle: '',
      foodAllowance: 0,
      foodForTheRoad: 0,
      tollGate: 0,
      confirmedAt: '',
      completedAt: '',
      dateArrivee: '',
      heureArrivee: '',
    },
    seq,
  );
  const settled = settleDeparted(voyage);
  store.voyages.push(settled);
  store.nextSeq = seq + 1;
  await writeVoyagesStore(store);
  return settled;
}

export async function updateVoyage(id: string, input: CharroiVoyageInput): Promise<CharroiVoyage> {
  const store = await readVoyagesStore();
  const index = store.voyages.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Voyage introuvable');
  const prev = store.voyages[index];
  const seq = parseSeq(prev.id, 'vyg') ?? index + 1;
  const updated = normalizeVoyage(
    {
      ...prev,
      ...input,
      id: prev.id,
      numero: prev.numero,
      status: prev.status,
      chauffeurNom: prev.chauffeurNom,
      chauffeurMatricule: prev.chauffeurMatricule,
      chauffeurInterne: prev.chauffeurInterne,
      vehiculeMode: prev.vehiculeMode,
      vehiculeId: prev.vehiculeId,
      vehiculeLibelle: prev.vehiculeLibelle,
      foodAllowance: prev.foodAllowance,
      foodForTheRoad: prev.foodForTheRoad,
      tollGate: prev.tollGate,
      confirmedAt: prev.confirmedAt,
      completedAt: prev.completedAt,
    },
    seq,
    { createdAt: prev.createdAt, updatedAt: nowIso() },
  );
  const settled = settleDeparted(updated);
  store.voyages[index] = settled;
  await writeVoyagesStore(store);
  return settled;
}

export async function confirmVoyage(
  id: string,
  input: CharroiVoyageConfirmInput,
): Promise<CharroiVoyage> {
  const store = await readVoyagesStore();
  const index = store.voyages.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Voyage introuvable');
  const prev = store.voyages[index];
  if (prev.status === 'effectue') throw new Error('Voyage déjà effectué');
  if (prev.status === 'annule') throw new Error('Voyage annulé');
  const chauffeurNom = str(input.chauffeurNom);
  if (!chauffeurNom) throw new Error('Chauffeur requis');
  const mode = input.vehiculeMode;
  let vehiculeId = '';
  let vehiculeLibelle = '';
  if (mode === 'flotte') {
    vehiculeId = str(input.vehiculeId);
    const vehicles = await listVehicules();
    const vehicle = vehicles.find((item) => item.id === vehiculeId);
    if (!vehicle) throw new Error('Véhicule introuvable');
    vehiculeLibelle = [vehicle.plaque, vehicle.marque, vehicle.type].filter(Boolean).join(' · ');
  } else if (mode === 'location') {
    vehiculeLibelle = str(input.vehiculeLocation);
    if (!vehiculeLibelle) throw new Error('Véhicule de location requis');
  } else {
    throw new Error('Véhicule requis');
  }
  const now = nowIso();
  const updated: CharroiVoyage = {
    ...prev,
    status: 'pending',
    chauffeurNom,
    chauffeurMatricule: str(input.chauffeurMatricule),
    chauffeurInterne: flag(input.chauffeurInterne),
    vehiculeMode: mode,
    vehiculeId,
    vehiculeLibelle,
    foodAllowance: voyageMoney(input.foodAllowance),
    foodForTheRoad: voyageMoney(input.foodForTheRoad),
    tollGate: voyageMoney(input.tollGate),
    confirmedAt: prev.confirmedAt || now,
    updatedAt: now,
  };
  const settled = settleDeparted(updated);
  store.voyages[index] = settled;
  await writeVoyagesStore(store);
  return settled;
}

export async function completeVoyage(
  id: string,
  input: { dateArrivee?: string; heureArrivee?: string } = {},
): Promise<CharroiVoyage> {
  const store = await readVoyagesStore();
  const index = store.voyages.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Voyage introuvable');
  const prev = store.voyages[index];
  if (!isVoyageAssigned(prev)) {
    throw new Error('Confirmez le voyage et affectez un chauffeur et un véhicule');
  }
  if (!departPassed(prev.dateDepart, prev.heureDepart)) {
    throw new Error('Date de départ invalide : le départ n\'est pas encore arrivé');
  }
  if (prev.status !== 'pending' && prev.status !== 'effectue') {
    throw new Error('Confirmez le voyage avant de le marquer effectué');
  }
  const dateArrivee = str(input.dateArrivee);
  if (dateArrivee && !isIsoDate(dateArrivee)) throw new Error("Date d'arrivée invalide");
  const now = nowIso();
  const updated: CharroiVoyage = {
    ...prev,
    status: 'effectue',
    dateArrivee,
    heureArrivee: normalizeHeure(input.heureArrivee),
    completedAt: prev.completedAt || now,
    updatedAt: now,
  };
  store.voyages[index] = updated;
  await writeVoyagesStore(store);
  return updated;
}

export async function cancelVoyage(id: string): Promise<CharroiVoyage> {
  const store = await readVoyagesStore();
  const index = store.voyages.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Voyage introuvable');
  const prev = store.voyages[index];
  if (prev.status === 'effectue') throw new Error('Un voyage effectué ne peut pas être annulé');
  const updated: CharroiVoyage = {
    ...prev,
    status: 'annule',
    updatedAt: nowIso(),
  };
  store.voyages[index] = updated;
  await writeVoyagesStore(store);
  return updated;
}

export async function reopenVoyage(id: string): Promise<CharroiVoyage> {
  const store = await readVoyagesStore();
  const index = store.voyages.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Voyage introuvable');
  const prev = store.voyages[index];
  if (prev.status !== 'annule' && prev.status !== 'effectue') {
    throw new Error('Seuls un voyage annulé ou effectué peut être rouvert');
  }
  const assigned = Boolean(prev.chauffeurNom && prev.vehiculeLibelle);
  const now = nowIso();
  const updated: CharroiVoyage = {
    ...prev,
    status: assigned && prev.status === 'effectue' ? 'pending' : 'demande',
    completedAt: '',
    confirmedAt: assigned && prev.status === 'effectue' ? prev.confirmedAt : '',
    chauffeurNom: prev.status === 'annule' ? '' : prev.chauffeurNom,
    chauffeurMatricule: prev.status === 'annule' ? '' : prev.chauffeurMatricule,
    chauffeurInterne: prev.status === 'annule' ? false : prev.chauffeurInterne,
    vehiculeMode: prev.status === 'annule' ? '' : prev.vehiculeMode,
    vehiculeId: prev.status === 'annule' ? '' : prev.vehiculeId,
    vehiculeLibelle: prev.status === 'annule' ? '' : prev.vehiculeLibelle,
    updatedAt: now,
  };
  const settled = settleDeparted(updated);
  store.voyages[index] = settled;
  await writeVoyagesStore(store);
  return settled;
}

export async function deleteVoyage(id: string): Promise<boolean> {
  const store = await readVoyagesStore();
  const next = store.voyages.filter((item) => item.id !== id);
  if (next.length === store.voyages.length) return false;
  store.voyages = next;
  await writeVoyagesStore(store);
  return true;
}
