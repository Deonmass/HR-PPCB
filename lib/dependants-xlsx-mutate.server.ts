import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import { DEP_COL, DEPENDANTS_DATA_START, DEPENDANTS_SHEET } from './dependants-columns';
import type { AoaRow } from './excel-io';

const STYLE_PROPS = [
  'bold',
  'italic',
  'fill',
  'border',
  'horizontalAlignment',
  'verticalAlignment',
  'fontColor',
  'fontSize',
  'wrapText',
  'numberFormat',
] as const;

const FIRST_DATA_ROW = DEPENDANTS_DATA_START + 1; // Excel row 3
const COL_COUNT = DEP_COL.typeMaison + 1; // includes Numero Villa + Type de maison

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

function copyCell(source: PopulateSheet, target: PopulateSheet, fromRow: number, toRow: number, col: number): void {
  const from = source.cell(fromRow, col);
  const to = target.cell(toRow, col);
  const value = from.value();
  to.value(value === undefined ? null : value);
  try {
    to.style(from.style([...STYLE_PROPS]));
  } catch {
    // Some cells have no transferable style object.
  }
}

function clearCell(sheet: PopulateSheet, row: number, col: number): void {
  sheet.cell(row, col).value(null);
}

function findLastDataRow(sheet: PopulateSheet): number {
  let last = FIRST_DATA_ROW - 1;
  const used = sheet.usedRange();
  const maxScan = used ? Math.min(used.endCell().rowNumber() + 50, 5000) : 2000;

  for (let row = FIRST_DATA_ROW; row <= maxScan; row++) {
    const matricule = sheet.cell(row, DEP_COL.matricule + 1).value();
    const id = sheet.cell(row, DEP_COL.id + 1).value();
    if (
      (matricule !== undefined && matricule !== null && String(matricule).trim() !== '')
      || (id !== undefined && id !== null && String(id).trim() !== '')
    ) {
      last = row;
    }
  }

  return last;
}

/** Insert empty row at Excel `atRow` (1-based), shifting existing rows down. */
export function populateShiftRowsDown(sheet: PopulateSheet, atRow: number): void {
  const last = findLastDataRow(sheet);
  if (last < atRow - 1) {
    // Nothing to shift; just ensure the target row exists.
    return;
  }

  for (let row = last; row >= atRow; row--) {
    for (let col = 1; col <= COL_COUNT; col++) {
      copyCell(sheet, sheet, row, row + 1, col);
    }
  }

  for (let col = 1; col <= COL_COUNT; col++) {
    clearCell(sheet, atRow, col);
  }
}

/** Delete Excel row `atRow` (1-based), shifting rows below up. */
export function populateShiftRowsUp(sheet: PopulateSheet, atRow: number): void {
  const last = findLastDataRow(sheet);
  if (last < atRow) return;

  for (let row = atRow; row < last; row++) {
    for (let col = 1; col <= COL_COUNT; col++) {
      copyCell(sheet, sheet, row + 1, row, col);
    }
  }

  for (let col = 1; col <= COL_COUNT; col++) {
    clearCell(sheet, last, col);
  }
}

export function populateCloneRowStyle(sheet: PopulateSheet, sourceRow: number, targetRow: number): void {
  for (let col = 1; col <= COL_COUNT; col++) {
    try {
      const styles = sheet.cell(sourceRow, col).style([...STYLE_PROPS]);
      sheet.cell(targetRow, col).style(styles);
    } catch {
      // ignore
    }
  }
}

export function populateWriteRowValues(sheet: PopulateSheet, excelRow: number, values: AoaRow): void {
  values.forEach((value, index) => {
    const col = index + 1;
    const cell = sheet.cell(excelRow, col);
    if (value === undefined || value === null || value === '') {
      cell.value(null);
      return;
    }
    cell.value(value);
    if (index === DEP_COL.lienDocument && typeof value === 'string' && /^https?:\/\//i.test(value)) {
      cell
        .hyperlink(value)
        .style({ fontColor: '0563c1', underline: true });
    }
  });
}

export async function loadDependantsPopulateWorkbook(filePath: string): Promise<{
  workbook: PopulateWorkbook;
  sheet: PopulateSheet;
}> {
  const workbook = await XlsxPopulate.fromFileAsync(filePath);
  const sheet = workbook.sheet(DEPENDANTS_SHEET);
  return { workbook, sheet };
}

export async function savePopulateWorkbook(workbook: PopulateWorkbook, filePath: string): Promise<void> {
  const buffer = await workbook.outputAsync();
  await fs.promises.writeFile(filePath, buffer);
}

export function populateFindLastDataRow(sheet: PopulateSheet): number {
  return findLastDataRow(sheet);
}
