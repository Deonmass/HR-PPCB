import 'server-only';

import {
  comparePactilisWithLocal,
  groupPactilisFamilies,
  mapPactilisStatut,
  normalizePersonName,
  normalizePactilisKey,
  parsePactilisExtractBuffer,
  type PactilisCompareResult,
  type PactilisPerson,
} from '@/lib/dependants-pactilis-compare';
import { createDependant, readDependantsData, updateDependant } from '@/lib/dependants-store';
import type { Dependant, DependantFormData } from '@/lib/dependants-types';
import { isEmployeeStatut } from '@/lib/dependants-utils';

export interface PactilisConsolidateResult {
  created: number;
  updatedPactilis: number;
  skippedDuplicates: number;
  skippedNoMatricule: number;
  skipped: Array<{ nom: string; reason: string }>;
  compare: PactilisCompareResult;
}

function emptyForm(partial: Partial<DependantFormData> & Pick<DependantFormData, 'matricule' | 'nom' | 'statut'>): DependantFormData {
  return {
    matricule: partial.matricule,
    pactilis: partial.pactilis ?? '',
    statut: partial.statut,
    sexe: partial.sexe ?? '',
    nom: partial.nom,
    localisation: partial.localisation ?? '',
    dateNaissance: partial.dateNaissance ?? '',
    compositionFamille: partial.compositionFamille ?? null,
    enfants: partial.enfants ?? null,
    total: partial.total ?? null,
    commentaires: partial.commentaires ?? '',
    lienDocument: partial.lienDocument ?? '',
    numeroVilla: partial.numeroVilla ?? '',
    typeMaison: partial.typeMaison ?? '',
  };
}

function findLocalByName(dependants: Dependant[], nom: string): Dependant | undefined {
  const key = normalizePersonName(nom);
  if (!key) return undefined;
  return dependants.find((d) => normalizePersonName(d.nom) === key);
}

function findEmployeeMatriculeByName(
  dependants: Dependant[],
  nom: string,
): string {
  const key = normalizePersonName(nom);
  if (!key) return '';
  // Employé déjà en DEPENDANTS
  const asDep = dependants.find(
    (d) => isEmployeeStatut(d.statut) && normalizePersonName(d.nom) === key,
  );
  if (asDep?.matricule) return asDep.matricule;
  // Sinon via enrichissement employeNom (même famille)
  const byEmployeNom = dependants.find(
    (d) => normalizePersonName(d.employeNom) === key && d.matricule,
  );
  return byEmployeNom?.matricule ?? '';
}

function buildAssureMatriculeMap(
  people: PactilisPerson[],
  dependants: Dependant[],
): Map<string, string> {
  /** clé = index famille ou pactilis assuré → matricule RH */
  const map = new Map<string, string>();
  const families = groupPactilisFamilies(people);

  for (let fi = 0; fi < families.length; fi++) {
    const family = families[fi];
    const assure = family.find((p) => /employ/i.test(p.statut)) ?? family[0];
    if (!assure) continue;

    let matricule = '';
    const pKey = normalizePactilisKey(assure.pactilis);
    if (pKey) {
      const byPact = dependants.find(
        (d) => normalizePactilisKey(d.pactilis) === pKey,
      );
      if (byPact) matricule = byPact.matricule;
    }
    if (!matricule) {
      matricule = findEmployeeMatriculeByName(dependants, assure.nom);
    }
    if (!matricule) {
      const localAssure = findLocalByName(dependants, assure.nom);
      if (localAssure) matricule = localAssure.matricule;
    }

    if (matricule) {
      map.set(`F:${fi}`, matricule);
      if (pKey) map.set(`P:${pKey}`, matricule);
      const nKey = normalizePersonName(assure.nom);
      if (nKey) map.set(`N:${nKey}`, matricule);
    }
  }
  return map;
}

function resolveMatriculeForPerson(
  person: PactilisPerson,
  familyIndex: number,
  assureMap: Map<string, string>,
  dependants: Dependant[],
): string {
  const fromFamily = assureMap.get(`F:${familyIndex}`);
  if (fromFamily) return fromFamily;

  const pKey = normalizePactilisKey(person.pactilis);
  if (pKey && assureMap.get(`P:${pKey}`)) return assureMap.get(`P:${pKey}`)!;

  if (/employ/i.test(person.statut)) {
    return findEmployeeMatriculeByName(dependants, person.nom);
  }
  return '';
}

/**
 * Consolide les écarts Pactilis dans la base locale :
 * - affecte le N° Pactilis aux correspondances par nom
 * - crée les absents de la base (sans doublon de nom)
 */
