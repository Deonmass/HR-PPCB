import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import type { ExcoHireListRow, ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { buildExcoSlidesPayload } from './exco-slides-data';
import { readExcoUploadBuffer } from './exco-uploads';
import { EXCO_BUNDLED_REPORT_PATH } from './exco-bundled-source';
import { STAFF_COST_FY_MONTHS } from './exco-staff-cost-model';
import type { ExcoWorkbookSnapshot } from './exco-new-report-parse';
import { parseDisplayDateParts } from './employee-columns';

export function buildExcoExcelFilename(year: number, month: number): string {
  const label = formatExcoPeriodLabel(year, month).replace(/\s+/g, '_');
  return `EXCO_HR_REPORT_${label}.xlsx`;
}

const TEMPLATE_REL = path.join('templates', 'exco', 'template.xlsx');

export async function resolveExcoExcelTemplatePath(): Promise<string> {
  const primary = path.join(process.cwd(), TEMPLATE_REL);
  try {
    await fs.access(primary);
    return primary;
  } catch {
    throw new Error(
      `Template Excel introuvable (${TEMPLATE_REL}). Placez template.xlsx dans templates/exco/.`,
    );
  }
}

function endOfMonthDate(year: number, month: number): Date {
  return new Date(year, month, 0, 12, 0, 0, 0);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7A1F2B' },
  };
  row.alignment = { vertical: 'middle', wrapText: true };
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 42) {
  ws.columns.forEach((col) => {
    let w = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      w = Math.min(max, Math.max(w, len + 2));
    });
    col.width = w;
  });
}

function fyColIndex(calendarMonth: number): number {
  const idx = STAFF_COST_FY_MONTHS.indexOf(
    calendarMonth as (typeof STAFF_COST_FY_MONTHS)[number],
  );
  return idx >= 0 ? idx + 2 : -1; // B=2 …
}

function setPlainValue(cell: ExcelJS.Cell, value: number | string | Date | null | undefined) {
  if (value === null || value === undefined || value === '') return;
  // Ne pas écraser une formule existante sauf valeur d’entrée volontaire
  cell.value = value;
}

const SOURCES_ROOT = path.join(process.cwd(), 'data', 'exco', 'sources');

async function readOfficialWorkbook(year: number, month: number): Promise<Buffer | null> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  try {
    return await fs.readFile(path.join(SOURCES_ROOT, monthKey, 'New report.xlsx'));
  } catch {
    return null;
  }
}

async function resolveSourceWorkbook(
  report: ExcoReportPayload,
): Promise<{ buffer: Buffer; label: string }> {
  const own = await readOfficialWorkbook(report.year, report.month);
  if (own) {
    return { buffer: own, label: `${report.year}-${report.month} New report.xlsx` };
  }
  const uploaded = await readExcoUploadBuffer(report.year, report.month, 'newReport');
  if (uploaded) {
    return {
      buffer: Buffer.from(uploaded.buffer),
      label: uploaded.originalName || 'newReport.xlsx',
    };
  }
  // Pas de classeur du mois : partir du New report le plus récent (août pour un export septembre).
  let y = report.year;
  let m = report.month;
  for (let i = 0; i < 11; i += 1) {
    m -= 1;
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    const prev = await readOfficialWorkbook(y, m);
    if (prev) {
      return { buffer: prev, label: `${y}-${String(m).padStart(2, '0')} New report.xlsx` };
    }
  }
  try {
    const templatePath = await resolveExcoExcelTemplatePath();
    return { buffer: await fs.readFile(templatePath), label: 'template.xlsx' };
  } catch {
    const bundled = await fs.readFile(EXCO_BUNDLED_REPORT_PATH);
    return { buffer: bundled, label: 'New report.xlsx' };
  }
}

function applyParams(wb: ExcelJS.Workbook, report: ExcoReportPayload) {
  const ws = wb.getWorksheet('Params');
  if (!ws) return;
  const fx = report.overlays.generationMeta?.fxRateFcPerUsd ?? null;
  if (fx != null && Number.isFinite(fx)) {
    ws.getCell('B2').value = fx;
  }
  ws.getCell('B3').value = endOfMonthDate(report.year, report.month);
}

