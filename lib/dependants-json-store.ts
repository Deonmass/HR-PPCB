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
import type { Employee } from './types';
import {
  applyAllFamilyCompositions,
  buildDashboardFromDependants,
  computeDependantAge,
  computeFamilyCompositionCounts,
  familyGroupKey,
  formatDependantBirthDateDisplay,
  isConjointEmployeStatut,
  isEmployeeStatut,
  isSpouseStatut,
  resolveDependantAge,
} from './dependants-utils';
import { normalizePersonName } from './dependants-pactilis-compare';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import { getEmployeesRecordIndex, readEmployeesBundle } from './employees-json-store';

const CONJOINT_EMPLOYE_STATUT = 'Conjoint employé';

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
  const familyKey = familyGroupKey(record);
  const familyHead = employeesByMatricule.get(familyKey);
  return {
    id: record.id,
    matricule: record.matricule,
    ownMatricule: record.ownMatricule?.trim() || undefined,
    familyMatricule: record.familyMatricule?.trim() || undefined,
    pactilis: record.pactilis,
    statut: record.statut,
    sexe: record.sexe,
    nom: record.nom,
    localisation: record.localisation,
    numeroVilla: record.numeroVilla,
    typeMaison: record.typeMaison,
    dateNaissance: record.dateNaissance,
    age: resolveDependantAge(record.age, record.dateNaissance),
    compositionFamille: record.compositionFamille,
    enfants: record.enfants,
    total: record.total,
    commentaires: record.commentaires,
    lienDocument: record.lienDocument,
    employeNom: familyHead?.nom ?? '',
    departement: familyHead?.departement ?? '',
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

function employeeGenderToSexe(gender: string): string {
  const g = gender.trim().toUpperCase();
  if (g.startsWith('F')) return 'F';
  if (g.startsWith('M') || g.startsWith('H')) return 'M';
  return '';
}

function applyEmployeeIdentityToDependant(
  row: DependantRecord,
  employee: Employee,
  employeeId: string,
  now: string,
): void {
  row.employeeId = employeeId || row.employeeId;
  row.nom = employee.nom.trim() || row.nom;
  const sexe = employeeGenderToSexe(employee.gender || '');
  if (sexe) row.sexe = sexe;
  if ((employee.localisation || '').trim()) row.localisation = employee.localisation.trim();
  const dob = formatDependantBirthDateDisplay(employee.dateOfBirth);
  if (dob) {
    row.dateNaissance = dob;
    row.age = employee.age ?? computeDependantAge(dob);
  } else if (employee.age != null) {
    row.age = employee.age;
  }
  row.updatedAt = now;
}

function syncFamilyCounts(records: DependantRecord[], familyMatricule: string): void {
  const key = familyMatricule.trim();
  if (!key) return;
  const family = records.filter((item) => familyGroupKey(item) === key);
  const counts = computeFamilyCompositionCounts(family.map((item) => ({ statut: item.statut })));
  for (const item of family) {
    if (!isEmployeeStatut(item.statut)) continue;
    item.compositionFamille = counts.compositionFamille;
    item.enfants = counts.enfants;
    item.total = counts.total;
  }
}

/**
 * Migre l’ancien modèle inversé (matricule=soi, familyMatricule=mari)
 * → matricule=mari, ownMatricule=soi.
 */
function migrateInvertedConjointModel(store: DependantsJsonStoreData): number {
  const now = new Date().toISOString();
  let changed = 0;
  for (const row of store.dependants) {
    const legacyFamily = String(row.familyMatricule ?? '').trim();
    if (!legacyFamily) continue;
    if (!isSpouseStatut(row.statut) && !isConjointEmployeStatut(row.statut)) {
      delete row.familyMatricule;
      changed += 1;
      continue;
    }
    const own = row.matricule.trim();
    if (own && own !== legacyFamily) {
      row.ownMatricule = row.ownMatricule?.trim() || own;
    }
    row.matricule = legacyFamily;
    delete row.familyMatricule;
    if (row.ownMatricule) row.statut = CONJOINT_EMPLOYE_STATUT;
    row.updatedAt = now;
    changed += 1;
  }
  return changed;
}

/**
 * Couple mari+femme tous deux employés :
 * - reste sous le bloc du mari (matricule = mari)
 * - ownMatricule = matricule de la femme
 * - statut = Conjoint employé
 * Si la femme n’est plus dans l’effectif : redescend en Conjoint sans ownMatricule.
 */
async function syncConjointEmployeLinks(store: DependantsJsonStoreData): Promise<number> {
  const { employees } = await readEmployeesBundle();
  const recordIndex = await getEmployeesRecordIndex();

  const byName = new Map<string, { matricule: string; nom: string }>();
  for (const emp of employees) {
    const key = normalizePersonName(emp.nom);
    if (!key || byName.has(key)) continue;
    byName.set(key, { matricule: emp.matricule, nom: emp.nom });
  }

  const employeeMats = new Set(employees.map((e) => e.matricule.trim()).filter(Boolean));
  const now = new Date().toISOString();
  let changed = 0;
  const touchedFamilies = new Set<string>();

  for (const row of store.dependants) {
    if (!isSpouseStatut(row.statut)) continue;

    const familyKey = familyGroupKey(row);
    if (!familyKey) continue;

    const nameKey = normalizePersonName(row.nom);
    const match = nameKey ? byName.get(nameKey) : undefined;

    // Femme aussi employée (matricule différent du mari) → Conjoint employé sous le mari.
    if (match && match.matricule.trim() !== familyKey) {
      const head = recordIndex.activeByMatricule.get(familyKey)
        ?? recordIndex.exitByMatricule.get(familyKey);
      const nextOwn = match.matricule.trim();
      const already =
        isConjointEmployeStatut(row.statut)
        && (row.ownMatricule || '').trim() === nextOwn
        && row.matricule.trim() === familyKey
        && !row.familyMatricule;

      if (!already) {
        row.matricule = familyKey;
        row.ownMatricule = nextOwn;
        row.statut = CONJOINT_EMPLOYE_STATUT;
        if (head) row.employeeId = head.id;
        delete row.familyMatricule;
        row.nom = match.nom || row.nom;
        row.updatedAt = now;
        changed += 1;
        touchedFamilies.add(familyKey);
      }
      continue;
    }

    // Plus d’employé correspondant : redescendre en conjoint simple.
    const own = (row.ownMatricule || '').trim();
    const shouldDemote =
      (isConjointEmployeStatut(row.statut) || Boolean(own))
      && (!match || (Boolean(own) && !employeeMats.has(own)));

    if (shouldDemote) {
      row.statut = 'Conjoint';
      delete row.ownMatricule;
      delete row.familyMatricule;
      row.matricule = familyKey;
      const head = recordIndex.activeByMatricule.get(familyKey)
        ?? recordIndex.exitByMatricule.get(familyKey);
      if (head) row.employeeId = head.id;
      row.updatedAt = now;
      changed += 1;
      touchedFamilies.add(familyKey);
    }
  }

  for (const key of touchedFamilies) syncFamilyCounts(store.dependants, key);
  return changed;
}

/**
 * Ré-attache un conjoint orphelin (matricule = son propre mat employé, hors bloc mari)
 * sous une famille Employé sans conjoint, de préférence avec enfants du même nom de famille.
 */
function reattachOrphanConjointEmployes(store: DependantsJsonStoreData): number {
  const now = new Date().toISOString();
  let changed = 0;

  const byFamily = new Map<string, DependantRecord[]>();
  for (const row of store.dependants) {
    const key = String(row.matricule || '').trim();
    if (!key) continue;
    const list = byFamily.get(key) ?? [];
    list.push(row);
    byFamily.set(key, list);
  }

  for (const row of store.dependants) {
    if (!isSpouseStatut(row.statut)) continue;

    const own = (row.ownMatricule || '').trim();
    const mat = row.matricule.trim();
    const legacyFamily = String(row.familyMatricule ?? '').trim();

    // Orphelin = matricule égal au propre (employé), pas encore sous un mari.
    const isOrphan =
      Boolean(own && mat === own)
      || (isConjointEmployeStatut(row.statut) && !legacyFamily && !own && Boolean(mat));
    if (!isOrphan && !(isConjointEmployeStatut(row.statut) && mat && !legacyFamily && !own)) {
      continue;
    }

    const ownMat = own || mat;
    if (!ownMat) continue;
    // Déjà sous un autre chef
    if (mat && mat !== ownMat) continue;

    const orphanTokens = new Set(
      normalizePersonName(row.nom).split(' ').filter((t) => t.length >= 3),
    );

    let bestFamily: string | null = null;
    let bestScore = -1;

    for (const [familyKey, members] of byFamily) {
      if (familyKey === ownMat) continue;
      const head = members.find((m) => isEmployeeStatut(m.statut));
      if (!head) continue;
      if (members.some((m) => m.id !== row.id && isSpouseStatut(m.statut))) continue;

      const headTokens = normalizePersonName(head.nom).split(' ').filter((t) => t.length >= 3);
      const children = members.filter((m) => /enfant/i.test(m.statut));
      let score = 0;
      if (children.length > 0) score += 2;
      if (children.some((c) => {
        const tokens = normalizePersonName(c.nom).split(' ');
        return tokens.some((t) => headTokens.includes(t));
      })) score += 3;
      // Bonus faible si le sexe du chef est M (convention : bloc sous le mari)
      if (/^m$/i.test(head.sexe || '')) score += 1;
      void orphanTokens;

      if (score > bestScore) {
        bestScore = score;
        bestFamily = familyKey;
      }
    }

    if (!bestFamily || bestScore < 2) continue;

    row.ownMatricule = ownMat;
    row.matricule = bestFamily;
    delete row.familyMatricule;
    row.statut = CONJOINT_EMPLOYE_STATUT;
    row.updatedAt = now;
    changed += 1;
    syncFamilyCounts(store.dependants, bestFamily);
  }

  return changed;
}

/** Agents actifs sans ligne Dépendants : crée la ligne Employé (ou rattache un conjoint déjà listé). */
async function seedMissingEmployeeDependants(store: DependantsJsonStoreData): Promise<number> {
  const { employees } = await readEmployeesBundle();
  const recordIndex = await getEmployeesRecordIndex();
  const covered = new Set<string>();
  for (const row of store.dependants) {
    if (isEmployeeStatut(row.statut)) covered.add(row.matricule.trim());
    const own = (row.ownMatricule || '').trim();
    if (own) covered.add(own);
  }

  const now = new Date().toISOString();
  let added = 0;
  const touched = new Set<string>();

  for (const emp of employees) {
    const mat = emp.matricule.trim();
    const nom = emp.nom.trim();
    if (!mat || !nom || covered.has(mat)) continue;
    const rec = recordIndex.activeByMatricule.get(mat);
    if (!rec) continue;

    const nameKey = normalizePersonName(nom);
    const spouse = nameKey
      ? store.dependants.find(
          (row) =>
            isSpouseStatut(row.statut)
            && familyGroupKey(row) !== mat
            && normalizePersonName(row.nom) === nameKey,
        )
      : undefined;

    if (spouse) {
      applyEmployeeIdentityToDependant(spouse, emp, rec.id, now);
      spouse.ownMatricule = mat;
      spouse.statut = CONJOINT_EMPLOYE_STATUT;
      covered.add(mat);
      touched.add(familyGroupKey(spouse));
      added += 1;
      continue;
    }

    store.dependants.push({
      id: nextDependantId(store.dependants),
      employeeId: rec.id,
      matricule: mat,
      pactilis: '',
      statut: 'Employé',
      sexe: employeeGenderToSexe(emp.gender || ''),
      nom,
      localisation: (emp.localisation || '').trim(),
      numeroVilla: '',
      typeMaison: '',
      dateNaissance: formatDependantBirthDateDisplay(emp.dateOfBirth),
      age: emp.age ?? computeDependantAge(emp.dateOfBirth),
      compositionFamille: 0,
      enfants: 0,
      total: 1,
      commentaires: '',
      lienDocument: '',
      createdAt: now,
      updatedAt: now,
    });
    covered.add(mat);
    touched.add(mat);
    added += 1;
  }

  for (const key of touched) syncFamilyCounts(store.dependants, key);
  return added;
}

export async function readDependantsData(): Promise<DependantsData> {
  await ensureMigrated();
  const store = await readStore();
  let dirty = 0;
  dirty += migrateInvertedConjointModel(store);
  dirty += reattachOrphanConjointEmployes(store);
  dirty += await syncConjointEmployeLinks(store);
  dirty += await seedMissingEmployeeDependants(store);
  if (dirty > 0) await writeStore(store);

  const people = await readPeopleIndex();
  const enriched = store.dependants.map((item) => enrichRecord(item, people));
  // Actif selon le chef de famille (matricule famille), pas le ownMatricule.
  const active = applyAllFamilyCompositions(
    enriched.filter((item) => !people.get(familyGroupKey(item))?.isExit),
  );
  const exited = applyAllFamilyCompositions(
    enriched.filter((item) => Boolean(people.get(familyGroupKey(item))?.isExit)),
  );
  return {
    dependants: active,
    exitedDependants: exited,
    dashboard: buildDashboardFromDependants(active),
  };
}

/**
 * À l’ajout / mise à jour d’un agent : crée ou actualise sa ligne dans Dépendants.
 * Si la personne est déjà un conjoint d’un autre agent, elle reste sous cette famille
 * (Conjoint employé) — on ne crée pas un second chef de famille.
 */
export async function ensureEmployeeInDependants(
  employee: Employee,
  employeeId: string,
): Promise<void> {
  await ensureMigrated();
  const mat = employee.matricule.trim();
  const nom = employee.nom.trim();
  if (!mat || !nom) return;

  const store = await readStore();
  const now = new Date().toISOString();
  const nameKey = normalizePersonName(nom);

  const existingHead = store.dependants.find(
    (row) => isEmployeeStatut(row.statut) && row.matricule.trim() === mat,
  );
  if (existingHead) {
    applyEmployeeIdentityToDependant(existingHead, employee, employeeId, now);
    if (!existingHead.matricule.trim()) existingHead.matricule = mat;
    syncFamilyCounts(store.dependants, familyGroupKey(existingHead));
    await writeStore(store);
    return;
  }

  const existingAsOwn = store.dependants.find(
    (row) => (row.ownMatricule || '').trim() === mat,
  );
  const existingSpouseByName = nameKey
    ? store.dependants.find(
        (row) =>
          isSpouseStatut(row.statut)
          && familyGroupKey(row) !== mat
          && normalizePersonName(row.nom) === nameKey,
      )
    : undefined;
  const linked = existingAsOwn || existingSpouseByName;
  if (linked) {
    applyEmployeeIdentityToDependant(linked, employee, employeeId, now);
    if (isSpouseStatut(linked.statut) && familyGroupKey(linked) !== mat) {
      linked.ownMatricule = mat;
      linked.statut = CONJOINT_EMPLOYE_STATUT;
    }
    syncFamilyCounts(store.dependants, familyGroupKey(linked));
    await writeStore(store);
    return;
  }

  const record: DependantRecord = {
    id: nextDependantId(store.dependants),
    employeeId,
    matricule: mat,
    pactilis: '',
    statut: 'Employé',
    sexe: employeeGenderToSexe(employee.gender || ''),
    nom,
    localisation: (employee.localisation || '').trim(),
    numeroVilla: '',
    typeMaison: '',
    dateNaissance: formatDependantBirthDateDisplay(employee.dateOfBirth),
    age: employee.age ?? computeDependantAge(employee.dateOfBirth),
    compositionFamille: 0,
    enfants: 0,
    total: 1,
    commentaires: '',
    lienDocument: '',
    createdAt: now,
    updatedAt: now,
  };
  store.dependants.push(record);
  syncFamilyCounts(store.dependants, mat);
  await writeStore(store);
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
    ownMatricule: data.ownMatricule?.trim() || undefined,
    pactilis: data.pactilis,
    statut: data.statut,
    sexe: data.sexe,
    nom: data.nom,
    localisation: data.localisation,
    numeroVilla: data.numeroVilla,
    typeMaison: data.typeMaison,
    dateNaissance: formatDependantBirthDateDisplay(data.dateNaissance),
    age: data.age ?? computeDependantAge(data.dateNaissance),
    compositionFamille: data.compositionFamille ?? null,
    enfants: data.enfants ?? null,
    total: data.total ?? null,
    commentaires: data.commentaires,
    lienDocument: data.lienDocument,
    createdAt: now,
    updatedAt: now,
  };
  store.dependants.push(record);
  syncFamilyCounts(store.dependants, familyGroupKey(record));
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
  const previousFamilyKey = familyGroupKey(store.dependants[index]);
  const previousLocalisation = store.dependants[index].localisation;
  const now = new Date().toISOString();
  const ownMatricule = data.ownMatricule?.trim() || undefined;
  store.dependants[index] = {
    ...store.dependants[index],
    employeeId: employee.id,
    matricule: data.matricule,
    ownMatricule,
    familyMatricule: undefined,
    pactilis: data.pactilis,
    statut: data.statut,
    sexe: data.sexe,
    nom: data.nom,
    localisation: data.localisation,
    numeroVilla: data.numeroVilla,
    typeMaison: data.typeMaison,
    dateNaissance: formatDependantBirthDateDisplay(data.dateNaissance),
    age: data.age ?? computeDependantAge(data.dateNaissance),
    compositionFamille: data.compositionFamille ?? null,
    enfants: data.enfants ?? null,
    total: data.total ?? null,
    commentaires: data.commentaires,
    lienDocument: data.lienDocument,
    updatedAt: now,
  };
  delete store.dependants[index].familyMatricule;
  const nextFamilyKey = familyGroupKey(store.dependants[index]);
  syncFamilyCounts(store.dependants, previousFamilyKey);
  syncFamilyCounts(store.dependants, previousMatricule);
  syncFamilyCounts(store.dependants, nextFamilyKey);
  syncFamilyCounts(store.dependants, data.matricule);
  await writeStore(store);
  const saved = enrichRecord(store.dependants[index], people);

  if (
    isEmployeeStatut(saved.statut) &&
    (previousLocalisation || '').trim() !== (saved.localisation || '').trim() &&
    saved.localisation.trim()
  ) {
    const { setEmployeeLocalisationOnly } = await import('./employees-json-store');
    await setEmployeeLocalisationOnly(saved.matricule, saved.localisation);
  }

  return saved;
}

