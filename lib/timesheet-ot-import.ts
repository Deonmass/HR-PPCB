import * as XLSX from 'xlsx';
import type { WeeklyOvertimeEntry } from './timesheet-weekly-ot';
import { parseNum } from './overtime';

export interface ParsedWeeklyOvertimeRow extends WeeklyOvertimeEntry {
  department: string;
}

export interface ParsedWeeklyOvertimeImport {
  rows: ParsedWeeklyOvertimeRow[];
  sheetName: string;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function findColumn(headers: string[], candidates: string[]): number {
  const exact = headers.findIndex((header) => candidates.some((candidate) => header === candidate));
  if (exact >= 0) return exact;
  return headers.findIndex((header) =>
    candidates.some((candidate) => candidate.length >= 2 && header.includes(candidate)),
  );
}

export function parseWeeklyOvertimeImportBuffer(buffer: ArrayBuffer): ParsedWeeklyOvertimeImport {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames.find((name) => name.toLowerCase().includes('user')) ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error('Feuille Excel introuvable');

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  if (!rows.length) throw new Error('Fichier vide');

  const headerRowIndex = rows.findIndex((row) =>
    row.some((cell) => normalizeHeader(cell).includes('matricule')),
  );
  if (headerRowIndex < 0) throw new Error('En-tête matricule introuvable');

  const headers = (rows[headerRowIndex] as unknown[]).map((cell) => normalizeHeader(cell));
  const matriculeCol = findColumn(headers, ['matricule', 'newnumber', 'employee']);
  const departmentCol = findColumn(headers, ['departement', 'department', 'dept']);
  const ot13Col = findColumn(headers, ['1.3']);
  const ot16Col = findColumn(headers, ['1.6']);
  const ot2Col = findColumn(headers, ['2.0', '2']);
  const nightCol = findColumn(headers, ['night', 'n']);

  if (matriculeCol < 0) throw new Error('Colonne matricule introuvable');
  if (ot13Col < 0 || ot16Col < 0 || ot2Col < 0 || nightCol < 0) {
    throw new Error('Colonnes 1.3 / 1.6 / 2 / N introuvables');
  }

  const parsed: ParsedWeeklyOvertimeRow[] = [];
  for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
    const row = rows[i] as unknown[];
    const matricule = String(row[matriculeCol] ?? '').trim();
    if (!matricule || !/^\d/.test(matricule)) continue;
    // Département fichier = affichage uniquement ; l’affectation se fait par matricule (HR).
    const department =
      departmentCol >= 0 ? String(row[departmentCol] ?? '').trim() : '';
    parsed.push({
      matricule,
      department,
      ot13: parseNum(row[ot13Col]),
      ot16: parseNum(row[ot16Col]),
      ot2: parseNum(row[ot2Col]),
      night: parseNum(row[nightCol]),
    });
  }

  if (!parsed.length) throw new Error('Aucune ligne employé reconnue');
  return { rows: parsed, sheetName };
}