function applyStaffCost(wb: ExcelJS.Workbook, snap: ExcoWorkbookSnapshot | null | undefined) {
  const ws = wb.getWorksheet('Staff_Cost_KPI');
  if (!ws || !snap?.staffCost?.length) return;

  for (const row of snap.staffCost) {
    const col = fyColIndex(row.calendarMonth);
    if (col < 0) continue;
    // Inputs (pas les formules chaînées) — aligné parse New report
    if (row.actualHeadcount != null) setPlainValue(ws.getCell(4, col), row.actualHeadcount);
    if (row.salariesActualYtd != null) setPlainValue(ws.getCell(5, col), row.salariesActualYtd);
    if (row.volumesActualYtd != null) setPlainValue(ws.getCell(6, col), row.volumesActualYtd);
    if (row.revenueActualYtd != null) setPlainValue(ws.getCell(7, col), row.revenueActualYtd);
    if (row.salariesBudgetYtd != null) setPlainValue(ws.getCell(10, col), row.salariesBudgetYtd);
    if (row.volumesBudgetYtd != null) setPlainValue(ws.getCell(11, col), row.volumesBudgetYtd);
    if (row.revenueBudgetYtd != null) setPlainValue(ws.getCell(12, col), row.revenueBudgetYtd);
  }
}

const MONTH_LABELS: Record<string, number> = {
  APR: 4, APRIL: 4, MAY: 5, JUN: 6, JUNE: 6, JUL: 7, JULY: 7,
  AUG: 8, AUGUST: 8, SEP: 9, SEPT: 9, SEPTEMBER: 9,
  OCT: 10, OCTOBER: 10, NOV: 11, NOVEMBER: 11, DEC: 12, DECEMBER: 12,
  JAN: 1, JANUARY: 1, FEB: 2, FEBRUARY: 2, MAR: 3, MARCH: 3,
};

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return '';
  if (typeof value === 'object' && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText.map((part) => part.text || '').join('');
  }
  if (typeof value === 'object' && 'text' in value && typeof value.text === 'string') return value.text;
  return '';
}

function formulaOf(cell: ExcelJS.Cell): string | null {
  const value = cell.value;
  if (value && typeof value === 'object' && 'formula' in value && typeof value.formula === 'string') {
    return value.formula;
  }
  return null;
}

function isFormulaCell(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  if (!value || typeof value !== 'object') return false;
  return 'formula' in value || 'sharedFormula' in value;
}

function plainNumber(cell: ExcelJS.Cell): number | null {
  const value = cell.value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result;
  }
  return null;
}

function isBlank(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  return value == null || value === '';
}