export async function deleteDependant(id: number): Promise<boolean> {
  await ensureMigrated();
  const store = await readStore();
  const index = store.dependants.findIndex((item) => item.id === id);
  if (index < 0) return false;
  const familyKey = familyGroupKey(store.dependants[index]);
  const matricule = store.dependants[index].matricule;
  store.dependants.splice(index, 1);
  syncFamilyCounts(store.dependants, familyKey);
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
  syncFamilyCounts(store.dependants, familyGroupKey(record));
  await writeStore(store);
  return enrichRecord(record, people);
}

export async function removeDependantsByMatricule(matricule: string): Promise<number> {
  await ensureMigrated();
  const store = await readStore();
  const mat = matricule.trim();
  const before = store.dependants.length;
  // Supprime la ligne propre (matricule) et les membres ancrés à cette famille (familyMatricule).
  store.dependants = store.dependants.filter((item) => {
    if (item.matricule === mat) return false;
    if (familyGroupKey(item) === mat) return false;
    return true;
  });
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
  const nextLoc = localisation.trim();
  const key = matricule.trim();
  const updated = store.dependants
    .filter((item) => familyGroupKey(item) === key)
    .map((item) => {
      item.localisation = nextLoc;
      item.updatedAt = now;
      return enrichRecord(item, people);
    });
  if (!updated.length) throw new Error('Aucune famille trouvée pour ce matricule');
  await writeStore(store);
  if (nextLoc) {
    const { setEmployeeLocalisationOnly } = await import('./employees-json-store');
    await setEmployeeLocalisationOnly(matricule, nextLoc);
  }
  return updated;
}

/** Aligne toute la famille dépendants sur la localisation employé (sans reboucler). */
export async function syncFamilyLocalisationFromEmployee(
  matricule: string,
  localisation: string,
): Promise<number> {
  await ensureMigrated();
  const nextLoc = localisation.trim();
  if (!matricule.trim() || !nextLoc) return 0;
  const store = await readStore();
  const now = new Date().toISOString();
  const key = matricule.trim();
  let changed = 0;
  for (const item of store.dependants) {
    if (familyGroupKey(item) !== key) continue;
    if ((item.localisation || '').trim() === nextLoc) continue;
    item.localisation = nextLoc;
    item.updatedAt = now;
    changed += 1;
  }
  if (changed > 0) await writeStore(store);
  return changed;
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
    const family = store.dependants.filter((row) => familyGroupKey(row) === item.matricule.trim());
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
    const { setEmployeeLocalisationOnly } = await import('./employees-json-store');
    for (const item of items) {
      if (item.setLocalisationZamba === false || !item.numeroVilla) continue;
      await setEmployeeLocalisationOnly(item.matricule, 'Zamba');
    }
  }
  return updated;
}
