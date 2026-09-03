import * as XLSX from 'xlsx';
import XlsxPopulate from 'xlsx-populate';
import {
  CONGE_STORE_VERSION,
  DEFAULT_CONGE_GRADES,
  DEFAULT_CONGE_SENIORITY_BANDS,
  emptyCongeStore,
  isCongeStoredDayCode,
  type CongeEmployeeRecord,
  type CongeGradeRow,
  type CongeSeniorityBand,
  type CongeStoredDayCode,
  type CongeStoreData,
} from './conge-types';
import { isoFromParts, toCongeIsoDate } from './conge-rules';

export interface CongeImportResult {
  store: CongeStoreData;
  sheetNames: { planning: string; grade: string | null };
  skippedRows: number;
  dayColumns: number;
  storedDayCodes: number;
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function cellText(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

function cellNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

/**
 * Excel serial (1900 date system) → ISO.
 * `SSF.parse_date_code` gère le bug du 29/02/1900 ; on n’utilise pas `Date` local
 * pour éviter un décalage de jour (UTC+1 / DST).
 */
export function excelSerialToIso(serial: number): string {
  if (!Number.isFinite(serial) || serial < 1) return '';
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed || !parsed.y) return '';
  return isoFromParts(parsed.y, parsed.m, parsed.d);
}

function excelDateToIso(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToIso(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const shifted = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    return isoFromParts(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
  }
  const s = String(value).trim();
  const iso = toCongeIsoDate(s);
  if (iso) return iso;
  const n = Number(s.replace(',', '.'));
  if (Number.isFinite(n) && n > 20000) return excelSerialToIso(n);
  return '';
}

function findColumn(headers: string[], candidates: string[]): number {
  const exact = headers.findIndex((header) => candidates.some((c) => header === c));
  if (exact >= 0) return exact;
  return headers.findIndex((header) =>
    candidates.some((c) => c.length >= 2 && header.includes(c)),
  );
}

function usedRowCount(sheet: ReturnType<Awaited<ReturnType<typeof XlsxPopulate.fromDataAsync>>['sheet']>): number {
  const used = sheet.usedRange();
  if (used) return used.endCell().rowNumber();
  return 400;
}

function usedColCount(sheet: ReturnType<Awaited<ReturnType<typeof XlsxPopulate.fromDataAsync>>['sheet']>): number {
  const used = sheet.usedRange();
  if (used) return used.endCell().columnNumber();
  return 220;
}

function parseOpeningBalance(formula: string | undefined, value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const f = String(formula || '');
  const nums = [...f.matchAll(/\((-?[0-9]+(?:\.[0-9]+)?)\)/g)].map((m) => Number(m[1]));
  if (nums.length >= 1) {
    const last = nums[nums.length - 1];
    return Number.isFinite(last) ? last : 0;
  }
  return 0;
}

function isSoldeHeader(header: string): boolean {
  return header.startsWith('solde');
}

function isDayHeader(value: unknown, headerNorm: string): boolean {
  if (isSoldeHeader(headerNorm)) return false;
  if (typeof value === 'number' && value > 20000) return true;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return true;
  return Boolean(excelDateToIso(value));
}

function findPlanningSheet(wb: Awaited<ReturnType<typeof XlsxPopulate.fromDataAsync>>) {
  const sheets = wb.sheets();
  const byName = sheets.find((s) => normalizeHeader(s.name()) === 'planning')
    ?? sheets.find((s) => normalizeHeader(s.name()).includes('planning'));
  return byName ?? sheets[0] ?? null;
}

function findGradeSheet(wb: Awaited<ReturnType<typeof XlsxPopulate.fromDataAsync>>) {
  const sheets = wb.sheets();
  return sheets.find((s) => normalizeHeader(s.name()) === 'grade')
    ?? sheets.find((s) => normalizeHeader(s.name()).includes('grade'))
    ?? null;
}

function parseGradesSheet(
  sheet: ReturnType<Awaited<ReturnType<typeof XlsxPopulate.fromDataAsync>>['sheet']>,
): { grades: CongeGradeRow[]; bands: CongeSeniorityBand[] } {
  const maxRow = usedRowCount(sheet);
  let headerRow = 0;
  for (let r = 1; r <= Math.min(12, maxRow); r += 1) {
    const a = normalizeHeader(sheet.cell(r, 1).value());
    if (a === 'grade') {
      headerRow = r;
      break;
    }
  }
  const grades: CongeGradeRow[] = [];
  if (headerRow > 0) {
    for (let r = headerRow + 1; r <= maxRow; r += 1) {
      const grade = cellText(sheet.cell(r, 1).value());
      if (!grade) break;
      if (normalizeHeader(grade).includes('tranche')) break;
      const joursAnnuels = cellNumber(sheet.cell(r, 3).value()) ?? 0;
      const joursParMoisRaw = cellNumber(sheet.cell(r, 4).value());
      const limiteAnnee = cellNumber(sheet.cell(r, 5).value()) ?? 0;
      grades.push({
        grade: grade.trim().toUpperCase(),
        categorie: cellText(sheet.cell(r, 2).value()),
        joursAnnuels,
        joursParMois: joursParMoisRaw != null ? joursParMoisRaw : joursAnnuels / 12,
        limiteAnnee,
      });
    }
  }

  let bandHeader = 0;
  for (let r = 1; r <= maxRow; r += 1) {
    const a = normalizeHeader(sheet.cell(r, 1).value());
    if (a.includes('tranche') || (a.includes('anciennete') && a.includes('min'))) {
      bandHeader = r;
      break;
    }
  }
  const bands: CongeSeniorityBand[] = [];
  if (bandHeader > 0) {
    for (let r = bandHeader + 1; r <= maxRow; r += 1) {
      const label = cellText(sheet.cell(r, 1).value());
      const minYears = cellNumber(sheet.cell(r, 2).value());
      if (!label && minYears == null) break;
      if (minYears == null) continue;
      const extraDaysPerYear = cellNumber(sheet.cell(r, 3).value()) ?? 0;
      const extraPerMonthRaw = cellNumber(sheet.cell(r, 4).value());
      bands.push({
        label: label || `${minYears}`,
        minYears,
        extraDaysPerYear,
        extraPerMonth: extraPerMonthRaw != null ? extraPerMonthRaw : extraDaysPerYear / 12,
      });
    }
  }

  return {
    grades: grades.length ? grades : DEFAULT_CONGE_GRADES.map((row) => ({ ...row })),
    bands: bands.length ? bands : DEFAULT_CONGE_SENIORITY_BANDS.map((row) => ({ ...row })),
  };
}

function exerciseYearFromTitle(title: string, fallbackYear: number): number {
  const m = String(title || '').match(/\b(20\d{2})\b/);
  if (m) return Number(m[1]);
  return fallbackYear;
}

async function parseWorkbook(
  wb: Awaited<ReturnType<typeof XlsxPopulate.fromDataAsync>>,
  source: string,
): Promise<CongeImportResult> {
  const planning = findPlanningSheet(wb);
  if (!planning) throw new Error('Feuille Planning introuvable');

  const gradeSheet = findGradeSheet(wb);
  const { grades, bands } = gradeSheet
    ? parseGradesSheet(gradeSheet)
    : {
        grades: DEFAULT_CONGE_GRADES.map((row) => ({ ...row })),
        bands: DEFAULT_CONGE_SENIORITY_BANDS.map((row) => ({ ...row })),
      };

  const maxRow = usedRowCount(planning);
  const maxCol = usedColCount(planning);
  let headerRow = 0;
  for (let r = 1; r <= Math.min(8, maxRow); r += 1) {
    const headers = [];
    for (let c = 1; c <= Math.min(12, maxCol); c += 1) {
      headers.push(normalizeHeader(planning.cell(r, c).value()));
    }
    if (headers.includes('matricule') && headers.some((h) => h.includes('nom'))) {
      headerRow = r;
      break;
    }
  }
  if (!headerRow) throw new Error('En-têtes Planning introuvables (Matricule, Nom, …)');

  const headerValues: unknown[] = [];
  const headerNorm: string[] = [];
  for (let c = 1; c <= maxCol; c += 1) {
    const raw = planning.cell(headerRow, c).value();
    headerValues[c] = raw;
    headerNorm[c] = normalizeHeader(raw);
  }

  const colMatricule = findColumn(headerNorm.slice(1), ['matricule']) + 1;
  const colNom = findColumn(headerNorm.slice(1), ['nomcomplet', 'nom']) + 1;
  const colSexe = findColumn(headerNorm.slice(1), ['sexe', 'genre', 'gender']) + 1;
  const colDept = findColumn(headerNorm.slice(1), ['departement', 'department']) + 1;
  const colPos = findColumn(headerNorm.slice(1), ['position', 'poste', 'fonction', 'jobtitle']) + 1;
  const colGrade = findColumn(headerNorm.slice(1), ['grade']) + 1;
  const colHire = findColumn(headerNorm.slice(1), ['datedembauche', 'dateembauche', 'appointmentdate']) + 1;
  const colOpening = headerNorm.findIndex((h, i) => i > 0 && isSoldeHeader(h || ''));

  if (colMatricule < 1) throw new Error('Colonne Matricule introuvable');

  const dayCols: Array<{ col: number; iso: string }> = [];
  for (let c = 1; c <= maxCol; c += 1) {
    const raw = headerValues[c];
    const norm = headerNorm[c] || '';
    if (!isDayHeader(raw, norm)) continue;
    const iso = excelDateToIso(raw);
    if (!iso) continue;
    dayCols.push({ col: c, iso });
  }
  dayCols.sort((a, b) => a.iso.localeCompare(b.iso));

  const employees: CongeEmployeeRecord[] = [];
  let skippedRows = 0;
  let storedDayCodes = 0;

  for (let r = headerRow + 1; r <= maxRow; r += 1) {
    const matricule = cellText(planning.cell(r, colMatricule).value());
    const nom = colNom > 0 ? cellText(planning.cell(r, colNom).value()) : '';
    if (!matricule) {
      if (nom) skippedRows += 1;
      continue;
    }
    // Légende / notes en bas de feuille (texte dans la colonne Matricule).
    if (!/^\d+$/.test(matricule)) {
      skippedRows += 1;
      continue;
    }

    const days: Record<string, CongeStoredDayCode> = {};
    for (const day of dayCols) {
      const raw = planning.cell(r, day.col).value();
      const code = String(raw ?? '').trim().toUpperCase();
      if (!code || code === 'IN') continue;
      if (!isCongeStoredDayCode(code)) continue;
      days[day.iso] = code;
      storedDayCodes += 1;
    }

    const openingCell = colOpening > 0 ? planning.cell(r, colOpening) : null;
    const openingBalance = openingCell
      ? parseOpeningBalance(openingCell.formula(), openingCell.value())
      : 0;

    employees.push({
      matricule,
      nom,
      sexe: colSexe > 0 ? cellText(planning.cell(r, colSexe).value()) : '',
      departement: colDept > 0 ? cellText(planning.cell(r, colDept).value()) : '',
      position: colPos > 0 ? cellText(planning.cell(r, colPos).value()) : '',
      grade: colGrade > 0 ? cellText(planning.cell(r, colGrade).value()).toUpperCase() : '',
      appointmentDate: colHire > 0 ? excelDateToIso(planning.cell(r, colHire).value()) : '',
      openingBalance,
      days,
    });
  }

  const rangeStart = dayCols[0]?.iso || '';
  const rangeEnd = dayCols[dayCols.length - 1]?.iso || '';
  const title = cellText(planning.cell(1, 1).value());
  const exerciseYear = rangeStart
    ? Number(rangeStart.slice(0, 4))
    : exerciseYearFromTitle(title, new Date().getUTCFullYear());

  employees.sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.matricule.localeCompare(b.matricule));

  const store: CongeStoreData = {
    version: CONGE_STORE_VERSION,
    exerciseYear,
    rangeStart: rangeStart || emptyCongeStore(exerciseYear).rangeStart,
    rangeEnd: rangeEnd || emptyCongeStore(exerciseYear).rangeEnd,
    source: source || title || 'Planning de congé',
    updatedAt: new Date().toISOString(),
    grades,
    seniorityBands: bands,
    employees,
  };

  return {
    store,
    sheetNames: { planning: planning.name(), grade: gradeSheet?.name() ?? null },
    skippedRows,
    dayColumns: dayCols.length,
    storedDayCodes,
  };
}

export async function parseCongeWorkbookFromBuffer(
  data: Buffer | ArrayBuffer | Uint8Array,
  source = 'import',
): Promise<CongeImportResult> {
  const wb = await XlsxPopulate.fromDataAsync(data);
  return parseWorkbook(wb, source);
}

export async function parseCongeWorkbookFromFile(
  filePath: string,
  source?: string,
): Promise<CongeImportResult> {
  const wb = await XlsxPopulate.fromFileAsync(filePath);
  return parseWorkbook(wb, source || filePath);
}
