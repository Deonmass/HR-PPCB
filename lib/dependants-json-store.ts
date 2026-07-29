import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_DEPENDANTS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import type { DependantsJsonStoreData, DependantRecord } from './dependants-json-types';
import type { Dependant, DependantFormData, DependantsData } from './dependants-types';
import {
  applyAllFamilyCompositions,
  buildDashboardFromDependants,
  computeFamilyCompositionCounts,
  isEmployeeStatut,
} from './dependants-utils';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import { getEmployeesRecordIndex, readEmployeesBundle } from './employees-json-store';

function resolveStorePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'dependants', 'dependants.json');
  }
  const writable = path.join(getWritableDataRoot(), 'dependants', 'dependants.json');
  const bundled = path.join(process.cwd(), 'data', 'dependants', 'dependants.json');
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

async function readStore(): Promise<DependantsJsonStoreData> {
  const storePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_DEPENDANTS_KEY, storePath);
  try {
    const raw = await fsPromises.readFile(storePath, 'utf8');
    return JSON.parse(raw) as DependantsJsonStoreData;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { dependants: [] };
    throw err;
  }
}

async function writeStore(data: DependantsJsonStoreData): Promise<void> {
  const storePath = resolveStorePath();
  await fsPromises.mkdir(path.dirname(storePath), { recursive: true });
  await fsPromises.writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_DEPENDANTS_KEY, storePath);
}

async function ensureMigrated(): Promise<void> {
  const storePath = resolveStorePath();
  const exists = await fsPromises.access(storePath).then(() => true).catch(() => false);
  if (exists) return;

  try {
  const [{ readDependantsData }, recordIndex] = await Promise.all([
    import('./dependants-excel-legacy'),
    getEmployeesRecordIndex(),
  ]);
  const legacy = await readDependantsData();
  const now = new Date().toISOString();
  const byMatricule = new Map<string, string>([
    ...recordIndex.activeByMatricule.values(),
    ...recordIndex.exitByMatricule.values(),
  ].map((item) => [item.matricule, item.id]));

  const dependants = [...legacy.dependants, ...legacy.exitedDependants]
    .flatMap<DependantRecord>((item) => {
      const employeeId = byMatricule.get(item.matricule);
      if (!employeeId) return [];
      return [{
        id: item.id,
        employeeId,
        matricule: item.matricule,
        pactilis: item.pactilis,
        statut: item.statut,
        sexe: item.sexe,
        nom: item.nom,
        localisation: item.localisation,
        numeroVilla: item.numeroVilla,
        typeMaison: item.typeMaison,
        dateNaissance: item.dateNaissance,
        age: item.age ?? null,
        compositionFamille: item.compositionFamille ?? null,
        enfants: item.enfants ?? null,
        total: item.total ?? null,
        commentaires: item.commentaires,
        lienDocument: item.lienDocument,
        createdAt: now,
        updatedAt: now,
      }];
    });

  await writeStore({ dependants });
  } catch {
    await writeStore({ dependants: [] });
  }
}

function enrichRecord(
  record: DependantRecord,
  employeesByMatricule: Map<string, { nom: string; departement: string }>,
): Dependant {
  const employee = employeesByMatricule.get(record.matricule);
  return {
    id: record.id,
    matricule: record.matricule,
    pactilis: record.pactilis,
    statut: record.statut,
    sexe: record.sexe,
    nom: record.nom,
    localisation: record.localisation,
    numeroVilla: record.numeroVilla,
    typeMaison: record.typeMaison,
    dateNaissance: record.dateNaissance,
    age: record.age,
    compositionFamille: record.compositionFamille,
    enfants: record.enfants,
    total: record.total,
    commentaires: record.commentaires,
    lienDocument: record.lienDocument,
    employeNom: employee?.nom ?? '',
    departement: employee?.departement ?? '',
  };
}