function normLabel(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function matriculeOf(value: ExcelJS.CellValue): string {
  const text = cellText(value).trim().replace(/\.0$/, '');
  return /^\d{5,}$/.test(text) ? text : '';
}

function fyStartYear(year: number, month: number): number {
  return month >= 4 ? year : year - 1;
}

function excelDate(value: string): Date | null {
  const parts = parseDisplayDateParts(value || '');
  if (!parts) return null;
  // Midi local : le 30/09 reste en septembre (pas de décalage de fuseau vers le 01/10).
  return new Date(parts.y, parts.m - 1, parts.d, 12, 0, 0);
}

function completedYears(from: string, to: string): number | null {
  const start = parseDisplayDateParts(from || '');
  const end = parseDisplayDateParts(to || '');
  if (!start || !end) return null;
  let years = end.y - start.y;
  if (end.m < start.m || (end.m === start.m && end.d < start.d)) years -= 1;
  return Math.max(0, years);
}

function retargetCriterion(formula: string, fromLetter: string, toLetter: string): string {
  const re = new RegExp(`(\\$?)${fromLetter}(\\$?)2\\b`, 'gi');
  return formula.replace(re, (_match, absCol: string, absRow: string) => `${absCol}${toLetter}${absRow}2`);
}

function findCountifTemplate(
  ws: ExcelJS.Worksheet,
  row: number,
): { formula: string; col: number } | null {
  for (let col = 2; col <= 14; col += 1) {
    const formula = formulaOf(ws.getCell(row, col));
    if (!formula || !/COUNTIF\s*\(/i.test(formula)) continue;
    const letter = ws.getColumn(col).letter;
    if (new RegExp(`\\$?${letter}\\$?2\\b`, 'i').test(formula)) {
      return { formula, col };
    }
  }
  return null;
}

interface MovementCols {
  mat: number;
  last: number;
  first: number;
  gender: number;
  grade: number;
  position: number;
  dept: number;
  date: number;
  reason: number;
  service: number;
  mois: number;
}

function findHeaderCol(header: string[], start: number, end: number, needles: string[]): number {
  for (let col = start; col < end; col += 1) {
    const label = normLabel(header[col] || '');
    if (!label) continue;
    if (needles.some((needle) => label === needle || label.includes(needle))) return col;
  }
  return -1;
}

function movementCols(header: string[], start: number, end: number, kind: 'in' | 'out'): MovementCols {
  return {
    mat: start,
    last: findHeaderCol(header, start, end, ['emp last name', 'last name']),
    first: findHeaderCol(header, start, end, ['first name']),
    gender: findHeaderCol(header, start, end, ['gender']),
    grade: findHeaderCol(header, start, end, ['grade']),
    position: findHeaderCol(header, start, end, ['position']),
    dept: findHeaderCol(header, start, end, ['department', 'departement']),
    date: findHeaderCol(
      header,
      start,
      end,
      kind === 'in' ? ['employment date'] : ['termination date'],
    ),
    reason: kind === 'out' ? findHeaderCol(header, start, end, ['termination reason', 'reason']) : -1,
    service: kind === 'out' ? findHeaderCol(header, start, end, ['length of service']) : -1,
    mois: findHeaderCol(header, start, end, ['mois', 'month']),
  };
}

function mapExitReason(reason: string, labels: string[]): string {
  const source = normLabel(reason);
  const rules: Array<[RegExp, RegExp]> = [
    [/deces|deced|death|deceased/, /deces|death/],
    [/demission|resign/, /resign|demission/],
    [/retrait|retirement/, /retrait|retirement/],
    [/licenci|dismiss|dismis/, /licenci|dismiss|dismis/],
    [/contract|expire|fin de contrat/, /contract|expire/],
    [/amicable|amiable/, /amicable|amiable/],
  ];
  for (const [sourceRe, labelRe] of rules) {
    if (!sourceRe.test(source)) continue;
    const hit = labels.find((label) => labelRe.test(normLabel(label)));
    if (hit) return hit;
    if (sourceRe.source.startsWith('deces')) return 'Death';
  }
  return reason.trim();
}

function writePlain(cell: ExcelJS.Cell, value: string | number | null | undefined) {
  if (value == null || value === '') return;
  if (isFormulaCell(cell)) return;
  cell.value = value;
}

function writeMovementDate(cell: ExcelJS.Cell, value: string) {
  if (isFormulaCell(cell)) return;
  const date = excelDate(value);
  if (!date) {
    if (value) cell.value = value;
    return;
  }
  cell.value = date;
  cell.numFmt = 'dd/mm/yyyy';
}

function ensureMoisFormula(ws: ExcelJS.Worksheet, row: number, cols: MovementCols) {
  if (cols.mois < 0 || cols.date < 0) return;
  const cell = ws.getCell(row, cols.mois);
  if (!isBlank(cell)) return;
  const letter = ws.getColumn(cols.date).letter;
  cell.value = { formula: `IF(${letter}${row}="","",MONTH(${letter}${row}))` };
}

function existingMatricules(ws: ExcelJS.Worksheet, col: number, headerRow: number): Set<string> {
  const seen = new Set<string>();
  for (let row = headerRow + 1; row < headerRow + 80; row += 1) {
    const matricule = matriculeOf(ws.getCell(row, col).value);
    if (matricule) seen.add(matricule.toLowerCase());
  }
  return seen;
}

function nextEmptyRow(ws: ExcelJS.Worksheet, col: number, headerRow: number): number {
  for (let row = headerRow + 1; row < headerRow + 80; row += 1) {
    if (!matriculeOf(ws.getCell(row, col).value)) return row;
  }
  return headerRow + 80;
}

function countMatricules(ws: ExcelJS.Worksheet, col: number, headerRow: number): number {
  return existingMatricules(ws, col, headerRow).size;
}

function freezeBlanketCounts(ws: ExcelJS.Worksheet, col: number, fallback: number) {
  for (const row of [4, 5]) {
    const cell = ws.getCell(row, col);
    const formula = formulaOf(cell);
    if (!formula || !/COUNTA\s*\(/i.test(formula) || /COUNTIF\s*\(/i.test(formula)) continue;
    const current = plainNumber(cell);
    cell.value = current ?? fallback;
  }
}

function withCachedResult(cell: ExcelJS.Cell, result: number) {
  const value = cell.value;
  if (value && typeof value === 'object' && 'formula' in value && typeof value.formula === 'string') {
    cell.value = { formula: value.formula, result };
    return;
  }
  if (
    value
    && typeof value === 'object'
    && 'sharedFormula' in value
    && typeof value.sharedFormula === 'string'
  ) {
    cell.value = { sharedFormula: value.sharedFormula, result };
  }
}

/** Affiche IN / OUT / effectif du mois tout de suite, avant recalcul Excel. */
function cacheMovementResults(
  ws: ExcelJS.Worksheet,
  col: number,
  hires: number,
  exits: number,
) {
  withCachedResult(ws.getCell(4, col), hires);
  withCachedResult(ws.getCell(5, col), exits);
  const prevHeadcount = plainNumber(ws.getCell(8, col - 1));
  if (prevHeadcount == null) return;
  const headcount = prevHeadcount + hires - exits;
  withCachedResult(ws.getCell(8, col), headcount);
  withCachedResult(ws.getCell(6, col), headcount > 0 ? exits / headcount : 0);
  withCachedResult(ws.getCell(7, col), prevHeadcount > 0 ? (hires + exits) / 2 / prevHeadcount : 0);
}

function writeMonthCounts(
  ws: ExcelJS.Worksheet,
  col: number,
  month: number,
  hires: number,
  exits: number,
) {
  const inCell = ws.getCell(4, col);
  const outCell = ws.getCell(5, col);
  const inTemplate = findCountifTemplate(ws, 4);
  const outTemplate = findCountifTemplate(ws, 5);
  if (isBlank(inCell) && isBlank(outCell) && inTemplate && outTemplate) {
    const fromLetter = ws.getColumn(inTemplate.col).letter;
    const toLetter = ws.getColumn(col).letter;
    ws.getCell(2, col).value = month;
    inCell.value = { formula: retargetCriterion(inTemplate.formula, fromLetter, toLetter), result: hires };
    outCell.value = { formula: retargetCriterion(outTemplate.formula, fromLetter, toLetter), result: exits };
    cacheMovementResults(ws, col, hires, exits);
    return;
  }
  const wroteIn = isBlank(inCell);
  const wroteOut = isBlank(outCell);
  if (wroteIn) inCell.value = hires;
  if (wroteOut) outCell.value = exits;
  if (wroteIn || wroteOut) cacheMovementResults(ws, col, hires, exits);
}

function bumpListRanges(ws: ExcelJS.Worksheet, lastRow: number) {
  ws.eachRow({ includeEmpty: false }, (row) => {
    row.eachCell({ includeEmpty: false }, (cell) => {
      const formula = formulaOf(cell);
      if (!formula || !/COUNT(?:IF|A)\s*\(/i.test(formula)) return;
      const next = formula.replace(
        /(\$?[A-Z]{1,3}\$?)(\d+)(:\$?[A-Z]{1,3}\$?)(\d+)/gi,
        (all, startRef: string, startRow: string, mid: string, endRow: string) => {
          const start = Number(startRow);
          const end = Number(endRow);
          if (start >= 15 && start <= 25 && end >= start && end < lastRow && end <= 80) {
            return `${startRef}${startRow}${mid}${lastRow}`;
          }
          return all;
        },
      );
      if (next !== formula) cell.value = { formula: next };
    });
  });
}

function appendMovements(
  ws: ExcelJS.Worksheet,
  cols: MovementCols,
  headerRow: number,
  people: ExcoHireListRow[],
  kind: 'in' | 'out',
  reasonLabels: string[],
): number {
  const seen = existingMatricules(ws, cols.mat, headerRow);
  let row = nextEmptyRow(ws, cols.mat, headerRow);
  let last = headerRow;
  for (const person of people) {
    const matricule = (person.matricule || '').trim();
    if (!matricule || seen.has(matricule.toLowerCase())) continue;
    seen.add(matricule.toLowerCase());
    writePlain(ws.getCell(row, cols.mat), matricule);
    if (cols.last >= 0) writePlain(ws.getCell(row, cols.last), (person.nom || '').trim());
    if (cols.gender >= 0) writePlain(ws.getCell(row, cols.gender), person.genre || '');
    if (cols.grade >= 0) writePlain(ws.getCell(row, cols.grade), person.grade || '');
    if (cols.position >= 0) writePlain(ws.getCell(row, cols.position), person.position || '');
    if (cols.dept >= 0) writePlain(ws.getCell(row, cols.dept), person.departement || '');
    const movementDate = kind === 'out'
      ? (person.appointmentDate || '')
      : (person.employmentDate || person.appointmentDate || '');
    if (cols.date >= 0) writeMovementDate(ws.getCell(row, cols.date), movementDate);
    if (kind === 'out' && cols.reason >= 0) {
      writePlain(ws.getCell(row, cols.reason), mapExitReason(person.reason || '', reasonLabels));
    }
    if (kind === 'out' && cols.service >= 0) {
      const years = completedYears(person.employmentDate || '', person.appointmentDate || '');
      if (years != null) writePlain(ws.getCell(row, cols.service), years);
    }
    if (kind === 'in' && cols.date >= 0 && person.employmentDate && person.employmentDate !== movementDate) {
      writeMovementDate(ws.getCell(row, cols.date), person.employmentDate);
    }
    ensureMoisFormula(ws, row, cols);
    last = row;
    row += 1;
  }
  return last;
}

/**
 * Écrit les mouvements du mois du rapport et du mois précédent sur IN OUT.
 * Une sortie datée du dernier jour du mois (30/09) compte dans ce mois :
 * la date Excel est le jour civil, et MONTH() reste sur septembre.
 */
function fillInOutMovements(ws: ExcelJS.Worksheet, report: ExcoReportPayload) {
  const colByMonth = new Map<number, number>();
  for (let col = 2; col <= 16; col += 1) {
    const label = cellText(ws.getCell(3, col).value).trim().toUpperCase();
    if (!label || label.includes('YTD')) continue;
    const month = MONTH_LABELS[label.replace(/[^A-Z]/g, '')];
    if (month) colByMonth.set(month, col);
  }

  let headerRow = -1;
  for (let row = 16; row <= 30; row += 1) {
    for (let col = 1; col <= 15; col += 1) {
      if (normLabel(cellText(ws.getCell(row, col).value)) === 'emp number') {
        headerRow = row;
        break;
      }
    }
    if (headerRow > 0) break;
  }
  if (headerRow < 0) return;

  const header: string[] = [];
  for (let col = 1; col <= 30; col += 1) header[col] = cellText(ws.getCell(headerRow, col).value);
  const empCols: number[] = [];
  for (let col = 1; col <= 30; col += 1) {
    if (normLabel(header[col] || '') === 'emp number') empCols.push(col);
  }
  const inStart = empCols[0] ?? 1;
  const outStart = empCols[1] ?? inStart + 9;
  const inCols = movementCols(header, inStart, outStart, 'in');
  const outCols = movementCols(header, outStart, header.length, 'out');

  const reasonLabels: string[] = [];
  for (let row = 12; row <= 16; row += 1) {
    const label = cellText(ws.getCell(row, 1).value).trim();
    if (label) reasonLabels.push(label);
  }

  const brokenTotal = formulaOf(ws.getCell(17, 3));
  if (brokenTotal && /\$O\$9/i.test(brokenTotal)) {
    ws.getCell(17, 3).value = { formula: 'IFERROR(B17/$B$17,0)' };
  }

  // COUNTA de toute la liste (modèle juillet) : figer avant d’ajouter août / septembre.
  for (const col of colByMonth.values()) {
    const inFormula = formulaOf(ws.getCell(4, col));
    const outFormula = formulaOf(ws.getCell(5, col));
    if ((inFormula && /COUNTA\s*\(/i.test(inFormula)) || (outFormula && /COUNTA\s*\(/i.test(outFormula))) {
      freezeBlanketCounts(ws, col, countMatricules(ws, inFormula ? inCols.mat : outCols.mat, headerRow));
    }
  }

  const prevMonth = report.month === 1 ? 12 : report.month - 1;
  const prevYear = report.month === 1 ? report.year - 1 : report.year;
  const sameFy = fyStartYear(report.year, report.month) === fyStartYear(prevYear, prevMonth);
  const targets = [report.month];
  if (sameFy && colByMonth.has(prevMonth)) targets.unshift(prevMonth);

  const hiresByMonth = report.computed.hiresByMonth || {};
  const exitsByMonth = report.computed.exitsByMonth || {};
  const monthsToList: number[] = [];
  for (const month of targets) {
    const col = colByMonth.get(month);
    if (!col) continue;
    const wasBlank = isBlank(ws.getCell(4, col)) && isBlank(ws.getCell(5, col));
    writeMonthCounts(
      ws,
      col,
      month,
      (hiresByMonth[month] || []).length,
      (exitsByMonth[month] || []).length,
    );
    // Mois déjà chiffré (août officiel) : ne pas réécrire sa liste.
    // Mois du rapport : toujours ajouter les sorties manquantes, y compris le 30.
    if (wasBlank || month === report.month) monthsToList.push(month);
  }

  let lastRow = headerRow;
  for (const month of monthsToList) {
    lastRow = Math.max(
      lastRow,
      appendMovements(ws, inCols, headerRow, hiresByMonth[month] || [], 'in', reasonLabels),
      appendMovements(ws, outCols, headerRow, exitsByMonth[month] || [], 'out', reasonLabels),
    );
  }
  if (lastRow > headerRow) bumpListRanges(ws, lastRow);
}

function applyInOut(wb: ExcelJS.Workbook, report: ExcoReportPayload) {
  const ws = wb.getWorksheet('IN OUT');
  if (!ws) return;
  const snap = report.overlays.workbookSnapshot;
  const opening = snap?.inOut?.months.find((m) => m.calendarMonth === 4)?.headcount
    ?? snap?.inOut?.months[0]?.headcount;
  if (opening != null) {
    const cell = ws.getCell('B8');
    if (!formulaOf(cell) && isBlank(cell)) cell.value = opening;
  }
  fillInOutMovements(ws, report);
}

function appendPresentationSheets(wb: ExcelJS.Workbook, report: ExcoReportPayload) {
  const slides = buildExcoSlidesPayload(report);

  {
    const name = 'EXCO_CSR';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(['Tag', 'Title', 'Body', 'Progress %']);
    styleHeader(ws.getRow(1));
    for (const h of slides.csr.highlights) {
      ws.addRow([h.icon || '', h.title || '', h.body || '', h.progressPct ?? 0]);
    }
    autoWidth(ws, 12, 50);
  }

  {
    const name = 'EXCO_Cahier';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(['Icon', 'Title', 'Body', 'Progress %']);
    styleHeader(ws.getRow(1));
    for (const h of slides.cahier.highlights) {
      ws.addRow([h.icon || '', h.title || '', h.body || '', h.progressPct ?? 0]);
    }
    autoWidth(ws, 12, 50);
  }

  {
    const name = 'EXCO_Recruitment';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow([
      'Category', 'Position', 'Grade', 'Status', 'Comments',
      'Budgeted', 'Department', 'Location', 'Contract',
    ]);
    styleHeader(ws.getRow(1));
    for (const r of [...slides.recruitment.replacements, ...slides.recruitment.newPositions]) {
      ws.addRow([
        r.category, r.position, r.grade, r.status, r.comments,
        r.budgeted, r.department, r.location, r.contractType,
      ]);
    }
    autoWidth(ws, 10, 36);
  }

  {
    const name = 'EXCO_Audit';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(['#', 'Finding', 'Severity', 'Status', 'Due', 'Comments']);
    styleHeader(ws.getRow(1));
    for (const r of slides.audit.rows) {
      ws.addRow([
        r.number, r.finding, r.severity, r.status,
        r.dueDateLabel || r.dueDate || '', r.comments || '',
      ]);
    }
    autoWidth(ws, 10, 55);
  }

  {
    const name = 'EXCO_Gouvernance';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(['Month', 'Closed %', 'Closed cumul', 'Current']);
    styleHeader(ws.getRow(1));
    for (const p of slides.gouvernance.progression) {
      ws.addRow([p.label, p.closedPct / 100, p.closedCumul, p.isCurrent ? 1 : 0]);
    }
    ws.getColumn(2).numFmt = '0%';
    ws.addRow([]);
    ws.addRow(['Audit total', slides.gouvernance.auditTotal]);
    ws.addRow(['Audit closed', slides.gouvernance.auditClosed]);
    ws.addRow(['Closed %', slides.gouvernance.auditClosedPct / 100]);
    ws.addRow(['Evolution', slides.gouvernance.evolutionText]);
    autoWidth(ws, 12, 60);
  }
}

/**
 * Export Excel = peuplement de `templates/exco/template.xlsx`
 * (ou New report de la période s’il a été uploadé).
 * Les formules Headacount / OVT / VLOOKUP sont conservées.
 */
export async function buildExcoExcelBuffer(report: ExcoReportPayload): Promise<Buffer> {
  const source = await resolveSourceWorkbook(report);
  const wb = new ExcelJS.Workbook();
  // ExcelJS typings expect Buffer; Uint8Array works at runtime.
  await wb.xlsx.load(source.buffer as unknown as ExcelJS.Buffer);

  applyParams(wb, report);
  const snap = report.overlays.workbookSnapshot || null;
  applyStaffCost(wb, snap);
  applyInOut(wb, report);
  appendPresentationSheets(wb, report);

  wb.creator = 'HR RH App';
  wb.title = `EXCO HR Report — ${formatExcoPeriodLabel(report.year, report.month)}`;
  wb.description = `Peuplé depuis ${source.label}`;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
