import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import {
  DURABLE_VILLAGE_AFFECTATION_HISTORY_KEY,
  DURABLE_VILLAGE_AFFECTATION_SUGGESTIONS_KEY,
  DURABLE_VILLAGE_MAISONS_KEY,
  DURABLE_VILLAGE_TAILLES_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import {
  AFFECTATION_HISTO_COL,
  AFFECTATION_HISTO_DATA_START,
  MAISON_COL,
  MAISON_DATA_START,
  SUGGESTION_AFFECTATION_COL,
  SUGGESTION_AFFECTATION_DATA_START,
  TAILLE_COL,
  TAILLE_DATA_START,
} from './village-columns';
import type { VillageMaison, VillageMaisonFormData, VillageTaille, VillageTailleFormData } from './village-types';
import type {
  VillageAffectationHistoryEntry,
  VillageAffectationHistoryJsonStoreData,
  VillageAffectationSuggestion,
  VillageAffectationSuggestionForm,
  VillageAffectationSuggestionsJsonStoreData,
  VillageCatalogJsonStoreData,
} from './village-json-types';
import { compareMaisonNumero } from './table-sort';
import { getEmployeeWorkbookPath } from './excel-data-paths';
import { getSheetBlock, readWorkbookForData, withExcelLock, type AoaRow } from './excel-io';

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), relativePath);
  }
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

function taillesPath(): string {
  return resolveStorePath(path.join('data', 'village', 'tailles.json'));
}

function maisonsPath(): string {
  return resolveStorePath(path.join('data', 'village', 'maisons.json'));
}

function historyPath(): string {
  return resolveStorePath(path.join('data', 'village', 'affectation-history.json'));
}

