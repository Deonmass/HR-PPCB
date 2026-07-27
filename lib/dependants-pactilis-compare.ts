import * as XLSX from 'xlsx';
import type { Dependant } from './dependants-types';
import { isChildStatut, isEmployeeStatut, isSpouseStatut } from './dependants-utils';

export interface PactilisPerson {
  pactilis: string;
  statut: string;
  sexe: string;
  nom: string;
  dateNaissance: string;
  dateEntree: string;
}

export type PactilisMatchKind = 'pactilis' | 'nom';

export interface PactilisDiffRow {
  source: 'pactilis' | 'locale' | 'matched';
  pactilis: string;
  matricule: string;
  statut: string;
  sexe: string;
  nom: string;
  dateNaissance: string;
  employeNom?: string;
  departement?: string;
  /** Correspondance par N° Pactilis ou par nom. */
  matchKind?: PactilisMatchKind;
  /** Id local (pour mise à jour du N° Pactilis). */
  localId?: number;
  /** Local sans N° Pactilis (ou différent) → à affecter à la consolidation. */
  needsPactilisAssign?: boolean;
  /** N° Pactilis côté extract (si match par nom). */
  pactilisFromFile?: string;
}

export interface PactilisCompareResult {
  fileName: string;
  pactilisCount: number;
  localeCount: number;
  matchedCount: number;
  matched: PactilisDiffRow[];
  onlyInPactilis: PactilisDiffRow[];
  onlyInLocale: PactilisDiffRow[];
  /** Correspondances par nom où le N° Pactilis local manque / diffère. */
  pactilisToAssignCount: number;
}

