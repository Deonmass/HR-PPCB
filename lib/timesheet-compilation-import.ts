import * as XLSX from 'xlsx';
import type {
  CompilationData,
  CompilationRow,
  CompilationRowWeek,
  CompilationWeek,
} from './timesheet-compilation';

function norm(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeHeader(value: unknown): string {
  return norm(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9.]+/g, '');
}

function asNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.round(value * 100) / 100;
  }
  const raw = norm(value).replace(/\s/g, '').replace(',', '.');
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function isOt13Header(h: string): boolean {
  return h === '1.3' || h === '13';
}
function isOt16Header(h: string): boolean {
  return h === '1.6' || h === '16';
}
function isOt2Header(h: string): boolean {
  return h === '2' || h === '20';
}
function isNightHeader(h: string): boolean {
  return h === 'n';
}

function findHeaderRow(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const cells = (rows[i] ?? []).map(normalizeHeader);
    if (
      cells.includes('matricule')
      && cells.some((c) => c.includes('employee') || c.includes('nom'))
      && cells.some((c) => isOt13Header(c) || isOt16Header(c))
    ) {
      return i;
    }
  }
  return -1;
}

function emptyWeek(): CompilationRowWeek {
  return { ot13: 0, ot16: 0, ot2: 0, night: 0 };
}

/**
 * Parse un export « Compilation OT » (même structure que l'export applicatif) :
 * 3 lignes d'en-tête + lignes agents (Matricule … semaines 1.3/1.6/2/N … Timesheet N … Totaux).
 */
export function parseCompilationExportBuffer(
  buffer: ArrayBuffer | Buffer,
  meta?: { year?: number; month?: number; department?: string; fileName?: string },
): CompilationData {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheetName =
    wb.SheetNames.find((n) => /compilation/i.test(n)) ?? wb.SheetNames[0];
  if (!sheetName) throw new Error('Fichier Excel vide');

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: '',
    raw: true,
  }) as unknown[][];

  const headerRowIdx = findHeaderRow(rows);
  if (headerRowIdx < 0) {
    throw new Error(
      'En-têtes introuvables. Attendu : Matricule, Employee Name, …, 1.3, 1.6, 2, N',
    );
  }

  const headerRow = (rows[headerRowIdx] ?? []).map((c) => c);
  const headers = headerRow.map(normalizeHeader);
  const groupRow = rows[Math.max(0, headerRowIdx - 2)] ?? [];
  const rangeRow = rows[Math.max(0, headerRowIdx - 1)] ?? [];

  const iMat = headers.findIndex((h) => h === 'matricule');
  const iNom = headers.findIndex(
    (h) => h.includes('employeename') || h === 'nom' || h.includes('nometprenom'),
  );
  const iDept = headers.findIndex((h) => h.includes('departement') || h.includes('department'));
  const iLoc = headers.findIndex((h) => h.includes('localisation') || h.includes('location'));
  const iGrade = headers.findIndex((h) => h.includes('grade'));

  if (iMat < 0 || iNom < 0) {
    throw new Error('Colonnes Matricule / Employee Name introuvables');
  }

  // Détecter les blocs semaine : séquences 1.3, 1.6, 2, N
  const weekStarts: number[] = [];
  for (let c = 0; c < headers.length - 3; c++) {
    if (
      isOt13Header(headers[c])
      && isOt16Header(headers[c + 1])
      && isOt2Header(headers[c + 2])
      && isNightHeader(headers[c + 3])
    ) {
      weekStarts.push(c);
      c += 3;
    }
  }

  if (!weekStarts.length) {
    throw new Error('Aucune colonne semaine (1.3 / 1.6 / 2 / N) trouvée');
  }

  // Limiter à 4 semaines comme l'export
  const weekCols = weekStarts.slice(0, 4);

  // Timesheet N = première colonne N après le dernier bloc semaine qui n'est pas dans un bloc
  const lastWeekEnd = weekCols[weekCols.length - 1] + 3;
  let nightNormalCol = -1;
  for (let c = lastWeekEnd + 1; c < headers.length; c++) {
    if (isNightHeader(headers[c])) {
      nightNormalCol = c;
      break;
    }
  }

  const weeks: CompilationWeek[] = weekCols.map((start, pos) => {
    const label =
      norm(groupRow[start])
      || norm(headerRow[start])
      || `Semaine ${pos + 1}`;
    const range = norm(rangeRow[start]) || '';
    return {
      index: pos + 1,
      label: /semaine/i.test(label) ? label : `Semaine ${pos + 1}`,
      range,
    };
  });

  const dataRows: CompilationRow[] = [];
  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const matricule = norm(row[iMat]);
    const nom = norm(row[iNom]);
    if (!matricule && !nom) continue;
    // Skip total row
    if (/total/i.test(matricule) || /total/i.test(nom)) continue;

    const weekValues: CompilationRowWeek[] = weekCols.map((start) => ({
      ot13: asNumber(row[start]),
      ot16: asNumber(row[start + 1]),
      ot2: asNumber(row[start + 2]),
      night: asNumber(row[start + 3]),
    }));

    // Pad to weeks length if needed
    while (weekValues.length < weeks.length) weekValues.push(emptyWeek());

    dataRows.push({
      matricule,
      nom,
      departement: iDept >= 0 ? norm(row[iDept]) : '',
      localisation: iLoc >= 0 ? norm(row[iLoc]) : '',
      grade: iGrade >= 0 ? norm(row[iGrade]) : '',
      weeks: weekValues,
      nightNormal: nightNormalCol >= 0 ? asNumber(row[nightNormalCol]) : 0,
    });
  }

  if (!dataRows.length) {
    throw new Error('Aucune ligne agent trouvée dans le fichier');
  }

  const now = new Date();
  return {
    year: meta?.year ?? now.getFullYear(),
    month: meta?.month ?? now.getMonth() + 1,
    department: meta?.department ?? 'Simulation',
    weeks,
    rows: dataRows,
    closed: false,
  };
}