async function readPeopleIndex(): Promise<Map<string, { nom: string; departement: string; isExit: boolean }>> {
  const { employees, exits } = await readEmployeesBundle();
  const map = new Map<string, { nom: string; departement: string; isExit: boolean }>();
  for (const item of employees) {
    map.set(item.matricule, { nom: item.nom, departement: item.departement, isExit: false });
  }
  for (const item of exits) {
    map.set(item.matricule, { nom: item.nom, departement: item.departement, isExit: true });
  }
  return map;
}

function nextDependantId(records: DependantRecord[]): number {
  return records.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function syncFamilyCounts(records: DependantRecord[], matricule: string): void {
  const family = records.filter((item) => item.matricule === matricule);
  const counts = computeFamilyCompositionCounts(family.map((item) => ({ statut: item.statut })));
  for (const item of family) {
    if (!isEmployeeStatut(item.statut)) continue;
    item.compositionFamille = counts.compositionFamille;
    item.enfants = counts.enfants;
    item.total = counts.total;
  }
}

export async function readDependantsData(): Promise<DependantsData> {
  await ensureMigrated();
  const [store, people] = await Promise.all([readStore(), readPeopleIndex()]);
  const enriched = store.dependants.map((item) => enrichRecord(item, people));
  const active = applyAllFamilyCompositions(enriched.filter((item) => !people.get(item.matricule)?.isExit));
  const exited = applyAllFamilyCompositions(enriched.filter((item) => people.get(item.matricule)?.isExit));
  return {
    dependants: active,
    exitedDependants: exited,
    dashboard: buildDashboardFromDependants(active),
  };
}

export async function createDependant(data: DependantFormData): Promise<Dependant> {
  await ensureMigrated();
  const [store, records, people] = await Promise.all([readStore(), getEmployeesRecordIndex(), readPeopleIndex()]);
  const employee = records.activeByMatricule.get(data.matricule) ?? records.exitByMatricule.get(data.matricule);
  if (!employee) throw new Error('Employé introuvable');
  const now = new Date().toISOString();
  const record: DependantRecord = {
    id: nextDependantId(store.dependants),
    employeeId: employee.id,
    matricule: data.matricule,
    pactilis: data.pactilis,
    statut: data.statut,
    sexe: data.sexe,
    nom: data.nom,
    localisation: data.localisation,
    numeroVilla: data.numeroVilla,
    typeMaison: data.typeMaison,
    dateNaissance: data.dateNaissance,
    age: data.age ?? null,
    compositionFamille: data.compositionFamille ?? null,
    enfants: data.enfants ?? null,
    total: data.total ?? null,
    commentaires: data.commentaires,
    lienDocument: data.lienDocument,
    createdAt: now,
    updatedAt: now,
  };
  store.dependants.push(record);
  syncFamilyCounts(store.dependants, record.matricule);
  await writeStore(store);
  return enrichRecord(record, people);
}

export async function updateDependant(id: number, data: DependantFormData): Promise<Dependant> {
  await ensureMigrated();
  const [store, records, people] = await Promise.all([readStore(), getEmployeesRecordIndex(), readPeopleIndex()]);
  const index = store.dependants.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Bénéficiaire introuvable');
  const employee = records.activeByMatricule.get(data.matricule) ?? records.exitByMatricule.get(data.matricule);
  if (!employee) throw new Error('Employé introuvable');
  const previousMatricule = store.dependants[index].matricule;
  const now = new Date().toISOString();
  store.dependants[index] = {
    ...store.dependants[index],
    employeeId: employee.id,
    matricule: data.matricule,
    pactilis: data.pactilis,
    statut: data.statut,
    sexe: data.sexe,
    nom: data.nom,
    localisation: data.localisation,
    numeroVilla: data.numeroVilla,
    typeMaison: data.typeMaison,
    dateNaissance: data.dateNaissance,
    age: data.age ?? null,
    compositionFamille: data.compositionFamille ?? null,
    enfants: data.enfants ?? null,
    total: data.total ?? null,
    commentaires: data.commentaires,
    lienDocument: data.lienDocument,
    updatedAt: now,
  };
  syncFamilyCounts(store.dependants, previousMatricule);
  syncFamilyCounts(store.dependants, data.matricule);
  await writeStore(store);
  return enrichRecord(store.dependants[index], people);
}

export async function deleteDependant(id: number): Promise<boolean> {
  await ensureMigrated();
  const store = await readStore();
  const index = store.dependants.findIndex((item) => item.id === id);
  if (index < 0) return false;
  const matricule = store.dependants[index].matricule;
  store.dependants.splice(index, 1);
  syncFamilyCounts(store.dependants, matricule);
  await writeStore(store);
  return true;
}

export async function getDependantRecord(id: number): Promise<DependantRecord | null> {
  await ensureMigrated();
  const store = await readStore();
  return store.dependants.find((item) => item.id === id) ?? null;
}

/** Restore / upsert a dependant record snapshot (audit undo). */
export async function restoreDependant(snapshot: DependantRecord): Promise<Dependant> {
  await ensureMigrated();
  const [store, people] = await Promise.all([readStore(), readPeopleIndex()]);
  const record: DependantRecord = {
    ...snapshot,
    id: Number(snapshot.id),
    updatedAt: new Date().toISOString(),
    createdAt: snapshot.createdAt || new Date().toISOString(),
  };
  if (!Number.isFinite(record.id)) throw new Error('Identifiant dépendant invalide');
  const index = store.dependants.findIndex((item) => item.id === record.id);
  if (index >= 0) store.dependants[index] = { ...store.dependants[index], ...record };
  else store.dependants.push(record);
  syncFamilyCounts(store.dependants, record.matricule);
  await writeStore(store);
  return enrichRecord(record, people);
}

export async function removeDependantsByMatricule(matricule: string): Promise<number> {
  await ensureMigrated();
  const store = await readStore();
  const before = store.dependants.length;
  store.dependants = store.dependants.filter((item) => item.matricule !== matricule);
  const removed = before - store.dependants.length;
  if (removed > 0) {
    await writeStore(store);
  }
  return removed;
}

export async function updateFamilyLocalisation(matricule: string, localisation: string): Promise<Dependant[]> {
  await ensureMigrated();
  const [store, people] = await Promise.all([readStore(), readPeopleIndex()]);
  const now = new Date().toISOString();
  const updated = store.dependants
    .filter((item) => item.matricule === matricule)
    .map((item) => {
      item.localisation = localisation;
      item.updatedAt = now;
      return enrichRecord(item, people);
    });
  if (!updated.length) throw new Error('Aucune famille trouvée pour ce matricule');
  await writeStore(store);
  return updated;
}

export async function assignEmployeeMaison(params: {
  matricule: string;
  numeroVilla: string;
  typeMaison?: string;
  setLocalisationZamba?: boolean;
}): Promise<Dependant> {
  const results = await assignManyEmployeeMaisons([params]);
  const first = results[0];
  if (!first) throw new Error('Affectation impossible');
  return first;
}

export async function assignManyEmployeeMaisons(
  items: Array<{
    matricule: string;
    numeroVilla: string;
    typeMaison?: string;
    setLocalisationZamba?: boolean;
  }>,
): Promise<Dependant[]> {
  await ensureMigrated();
  const [store, people] = await Promise.all([readStore(), readPeopleIndex()]);
  const updated: Dependant[] = [];
  const now = new Date().toISOString();

  for (const item of items) {
    const family = store.dependants.filter((row) => row.matricule === item.matricule);
    if (!family.length) continue;
    for (const row of family) {
      row.numeroVilla = item.numeroVilla;
      row.typeMaison = item.typeMaison?.trim() || '';
      if (item.setLocalisationZamba !== false && item.numeroVilla) {
        row.localisation = 'Zamba';
      }
      row.updatedAt = now;
    }
    const employeeRow = family.find((row) => isEmployeeStatut(row.statut)) ?? family[0];
    updated.push(enrichRecord(employeeRow, people));
  }

  if (updated.length) {
    await writeStore(store);
  }
  return updated;
}