export async function consolidatePactilisIntoLocal(
  buffer: ArrayBuffer | Buffer,
  fileName = '',
): Promise<PactilisConsolidateResult> {
  const people = parsePactilisExtractBuffer(buffer);
  let { dependants } = await readDependantsData();
  let compare = comparePactilisWithLocal(people, dependants, fileName);

  const skipped: Array<{ nom: string; reason: string }> = [];
  let created = 0;
  let updatedPactilis = 0;
  let skippedDuplicates = 0;
  let skippedNoMatricule = 0;

  // 1) Affecter N° Pactilis sur correspondances par nom / manquants
  for (const row of compare.matched) {
    if (!row.needsPactilisAssign || row.localId == null) continue;
    const local = dependants.find((d) => d.id === row.localId);
    if (!local) continue;
    const nextPact = norm(row.pactilisFromFile || row.pactilis);
    if (!nextPact) continue;
    if (normalizePactilisKey(local.pactilis) === normalizePactilisKey(nextPact)) continue;

    await updateDependant(local.id, emptyForm({
      matricule: local.matricule,
      pactilis: nextPact,
      statut: local.statut,
      sexe: local.sexe,
      nom: local.nom,
      localisation: local.localisation,
      dateNaissance: local.dateNaissance,
      compositionFamille: local.compositionFamille,
      enfants: local.enfants,
      total: local.total,
      commentaires: local.commentaires,
      lienDocument: local.lienDocument,
      numeroVilla: local.numeroVilla,
      typeMaison: local.typeMaison,
    }));
    updatedPactilis += 1;
  }

  // Recharger après updates
  ({ dependants } = await readDependantsData());
  compare = comparePactilisWithLocal(people, dependants, fileName);

  const assureMap = buildAssureMatriculeMap(people, dependants);
  const families = groupPactilisFamilies(people);
  const personFamilyIndex = new Map<string, number>();
  families.forEach((family, fi) => {
    for (const p of family) {
      const key = `${normalizePactilisKey(p.pactilis)}|${normalizePersonName(p.nom)}`;
      personFamilyIndex.set(key, fi);
    }
  });

  const localNames = new Set(
    dependants.map((d) => normalizePersonName(d.nom)).filter(Boolean),
  );

  // 2) Créer uniquement les absents (pas de doublon de nom)
  for (const row of compare.onlyInPactilis) {
    const nameKey = normalizePersonName(row.nom);
    if (nameKey && localNames.has(nameKey)) {
      // Doublon de nom : éventuellement affecter le N° Pactilis si vide
      const existing = findLocalByName(dependants, row.nom);
      if (existing && row.pactilis && !normalizePactilisKey(existing.pactilis)) {
        await updateDependant(existing.id, emptyForm({
          matricule: existing.matricule,
          pactilis: row.pactilis,
          statut: existing.statut,
          sexe: existing.sexe || row.sexe,
          nom: existing.nom,
          localisation: existing.localisation,
          dateNaissance: existing.dateNaissance || row.dateNaissance,
          compositionFamille: existing.compositionFamille,
          enfants: existing.enfants,
          total: existing.total,
          commentaires: existing.commentaires,
          lienDocument: existing.lienDocument,
          numeroVilla: existing.numeroVilla,
          typeMaison: existing.typeMaison,
        }));
        updatedPactilis += 1;
        skipped.push({
          nom: row.nom,
          reason: 'Nom déjà présent — N° Pactilis affecté',
        });
      } else {
        skippedDuplicates += 1;
        skipped.push({
          nom: row.nom,
          reason: 'Nom déjà présent dans la base locale (doublon évité)',
        });
      }
      continue;
    }

    const person: PactilisPerson = {
      pactilis: row.pactilis,
      statut: mapPactilisStatut(row.statut),
      sexe: row.sexe,
      nom: row.nom,
      dateNaissance: row.dateNaissance,
      dateEntree: '',
    };
    const famKey = `${normalizePactilisKey(person.pactilis)}|${normalizePersonName(person.nom)}`;
    const fi = personFamilyIndex.get(famKey) ?? -1;
    const matricule = resolveMatriculeForPerson(person, fi, assureMap, dependants);

    if (!matricule) {
      skippedNoMatricule += 1;
      skipped.push({
        nom: row.nom,
        reason: 'Matricule RH introuvable (assuré non lié à un employé local)',
      });
      continue;
    }

    await createDependant(emptyForm({
      matricule,
      pactilis: person.pactilis,
      statut: person.statut === 'Employé' ? 'Employé' : person.statut,
      sexe: person.sexe,
      nom: person.nom,
      dateNaissance: person.dateNaissance,
      localisation: '',
      commentaires: 'Ajouté depuis extract Pactilis',
    }));
    created += 1;
    if (nameKey) localNames.add(nameKey);
  }

  ({ dependants } = await readDependantsData());
  compare = comparePactilisWithLocal(people, dependants, fileName);

  return {
    created,
    updatedPactilis,
    skippedDuplicates,
    skippedNoMatricule,
    skipped,
    compare,
  };
}

function norm(value: unknown): string {
  return String(value ?? '').trim();
}