export function norm(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return norm(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function normalizePactilisKey(value: string): string {
  return norm(value).replace(/^0+/, '').toUpperCase();
}

/** Normalise un nom pour comparaison (sans accents, casse, ponctuation). */
export function normalizePersonName(value: string): string {
  return norm(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Mappe les statuts Pactilis (Assuré…) vers le vocabulaire local. */
export function mapPactilisStatut(statut: string): string {
  const s = norm(statut).toLowerCase();
  if (/assur|employ/.test(s)) return 'Employé';
  if (/conjoint/.test(s)) return 'Conjoint';
  if (/enfant/.test(s)) return 'Enfant';
  return norm(statut) || '—';
}

function statutFamily(statut: string): 'employe' | 'conjoint' | 'enfant' | 'autre' {
  const mapped = mapPactilisStatut(statut);
  if (isEmployeeStatut(mapped) || /employ/i.test(mapped)) return 'employe';
  if (isSpouseStatut(mapped) || /conjoint/i.test(mapped)) return 'conjoint';
  if (isChildStatut(mapped) || /enfant/i.test(mapped)) return 'enfant';
  return 'autre';
}

function excelSerialToDisplay(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return String(value);
    const dd = String(parsed.d).padStart(2, '0');
    const mm = String(parsed.m).padStart(2, '0');
    return `${dd}/${mm}/${parsed.y}`;
  }
  const raw = norm(value);
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return raw;
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = (rows[i] ?? []).map(normalizeHeader);
    if (cells.includes('matricule') && cells.includes('statut') && cells.some((c) => c.includes('nom'))) {
      return i;
    }
  }
  return -1;
}

function colIndex(headers: string[], ...candidates: string[]): number {
  for (const candidate of candidates) {
    const idx = headers.findIndex((h) => h === candidate || h.includes(candidate));
    if (idx >= 0) return idx;
  }
  return -1;
}

/** Parse l'extract Pactilis (feuille type Etat_PPC_ASSURESDEPENDANTS). */
export function parsePactilisExtractBuffer(buffer: ArrayBuffer | Buffer): PactilisPerson[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('Fichier Excel vide');
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  const headerRowIdx = findHeaderRow(rows);
  if (headerRowIdx < 0) {
    throw new Error(
      'En-têtes introuvables. Attendu : Matricule, Statut, Sexe, Nom et Prénoms…',
    );
  }

  const headers = (rows[headerRowIdx] ?? []).map(normalizeHeader);
  const iMat = colIndex(headers, 'matricule');
  const iStatut = colIndex(headers, 'statut');
  const iSexe = colIndex(headers, 'sexe');
  const iNom = colIndex(headers, 'nometprenoms', 'nom');
  const iDob = colIndex(headers, 'datedenaissance', 'datenaissance');
  const iEntree = colIndex(headers, 'datedentree', 'dateentree');

  if (iMat < 0 || iNom < 0) {
    throw new Error('Colonnes Matricule / Nom introuvables dans le fichier Pactilis');
  }

  const out: PactilisPerson[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const pactilis = norm(row[iMat]);
    const nom = norm(row[iNom]);
    if (!pactilis && !nom) continue;
    out.push({
      pactilis,
      statut: mapPactilisStatut(norm(row[iStatut])),
      sexe: norm(row[iSexe]),
      nom,
      dateNaissance: excelSerialToDisplay(row[iDob]),
      dateEntree: excelSerialToDisplay(row[iEntree]),
    });
  }
  return out;
}

/**
 * Groupes famille dans l'extract : un Assuré/Employé ouvre une famille,
 * les Conjoint/Enfant suivants lui appartiennent jusqu'au prochain Assuré.
 */
export function groupPactilisFamilies(people: PactilisPerson[]): PactilisPerson[][] {
  const groups: PactilisPerson[][] = [];
  let current: PactilisPerson[] = [];

  for (const person of people) {
    if (statutFamily(person.statut) === 'employe') {
      if (current.length) groups.push(current);
      current = [person];
    } else {
      if (!current.length) current = [person];
      else current.push(person);
    }
  }
  if (current.length) groups.push(current);
  return groups;
}

function toDiffFromPactilis(person: PactilisPerson): PactilisDiffRow {
  return {
    source: 'pactilis',
    pactilis: person.pactilis,
    matricule: '',
    statut: person.statut,
    sexe: person.sexe,
    nom: person.nom,
    dateNaissance: person.dateNaissance,
  };
}

function toDiffFromLocal(item: Dependant): PactilisDiffRow {
  return {
    source: 'locale',
    pactilis: item.pactilis,
    matricule: item.matricule,
    statut: mapPactilisStatut(item.statut),
    sexe: item.sexe,
    nom: item.nom,
    dateNaissance: item.dateNaissance,
    employeNom: item.employeNom,
    departement: item.departement,
    localId: item.id,
  };
}

function toMatchedRow(
  person: PactilisPerson,
  local: Dependant,
  matchKind: PactilisMatchKind,
): PactilisDiffRow {
  const localPact = normalizePactilisKey(local.pactilis);
  const filePact = normalizePactilisKey(person.pactilis);
  const needsPactilisAssign = Boolean(filePact && !localPact);
  return {
    source: 'matched',
    pactilis: local.pactilis || person.pactilis,
    pactilisFromFile: person.pactilis,
    matricule: local.matricule,
    statut: mapPactilisStatut(local.statut || person.statut),
    sexe: local.sexe || person.sexe,
    nom: local.nom || person.nom,
    dateNaissance: local.dateNaissance || person.dateNaissance,
    employeNom: local.employeNom,
    departement: local.departement,
    matchKind,
    localId: local.id,
    needsPactilisAssign,
  };
}

const sortDiff = (a: PactilisDiffRow, b: PactilisDiffRow) =>
  a.nom.localeCompare(b.nom, 'fr') || a.pactilis.localeCompare(b.pactilis, 'fr');

/**
 * Compare extract Pactilis avec la base locale.
 * 1) correspondance prioritaire sur N° Pactilis
 * 2) sinon correspondance sur le nom (si N° Pactilis absent d'un côté)
 */
export function comparePactilisWithLocal(
  pactilisPeople: PactilisPerson[],
  localDependants: Dependant[],
  fileName = '',
): PactilisCompareResult {
  const usedLocal = new Set<number>();
  const usedPactilis = new Set<number>();
  const matched: PactilisDiffRow[] = [];

  // Index locaux
  const localByPactilis = new Map<string, Dependant[]>();
  const localByName = new Map<string, Dependant[]>();
  for (const item of localDependants) {
    const pKey = normalizePactilisKey(item.pactilis);
    if (pKey) {
      const list = localByPactilis.get(pKey) ?? [];
      list.push(item);
      localByPactilis.set(pKey, list);
    }
    const nKey = normalizePersonName(item.nom);
    if (nKey) {
      const list = localByName.get(nKey) ?? [];
      list.push(item);
      localByName.set(nKey, list);
    }
  }

  // 1) Match par N° Pactilis
  for (let i = 0; i < pactilisPeople.length; i++) {
    const person = pactilisPeople[i];
    const pKey = normalizePactilisKey(person.pactilis);
    if (!pKey) continue;
    const candidates = (localByPactilis.get(pKey) ?? []).filter((d) => !usedLocal.has(d.id));
    if (!candidates.length) continue;
    // Préférer même famille de statut
    const fam = statutFamily(person.statut);
    const pick =
      candidates.find((d) => statutFamily(d.statut) === fam) ?? candidates[0];
    usedLocal.add(pick.id);
    usedPactilis.add(i);
    matched.push(toMatchedRow(person, pick, 'pactilis'));
  }

  // 2) Match restants par nom
  for (let i = 0; i < pactilisPeople.length; i++) {
    if (usedPactilis.has(i)) continue;
    const person = pactilisPeople[i];
    const nKey = normalizePersonName(person.nom);
    if (!nKey) continue;
    const candidates = (localByName.get(nKey) ?? []).filter((d) => !usedLocal.has(d.id));
    if (!candidates.length) continue;
    const fam = statutFamily(person.statut);
    const pick =
      candidates.find((d) => statutFamily(d.statut) === fam) ?? candidates[0];
    usedLocal.add(pick.id);
    usedPactilis.add(i);
    matched.push(toMatchedRow(person, pick, 'nom'));
  }

  const onlyInPactilis: PactilisDiffRow[] = [];
  for (let i = 0; i < pactilisPeople.length; i++) {
    if (usedPactilis.has(i)) continue;
    onlyInPactilis.push(toDiffFromPactilis(pactilisPeople[i]));
  }

  const onlyInLocale: PactilisDiffRow[] = [];
  for (const item of localDependants) {
    if (usedLocal.has(item.id)) continue;
    onlyInLocale.push(toDiffFromLocal(item));
  }

  matched.sort(sortDiff);
  onlyInPactilis.sort(sortDiff);
  onlyInLocale.sort(sortDiff);

  return {
    fileName,
    pactilisCount: pactilisPeople.length,
    localeCount: localDependants.length,
    matchedCount: matched.length,
    matched,
    onlyInPactilis,
    onlyInLocale,
    pactilisToAssignCount: matched.filter((m) => m.needsPactilisAssign).length,
  };
}

export function statutKindLabel(statut: string): string {
  if (isEmployeeStatut(statut) || /employ/i.test(statut)) return 'Employé';
  if (isSpouseStatut(statut) || /conjoint/i.test(statut)) return 'Conjoint';
  if (isChildStatut(statut) || /enfant/i.test(statut)) return 'Enfant';
  return statut || '—';
}
