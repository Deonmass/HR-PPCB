import * as XLSX from 'xlsx';
import type { ContractantEmployeeInput } from './contractants-types';
import {
  CONTRACTANT_ETATS_CIVILS,
  isContractantEmployeeStatut,
  isContractantEtatCivil,
  isContractantSexe,
} from './contractants-types';
import { isLocalisationLabel, normalizeLocalisation } from './localisations';

export interface ParsedContractantEmployeesImport {
  rows: ContractantEmployeeInput[];
  sheetName: string;
  skipped: number;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function findColumn(headers: string[], candidates: string[]): number {
  const exact = headers.findIndex((header) => candidates.some((c) => header === c));
  if (exact >= 0) return exact;
  return headers.findIndex((header) =>
    candidates.some((c) => c.length >= 2 && header.includes(c)),
  );
}

function cell(row: unknown[], col: number): string {
  if (col < 0) return '';
  const raw = row[col];
  if (raw == null) return '';
  return String(raw).trim();
}

function parseSexe(raw: string): ContractantEmployeeInput['sexe'] {
  const v = raw.trim().toUpperCase();
  if (isContractantSexe(v)) return v;
  const n = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/^f|feminin|female|woman/.test(n)) return 'F';
  return 'M';
}

function parseEtatCivil(raw: string): ContractantEmployeeInput['etatCivil'] {
  const v = raw.trim().toUpperCase();
  if (isContractantEtatCivil(v)) return v;
  const n = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  for (const item of CONTRACTANT_ETATS_CIVILS) {
    const label = item.label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (n === label || n.includes(label.split(' ')[0]!)) return item.id;
  }
  if (/marie/.test(n)) return 'M';
  if (/celibat/.test(n)) return 'C';
  if (/veuf|veuve/.test(n)) return 'V';
  if (/divorc/.test(n)) return 'D';
  return 'C';
}

function parseStatut(raw: string): ContractantEmployeeInput['statut'] {
  const v = raw.trim();
  if (isContractantEmployeeStatut(v)) return v;
  const n = v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (/journal|daily|journalier/.test(n)) return 'Journalier';
  return 'Permanent';
}

/**
 * Colonnes attendues (souples) :
 * NOMS ET POST NOMS | SEXE | LIEU D'AFFECTATION | FONCTION | DEPARTEMENT | TELEPHONE | ETAT CIVIL | STATUT
 */
export function parseContractantEmployeesImportBuffer(
  buffer: ArrayBuffer,
): ParsedContractantEmployeesImport {
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('Feuille Excel introuvable');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true }) as unknown[][];
  if (!rows.length) throw new Error('Fichier vide');

  const headerRowIndex = rows.findIndex((row) => {
    const headers = row.map(normalizeHeader);
    return headers.some((h) => h.includes('nom')) && headers.some((h) =>
      h.includes('sexe') || h.includes('fonction') || h.includes('departement') || h.includes('affectation'),
    );
  });
  if (headerRowIndex < 0) {
    throw new Error(
      'En-têtes introuvables (NOMS, SEXE, LIEU D’AFFECTATION, FONCTION, DEPARTEMENT, …)',
    );
  }

  const headers = (rows[headerRowIndex] as unknown[]).map((h) => normalizeHeader(h));
  const nomCol = findColumn(headers, ['nomsetpostnoms', 'noms', 'nom', 'postnoms', 'fullname']);
  const sexeCol = findColumn(headers, ['sexe', 'genre', 'gender']);
  const lieuCol = findColumn(headers, [
    'lieudaffectation',
    'lieuaffectation',
    'affectation',
    'lieu',
    'site',
  ]);
  const fonctionCol = findColumn(headers, ['fonction', 'poste', 'job', 'title']);
  const departementCol = findColumn(headers, [
    'departement',
    'department',
    'service',
    'dept',
  ]);
  const telephoneCol = findColumn(headers, [
    'numerotelephone',
    'telephone',
    'tel',
    'phone',
    'mobile',
  ]);
  const etatCivilCol = findColumn(headers, ['etatcivil', 'civilstatus', 'marital']);
  const statutCol = findColumn(headers, ['statut', 'status', 'typecontrat', 'categorie']);

  if (nomCol < 0) {
    throw new Error('Colonne noms introuvable');
  }

  const parsed: ContractantEmployeeInput[] = [];
  let skipped = 0;

  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] as unknown[];
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

    const nom = cell(row, nomCol);
    if (!nom) {
      skipped += 1;
      continue;
    }

    const lieuRaw = cell(row, lieuCol);
    const lieuAffectation = normalizeLocalisation(lieuRaw);
    let fonction = cell(row, fonctionCol);
    // Ne jamais traiter un lieu (MALANGA, KIMPESE, …) comme fonction.
    if (isLocalisationLabel(fonction)) fonction = '';

    parsed.push({
      nom,
      sexe: parseSexe(cell(row, sexeCol)),
      lieuAffectation,
      fonction,
      departement: cell(row, departementCol),
      telephone: cell(row, telephoneCol),
      etatCivil: parseEtatCivil(cell(row, etatCivilCol)),
      statut: parseStatut(cell(row, statutCol)),
    });
  }

  if (parsed.length === 0) {
    throw new Error('Aucune ligne employé valide dans le fichier');
  }

  return { rows: parsed, sheetName, skipped };
}