function suggestionsPath(): string {
  return resolveStorePath(path.join('data', 'village', 'affectation-suggestions.json'));
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function nowDisplay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newSuggestionId(): string {
  return `sug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
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

function rowToTaille(row: AoaRow): VillageTaille | null {
  const code = str(row[TAILLE_COL.code]);
  if (!code) return null;
  return {
    code,
    label: str(row[TAILLE_COL.label]) || code,
    capacite: numOrNull(row[TAILLE_COL.capacite]),
    commentaires: str(row[TAILLE_COL.commentaires]),
  };
}

function rowToMaison(row: AoaRow): VillageMaison | null {
  const numero = str(row[MAISON_COL.numero]);
  if (!numero) return null;
  const taille = str(row[MAISON_COL.taille]);
  const typeMaison = str(row[MAISON_COL.typeMaison]) || taille;
  return {
    numero,
    taille,
    typeMaison,
    commentaires: str(row[MAISON_COL.commentaires]),
    occupantExterne: str(row[MAISON_COL.occupantExterne]),
  };
}

function rowToHistoryEntry(row: AoaRow): VillageAffectationHistoryEntry | null {
  const matricule = str(row[AFFECTATION_HISTO_COL.matricule]);
  const date = str(row[AFFECTATION_HISTO_COL.date]);
  if (!date && !matricule) return null;
  return {
    date,
    action: str(row[AFFECTATION_HISTO_COL.action]) || 'Affecter',
    matricule,
    nom: str(row[AFFECTATION_HISTO_COL.nom]),
    numeroVilla: str(row[AFFECTATION_HISTO_COL.numeroVilla]),
    typeMaison: str(row[AFFECTATION_HISTO_COL.typeMaison]),
    ancienNumero: str(row[AFFECTATION_HISTO_COL.ancienNumero]),
    raison: str(row[AFFECTATION_HISTO_COL.raison]),
    commentaire: str(row[AFFECTATION_HISTO_COL.commentaire]),
  };
}

function rowToSuggestion(row: AoaRow): VillageAffectationSuggestion | null {
  const id = str(row[SUGGESTION_AFFECTATION_COL.id]);
  const numeroVilla = str(row[SUGGESTION_AFFECTATION_COL.numeroVilla]);
  if (!id || !numeroVilla) return null;
  return {
    id,
    numeroVilla,
    matricule: str(row[SUGGESTION_AFFECTATION_COL.matricule]),
    nom: str(row[SUGGESTION_AFFECTATION_COL.nom]),
    commentaire: str(row[SUGGESTION_AFFECTATION_COL.commentaire]),
    createdAt: str(row[SUGGESTION_AFFECTATION_COL.createdAt]),
  };
}

async function readLegacyVillageData(): Promise<{
  catalog: VillageCatalogJsonStoreData;
  history: VillageAffectationHistoryJsonStoreData;
  suggestions: VillageAffectationSuggestionsJsonStoreData;
}> {
  const livePath = getEmployeeWorkbookPath();
  return withExcelLock(livePath, async () => {
    const workbook = await readWorkbookForData(livePath);
    const tailles = getSheetBlock(workbook, 'TAILLE', TAILLE_DATA_START, { keyCol: 0 }).dataRows
      .map(rowToTaille)
      .filter((item): item is VillageTaille => Boolean(item))
      .sort((a, b) => a.code.localeCompare(b.code, 'fr'));
    const maisons = getSheetBlock(workbook, 'MAISON', MAISON_DATA_START, { keyCol: 0 }).dataRows
      .map(rowToMaison)
      .filter((item): item is VillageMaison => Boolean(item))
      .sort((a, b) => compareMaisonNumero(a.numero, b.numero));

    const historyRows = workbook.Sheets['AFFECTATION_HISTO']
      ? getSheetBlock(workbook, 'AFFECTATION_HISTO', AFFECTATION_HISTO_DATA_START, { keyCol: 0 }).dataRows
      : [];
    const suggestionRows = workbook.Sheets['SUGGESTION_AFFECTATION']
      ? getSheetBlock(workbook, 'SUGGESTION_AFFECTATION', SUGGESTION_AFFECTATION_DATA_START, { keyCol: 0 }).dataRows
      : [];

    return {
      catalog: { tailles, maisons },
      history: {
        entries: historyRows
          .map(rowToHistoryEntry)
          .filter((item): item is VillageAffectationHistoryEntry => Boolean(item)),
      },
      suggestions: {
        suggestions: suggestionRows
          .map(rowToSuggestion)
          .filter((item): item is VillageAffectationSuggestion => Boolean(item)),
      },
    };
  });
}

async function ensureMigrated(): Promise<void> {
  const [taillesExists, maisonsExists, historyExists, suggestionsExists] = await Promise.all([
    fsPromises.access(taillesPath()).then(() => true).catch(() => false),
    fsPromises.access(maisonsPath()).then(() => true).catch(() => false),
    fsPromises.access(historyPath()).then(() => true).catch(() => false),
    fsPromises.access(suggestionsPath()).then(() => true).catch(() => false),
  ]);
  if (taillesExists && maisonsExists && historyExists && suggestionsExists) return;

  let legacy = {
    catalog: { tailles: [] as VillageTaille[], maisons: [] as VillageMaison[] },
    history: { entries: [] as VillageAffectationHistoryEntry[] },
    suggestions: { suggestions: [] as VillageAffectationSuggestion[] },
  };
  try {
    const livePath = getEmployeeWorkbookPath();
    if (fs.existsSync(livePath)) {
      legacy = await readLegacyVillageData();
    }
  } catch {
    // Live Excel gone — seed empty JSON stores.
  }
  await Promise.all([
    writeJsonFile(DURABLE_VILLAGE_TAILLES_KEY, taillesPath(), { tailles: legacy.catalog.tailles }),
    writeJsonFile(DURABLE_VILLAGE_MAISONS_KEY, maisonsPath(), { maisons: legacy.catalog.maisons }),
    writeJsonFile(DURABLE_VILLAGE_AFFECTATION_HISTORY_KEY, historyPath(), legacy.history),
    writeJsonFile(DURABLE_VILLAGE_AFFECTATION_SUGGESTIONS_KEY, suggestionsPath(), legacy.suggestions),
  ]);
}

async function readTaillesStore(): Promise<{ tailles: VillageTaille[] }> {
  return readJsonFile(DURABLE_VILLAGE_TAILLES_KEY, taillesPath(), { tailles: [] });
}

async function readMaisonsStore(): Promise<{ maisons: VillageMaison[] }> {
  return readJsonFile(DURABLE_VILLAGE_MAISONS_KEY, maisonsPath(), { maisons: [] });
}

async function readHistoryStore(): Promise<VillageAffectationHistoryJsonStoreData> {
  return readJsonFile(DURABLE_VILLAGE_AFFECTATION_HISTORY_KEY, historyPath(), { entries: [] });
}

async function readSuggestionsStore(): Promise<VillageAffectationSuggestionsJsonStoreData> {
  return readJsonFile(DURABLE_VILLAGE_AFFECTATION_SUGGESTIONS_KEY, suggestionsPath(), { suggestions: [] });
}

export async function readVillageCatalog(): Promise<VillageCatalogJsonStoreData> {
  await ensureMigrated();
  const [taillesStore, maisonsStore] = await Promise.all([readTaillesStore(), readMaisonsStore()]);
  return {
    tailles: [...taillesStore.tailles].sort((a, b) => a.code.localeCompare(b.code, 'fr')),
    maisons: [...maisonsStore.maisons].sort((a, b) => compareMaisonNumero(a.numero, b.numero)),
  };
}

export async function upsertTaille(data: VillageTailleFormData): Promise<VillageTaille> {
  await ensureMigrated();
  const code = data.code.trim();
  if (!code) throw new Error('Code taille requis');
  const store = await readTaillesStore();
  const saved: VillageTaille = {
    code,
    label: (data.label ?? code).trim() || code,
    capacite: data.capacite ?? null,
    commentaires: data.commentaires?.trim() || '',
  };
  const index = store.tailles.findIndex((item) => item.code.toLowerCase() === code.toLowerCase());
  if (index >= 0) store.tailles[index] = saved;
  else store.tailles.push(saved);
  await writeJsonFile(DURABLE_VILLAGE_TAILLES_KEY, taillesPath(), {
    tailles: store.tailles.sort((a, b) => a.code.localeCompare(b.code, 'fr')),
  });
  return saved;
}

export async function deleteTaille(code: string): Promise<boolean> {
  await ensureMigrated();
  const key = code.trim().toLowerCase();
  if (!key) return false;
  const store = await readTaillesStore();
  const next = store.tailles.filter((item) => item.code.toLowerCase() !== key);
  if (next.length === store.tailles.length) return false;
  await writeJsonFile(DURABLE_VILLAGE_TAILLES_KEY, taillesPath(), { tailles: next });
  return true;
}

export async function upsertMaison(data: VillageMaisonFormData): Promise<VillageMaison> {
  const saved = await upsertManyMaisons([data]);
  const first = saved[0];
  if (!first) throw new Error('Impossible d’enregistrer la maison');
  return first;
}

export async function upsertManyMaisons(items: VillageMaisonFormData[]): Promise<VillageMaison[]> {
  await ensureMigrated();
  if (!items.length) return [];
  const store = await readMaisonsStore();
  const saved: VillageMaison[] = [];
  for (const item of items) {
    const numero = item.numero.trim();
    if (!numero) continue;
    const index = store.maisons.findIndex((row) => row.numero.toLowerCase() === numero.toLowerCase());
    const existing = index >= 0 ? store.maisons[index] : null;
    const next: VillageMaison = {
      numero,
      taille: item.taille.trim(),
      typeMaison: item.typeMaison?.trim() || item.taille.trim(),
      commentaires: item.commentaires?.trim() || '',
      occupantExterne: item.occupantExterne !== undefined
        ? item.occupantExterne.trim()
        : existing?.occupantExterne || '',
    };
    if (index >= 0) store.maisons[index] = next;
    else store.maisons.push(next);
    saved.push(next);
  }
  await writeJsonFile(DURABLE_VILLAGE_MAISONS_KEY, maisonsPath(), {
    maisons: store.maisons.sort((a, b) => compareMaisonNumero(a.numero, b.numero)),
  });
  return saved.sort((a, b) => compareMaisonNumero(a.numero, b.numero));
}

export async function deleteMaison(numero: string): Promise<boolean> {
  await ensureMigrated();
  const key = numero.trim().toLowerCase();
  if (!key) return false;
  const store = await readMaisonsStore();
  const next = store.maisons.filter((item) => item.numero.toLowerCase() !== key);
  if (next.length === store.maisons.length) return false;
  await writeJsonFile(DURABLE_VILLAGE_MAISONS_KEY, maisonsPath(), { maisons: next });
  return true;
}

export async function setMaisonOccupantExterne(numero: string, occupantExterne: string): Promise<VillageMaison> {
  await ensureMigrated();
  const key = numero.trim().toLowerCase();
  if (!key) throw new Error('Numéro de maison requis');
  const store = await readMaisonsStore();
  const index = store.maisons.findIndex((item) => item.numero.toLowerCase() === key);
  if (index < 0) throw new Error(`Maison « ${numero} » introuvable`);
  store.maisons[index] = {
    ...store.maisons[index],
    occupantExterne: occupantExterne.trim(),
  };
  await writeJsonFile(DURABLE_VILLAGE_MAISONS_KEY, maisonsPath(), { maisons: store.maisons });
  return store.maisons[index];
}

export async function readAffectationHistory(): Promise<VillageAffectationHistoryEntry[]> {
  await ensureMigrated();
  const store = await readHistoryStore();
  return [...store.entries].reverse();
}

export async function appendAffectationHistory(
  entries: Array<Partial<VillageAffectationHistoryEntry> & { matricule: string; action: string }>,
): Promise<void> {
  await ensureMigrated();
  if (!entries.length) return;
  const store = await readHistoryStore();
  for (const entry of entries) {
    store.entries.push({
      date: entry.date || nowDisplay(),
      action: entry.action,
      matricule: entry.matricule,
      nom: entry.nom ?? '',
      numeroVilla: entry.numeroVilla ?? '',
      typeMaison: entry.typeMaison ?? '',
      ancienNumero: entry.ancienNumero ?? '',
      raison: entry.raison ?? '',
      commentaire: entry.commentaire ?? '',
    });
  }
  await writeJsonFile(DURABLE_VILLAGE_AFFECTATION_HISTORY_KEY, historyPath(), store);
}

export async function readAffectationSuggestions(numeroVilla?: string): Promise<VillageAffectationSuggestion[]> {
  await ensureMigrated();
  const store = await readSuggestionsStore();
  let list = [...store.suggestions];
  if (numeroVilla?.trim()) {
    const key = numeroVilla.trim().toLowerCase();
    list = list.filter((item) => item.numeroVilla.toLowerCase() === key);
  }
  return list.sort((a, b) => a.numeroVilla.localeCompare(b.numeroVilla, 'fr', { numeric: true }));
}

export async function upsertAffectationSuggestion(
  data: VillageAffectationSuggestionForm,
): Promise<VillageAffectationSuggestion> {
  await ensureMigrated();
  const numeroVilla = data.numeroVilla.trim();
  const matricule = data.matricule.trim();
  if (!numeroVilla) throw new Error('Numéro de maison requis');
  if (!matricule) throw new Error('Matricule agent requis');
  const store = await readSuggestionsStore();
  const id = data.id?.trim() || newSuggestionId();
  const index = store.suggestions.findIndex((item) => item.id.toLowerCase() === id.toLowerCase());
  const existing = index >= 0 ? store.suggestions[index] : null;
  const saved: VillageAffectationSuggestion = {
    id,
    numeroVilla,
    matricule,
    nom: (data.nom ?? existing?.nom ?? '').trim(),
    commentaire: (data.commentaire ?? existing?.commentaire ?? '').trim(),
    createdAt: existing?.createdAt || nowDisplay(),
  };
  if (index >= 0) store.suggestions[index] = saved;
  else store.suggestions.push(saved);
  await writeJsonFile(DURABLE_VILLAGE_AFFECTATION_SUGGESTIONS_KEY, suggestionsPath(), store);
  return saved;
}

export async function deleteAffectationSuggestion(id: string): Promise<boolean> {
  await ensureMigrated();
  const key = id.trim().toLowerCase();
  if (!key) return false;
  const store = await readSuggestionsStore();
  const next = store.suggestions.filter((item) => item.id.toLowerCase() !== key);
  if (next.length === store.suggestions.length) return false;
  await writeJsonFile(DURABLE_VILLAGE_AFFECTATION_SUGGESTIONS_KEY, suggestionsPath(), { suggestions: next });
  return true;
}

export function buildVillageSuggestionRecordId(): string {
  return randomUUID();
}
