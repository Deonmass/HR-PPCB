/** Résolution Situation familiale pour le contrat standard (liste dépendants). */

import { normalizePersonName } from './dependants-pactilis-compare';
import type { Dependant } from './dependants-types';
import {
  familyGroupKey,
  isChildStatut,
  isEmployeeStatut,
  isSpouseStatut,
} from './dependants-utils';

export interface ContratFamilyPerson {
  prenom: string;
  nom: string;
  postNom: string;
}

export interface ContratFamilyChild extends ContratFamilyPerson {
  birthPlaceDate: string;
}

export interface ContratFamilyContext {
  spouse: ContratFamilyPerson | null;
  children: ContratFamilyChild[];
  /** Origine du rattachement famille. */
  matchedAs: 'head' | 'conjoint' | 'enfant' | null;
}

/**
 * Découpe un nom complet style RH DRC : Nom / Post-nom / Prénom.
 * (ex. « KILONDO WOLENG STEPHANE » → nom KILONDO, postNom WOLENG, prenom STEPHANE)
 */
export function splitPersonName(full: string): ContratFamilyPerson {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { prenom: '', nom: '', postNom: '' };
  if (parts.length === 1) return { prenom: '', nom: parts[0], postNom: '' };
  if (parts.length === 2) return { prenom: parts[1], nom: parts[0], postNom: '' };
  return {
    nom: parts[0],
    postNom: parts.slice(1, -1).join(' '),
    prenom: parts[parts.length - 1],
  };
}

/** Assemble Nom / Post-nom / Prénom en une ligne affichable. */
export function joinPersonName(person: {
  prenom?: string | null;
  nom?: string | null;
  postNom?: string | null;
}): string {
  return [person.nom, person.postNom, person.prenom]
    .map((part) => String(part ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

function birthPlaceDateOf(row: Dependant): string {
  const birth = (row.dateNaissance || '').trim();
  const loc = (row.localisation || '').trim();
  // Lieu « Zamba » n'est pas un lieu de naissance — garder seulement la date.
  if (loc && !/^zamba$/i.test(loc) && birth) return `${loc}-${birth}`;
  return birth || loc;
}

function familyByMatricule(dependants: Dependant[], matricule: string): Dependant[] {
  const mat = matricule.trim();
  if (!mat) return [];
  return dependants.filter((d) => familyGroupKey(d) === mat);
}

function childrenOf(family: Dependant[]): ContratFamilyChild[] {
  return family
    .filter((d) => isChildStatut(d.statut))
    .slice(0, 4)
    .map((child) => ({
      ...splitPersonName(child.nom),
      birthPlaceDate: birthPlaceDateOf(child),
    }));
}

function spouseOf(family: Dependant[]): ContratFamilyPerson | null {
  const spouseRow = family.find((d) => isSpouseStatut(d.statut));
  return spouseRow ? splitPersonName(spouseRow.nom) : null;
}

function employeeOf(family: Dependant[]): ContratFamilyPerson | null {
  const emp = family.find((d) => isEmployeeStatut(d.statut));
  if (emp) return splitPersonName(emp.nom);
  // Fallback : nom du chef de famille porté sur les lignes dépendants.
  const withEmployeNom = family.find((d) => (d.employeNom || '').trim());
  return withEmployeNom ? splitPersonName(withEmployeNom.employeNom) : null;
}

/**
 * 1) Famille dont l’agent est le matricule (chef de famille).
 * 2) Sinon, si l’agent figure déjà comme conjoint/enfant dans la liste dépendants,
 *    rattacher la Situation familiale de cette famille.
 */
export function resolveContratFamily(
  dependants: Dependant[],
  employee: { matricule: string; nom: string },
): ContratFamilyContext {
  const empty: ContratFamilyContext = { spouse: null, children: [], matchedAs: null };

  const asHead = familyByMatricule(dependants, employee.matricule);
  const headSpouse = spouseOf(asHead);
  const headChildren = childrenOf(asHead);
  if (headSpouse || headChildren.length > 0) {
    return { spouse: headSpouse, children: headChildren, matchedAs: 'head' };
  }

  const needle = normalizePersonName(employee.nom);
  if (needle.length < 3) return empty;

  const selfRow = dependants.find((d) => {
    if (isEmployeeStatut(d.statut)) return false;
    if (!isSpouseStatut(d.statut) && !isChildStatut(d.statut)) return false;
    return normalizePersonName(d.nom) === needle;
  });
  if (!selfRow) return empty;

  const family = familyByMatricule(dependants, familyGroupKey(selfRow));
  if (family.length === 0) return empty;

  if (isSpouseStatut(selfRow.statut)) {
    return {
      spouse: employeeOf(family),
      children: childrenOf(family),
      matchedAs: 'conjoint',
    };
  }

  // Agent déjà enregistré comme enfant : pas de conjoint, frères/sœurs en personnes à charge.
  const siblings = family
    .filter((d) => isChildStatut(d.statut) && normalizePersonName(d.nom) !== needle)
    .slice(0, 4)
    .map((child) => ({
      ...splitPersonName(child.nom),
      birthPlaceDate: birthPlaceDateOf(child),
    }));
  return {
    spouse: null,
    children: siblings,
    matchedAs: 'enfant',
  };
}

/** Lieu des prestations dans le contrat : Zamba → Kimpese (usine). */
export function formatPrestationLocation(workLocation: string): string {
  const loc = workLocation.trim();
  if (!loc) return '—';
  if (/^zamba$/i.test(loc)) return 'Kimpese (usine)';
  return loc;
}

/** État civil FR pour le document. */
export function formatMaritalStatusFr(
  status: string,
  civility: 'Monsieur' | 'Madame',
): string {
  const raw = status.trim();
  if (!raw) return '—';
  const s = raw.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const female = civility === 'Madame';
  if (/^married$|^marie/.test(s)) return female ? 'Mariée' : 'Marié';
  if (/^single$|^celibat/.test(s)) return 'Célibataire';
  if (/^divor/.test(s)) return female ? 'Divorcée' : 'Divorcé';
  if (/^widow|^veuv/.test(s)) return female ? 'Veuve' : 'Veuf';
  if (/^separe/.test(s)) return female ? 'Séparée' : 'Séparé';
  return raw;
}
