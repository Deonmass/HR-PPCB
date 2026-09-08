import 'server-only';

import ExcelJS from 'exceljs';
import { listClassificationPostes } from './classification-store';
import {
  classificationRank,
  familyFromClassification,
  type ClassificationFamily,
  type ClassificationPoste,
} from './classification-types';

const NAVY = 'FF17365D';
const HEADER = 'FF1F4E78';
const SUBTITLE = 'FFD9E2F3';
const MUTED = 'FF44546A';
const INK = 'FF1F2937';
const WHITE = 'FFFFFFFF';

const FAMILY_THEME: Record<
  ClassificationFamily,
  { label: string; banner: string; body: string }
> = {
  Encadrement: { label: 'ENCADREMENT', banner: 'FFF4B183', body: 'FFFCE4D6' },
  Maitrise: { label: 'Maitrise', banner: 'FF9DC3E6', body: 'FFDDEBF7' },
  Execution: { label: 'EXECUTION', banner: 'FFA9D18E', body: 'FFE2F0D9' },
};

const FAMILY_ORDER: ClassificationFamily[] = ['Encadrement', 'Maitrise', 'Execution'];

const THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFBDD7EE' } },
  left: { style: 'thin', color: { argb: 'FFBDD7EE' } },
  bottom: { style: 'thin', color: { argb: 'FFBDD7EE' } },
  right: { style: 'thin', color: { argb: 'FFBDD7EE' } },
};

function fill(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function foldKey(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function familyOf(poste: ClassificationPoste): ClassificationFamily {
  return poste.family || familyFromClassification(poste.classification);
}

function departmentOf(poste: ClassificationPoste): string {
  return (poste.department || poste.departmentShort || '').trim() || 'Non renseigné';
}

/** Code RDC (CD, CC3, M2, Q1, HQ, …) dérivé de la classification. */
export function codeRdc(classification: string): string {
  const n = foldKey(classification);
  if (!n) return '';
  if (n.includes('cadre de direction') || n === 'cd') return 'CD';
  const collab = n.match(/cadre de collaboration\s*(\d)/);
  if (collab) return `CC${collab[1]}`;
  if (n.includes('cadre de collaboration')) return 'CC';
  const maitrise = n.match(/maitrise\s*(\d)/);
  if (maitrise) return `M${maitrise[1]}`;
  if (n.includes('maitrise')) return 'M';
  if (n.includes('hautement')) return 'HQ';
  if (n.includes('semi')) {
    const digit = n.match(/(\d)/);
    return digit ? `SQ${digit[1]}` : 'SQ';
  }
  if (n.includes('qualifie')) {
    const digit = n.match(/(\d)/);
    return digit ? `Q${digit[1]}` : 'Q';
  }
  if (n.includes('special')) return 'MS';
  if (n.includes('ordinaire')) return 'ML';
  if (n.includes('manoeuvre') || n.includes('maneuve')) return 'MO';
  return '';
}

/** Échelon de catégorie (1–4) tel que dans la grille officielle. */
export function categoryEchelon(classification: string): number | null {
  const n = foldKey(classification);
  if (n.includes('hautement')) return 1;
  if (n.includes('special')) return 1;
  if (n.includes('ordinaire')) return 2;
  const digit = n.match(
    /(?:collaboration|maitrise|semi-qualifie|semi qualifie|qualifie)\s*(\d)/,
  );
  if (digit) return Number(digit[1]);
  return null;
}

function sortPostes(postes: ClassificationPoste[]): ClassificationPoste[] {
  return [...postes].sort((a, b) => {
    const fa = FAMILY_ORDER.indexOf(familyOf(a));
    const fb = FAMILY_ORDER.indexOf(familyOf(b));
    if (fa !== fb) return fa - fb;
    const cr = classificationRank(a.classification) - classificationRank(b.classification);
    if (cr) return cr;
    const dept = departmentOf(a).localeCompare(departmentOf(b), 'fr');
    if (dept) return dept;
    return a.title.localeCompare(b.title, 'fr');
  });
}

function todayLabel(): string {
  return new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function applyHeaderBand(sheet: ExcelJS.Worksheet, lastCol: number, subtitle: string) {
  sheet.mergeCells(1, 1, 1, lastCol);
  const title = sheet.getCell(1, 1);
  title.value = 'CLASSIFICATION GÉNÉRALE DES EMPLOIS – PPC BARNET';
  title.font = { name: 'Calibri', size: 16, bold: true, color: { argb: WHITE } };
  title.fill = fill(NAVY);
  title.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(1).height = 28;

  sheet.mergeCells(2, 1, 2, lastCol);
  const sub = sheet.getCell(2, 1);
  sub.value = subtitle;
  sub.font = { name: 'Calibri', size: 10, color: { argb: MUTED } };
  sub.fill = fill(SUBTITLE);
  sub.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  sheet.getRow(2).height = 22;
}

function styleHeaderCell(cell: ExcelJS.Cell) {
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
  cell.fill = fill(HEADER);
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = THIN;
}

function paintRange(
  sheet: ExcelJS.Worksheet,
  row: number,
  from: number,
  to: number,
  argb: string,
) {
  for (let col = from; col <= to; col += 1) {
    const cell = sheet.getCell(row, col);
    cell.fill = fill(argb);
    cell.border = THIN;
    cell.font = { ...(cell.font || {}), name: 'Calibri', color: { argb: INK } };
  }
}

function mergeIfSpan(sheet: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  if (r2 > r1 || c2 > c1) {
    sheet.mergeCells(r1, c1, r2, c2);
  }
}

export function buildClassificationExportFilename(): string {
  const iso = new Date().toISOString().slice(0, 10);
  return `CLASSIFICATION_GENERALE_DES_EMPLOIS_${iso}.xlsx`;
}

export async function buildClassificationExportBuffer(): Promise<{ buffer: Buffer; filename: string }> {
  const postes = sortPostes(await listClassificationPostes());
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PPC Barnet HR';
  wb.created = new Date();

  buildClassificationSheet(wb, postes);
  buildDepartmentSheet(wb, postes);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: buildClassificationExportFilename() };
}

function buildClassificationSheet(wb: ExcelJS.Workbook, postes: ClassificationPoste[]) {
  const sheet = wb.addWorksheet('Classification', {
    views: [{ state: 'frozen', ySplit: 8, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '3:8',
    },
  });

  sheet.columns = [
    { width: 18 },
    { width: 28 },
    { width: 11 },
    { width: 11 },
    { width: 12 },
    { width: 13 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 18 },
    { width: 16 },
  ];

  applyHeaderBand(
    sheet,
    14,
    `Grille consolidée des catégories socioprofessionnelles, échelons, classes, codes, emplois et départements — ${todayLabel()}`,
  );

  const headerLabels: Array<{ col: number; lastCol?: number; text: string }> = [
    { col: 1, text: 'CATÉGORIES\nSOCIOPROFESSIONNELLES' },
    { col: 2, text: 'CATÉGORIES' },
    { col: 3, text: 'ÉCHELONS' },
    { col: 4, text: 'CLASSES' },
    { col: 5, text: 'CODES RDC' },
    { col: 6, text: 'CODES PPC B' },
    { col: 7, text: 'ÉVENTAIL\nDES POINTS' },
    { col: 8, lastCol: 12, text: 'EMPLOIS' },
    { col: 13, text: 'Département' },
    { col: 14, text: 'Localisation' },
  ];
  for (const header of headerLabels) {
    const lastCol = header.lastCol ?? header.col;
    sheet.mergeCells(3, header.col, 8, lastCol);
    const cell = sheet.getCell(3, header.col);
    cell.value = header.text;
    for (let row = 3; row <= 8; row += 1) {
      for (let col = header.col; col <= lastCol; col += 1) {
        styleHeaderCell(sheet.getCell(row, col));
      }
    }
  }
  for (let row = 3; row <= 8; row += 1) sheet.getRow(row).height = 12;
  sheet.getRow(3).height = 18;

  const start = 9;
  postes.forEach((poste, index) => {
    const row = start + index;
    const family = familyOf(poste);
    const theme = FAMILY_THEME[family];
    const excelRow = sheet.getRow(row);
    excelRow.height = 18;
    paintRange(sheet, row, 1, 14, theme.body);

    const catEchelon = categoryEchelon(poste.classification);
    excelRow.getCell(3).value = catEchelon;
    excelRow.getCell(4).value = poste.echelon;
    excelRow.getCell(5).value = codeRdc(poste.classification);
    excelRow.getCell(6).value = poste.gradeNouveau || poste.gradePaterson || '';
    excelRow.getCell(7).value = poste.eventailPoints || (poste.total != null ? String(poste.total) : '');
    excelRow.getCell(8).value = poste.title;
    excelRow.getCell(13).value = departmentOf(poste);
    excelRow.getCell(14).value = poste.location || '—';

    for (const col of [3, 4, 5, 6, 7]) {
      excelRow.getCell(col).alignment = { horizontal: 'center', vertical: 'middle' };
      excelRow.getCell(col).font = { name: 'Calibri', size: 9, bold: col === 5 || col === 6, color: { argb: NAVY } };
    }
    excelRow.getCell(7).font = { name: 'Calibri', size: 9, color: { argb: MUTED } };
    excelRow.getCell(8).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    excelRow.getCell(8).font = { name: 'Calibri', size: 8, color: { argb: INK } };
    excelRow.getCell(13).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    excelRow.getCell(13).font = { name: 'Calibri', size: 9, bold: true, color: { argb: NAVY } };
    excelRow.getCell(14).alignment = { horizontal: 'center', vertical: 'middle' };
    excelRow.getCell(14).font = { name: 'Calibri', size: 9, color: { argb: MUTED } };
    sheet.mergeCells(row, 8, row, 12);
  });

  const last = start + Math.max(postes.length, 1) - 1;
  if (postes.length > 0) {
    let i = 0;
    while (i < postes.length) {
      const family = familyOf(postes[i]);
      let j = i + 1;
      while (j < postes.length && familyOf(postes[j]) === family) j += 1;
      const r1 = start + i;
      const r2 = start + j - 1;
      mergeIfSpan(sheet, r1, 1, r2, 1);
      const familyCell = sheet.getCell(r1, 1);
      familyCell.value = FAMILY_THEME[family].label;
      familyCell.fill = fill(FAMILY_THEME[family].banner);
      familyCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: INK } };
      familyCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, textRotation: 0 };
      let k = i;
      while (k < j) {
        const cat = postes[k].classification || 'Non classifié';
        let m = k + 1;
        while (m < j && (postes[m].classification || 'Non classifié') === cat) m += 1;
        const c1 = start + k;
        const c2 = start + m - 1;
        mergeIfSpan(sheet, c1, 2, c2, 2);
        const catCell = sheet.getCell(c1, 2);
        catCell.value = cat;
        catCell.fill = fill(FAMILY_THEME[family].banner);
        catCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: INK } };
        catCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
        k = m;
      }
      i = j;
    }
    sheet.autoFilter = { from: { row: 8, column: 1 }, to: { row: last, column: 14 } };
  }

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = THIN;
    });
  });
}

function buildDepartmentSheet(wb: ExcelJS.Workbook, postes: ClassificationPoste[]) {
  const sheet = wb.addWorksheet('Par département', {
    views: [{ state: 'frozen', ySplit: 3, xSplit: 1, showGridLines: false }],
    pageSetup: {
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  sheet.columns = [
    { width: 22 },
    { width: 52 },
    { width: 26 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 16 },
    { width: 14 },
  ];

  applyHeaderBand(
    sheet,
    10,
    `Postes regroupés par département — ${postes.length} poste(s) — ${todayLabel()}`,
  );

  const headers = [
    'Département',
    'Poste',
    'Classification',
    'Famille',
    'Grade',
    'Points',
    'Classe',
    'Code RDC',
    'Éventail',
    'Localisation',
  ];
  headers.forEach((label, index) => {
    const cell = sheet.getCell(3, index + 1);
    cell.value = label;
    styleHeaderCell(cell);
  });
  sheet.getRow(3).height = 22;

  const byDept = new Map<string, ClassificationPoste[]>();
  for (const poste of postes) {
    const dept = departmentOf(poste);
    const list = byDept.get(dept) || [];
    list.push(poste);
    byDept.set(dept, list);
  }
  const departments = [...byDept.keys()].sort((a, b) => a.localeCompare(b, 'fr'));

  let row = 4;
  for (const dept of departments) {
    const items = sortPostes(byDept.get(dept) || []);
    const groupStart = row;
    items.forEach((poste) => {
      const family = familyOf(poste);
      const theme = FAMILY_THEME[family];
      paintRange(sheet, row, 1, 10, theme.body);
      const excelRow = sheet.getRow(row);
      excelRow.height = 18;
      excelRow.getCell(2).value = poste.title;
      excelRow.getCell(3).value = poste.classification || '—';
      excelRow.getCell(4).value = FAMILY_THEME[family].label;
      excelRow.getCell(5).value = poste.gradeNouveau || poste.gradePaterson || '—';
      excelRow.getCell(6).value = poste.total;
      excelRow.getCell(7).value = poste.echelon;
      excelRow.getCell(8).value = codeRdc(poste.classification);
      excelRow.getCell(9).value = poste.eventailPoints || '';
      excelRow.getCell(10).value = poste.location || '—';
      excelRow.getCell(2).alignment = { vertical: 'middle', wrapText: true };
      excelRow.getCell(2).font = { name: 'Calibri', size: 9, color: { argb: INK } };
      for (const col of [3, 4, 5, 6, 7, 8, 9, 10]) {
        excelRow.getCell(col).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        excelRow.getCell(col).font = { name: 'Calibri', size: 9, color: { argb: NAVY } };
      }
      excelRow.getCell(5).font = { name: 'Calibri', size: 9, bold: true, color: { argb: NAVY } };
      row += 1;
    });
    const groupEnd = row - 1;
    mergeIfSpan(sheet, groupStart, 1, groupEnd, 1);
    const deptCell = sheet.getCell(groupStart, 1);
    deptCell.value = `${dept} (${items.length})`;
    deptCell.fill = fill(HEADER);
    deptCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: WHITE } };
    deptCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    deptCell.border = THIN;
  }

  if (row > 4) {
    sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: row - 1, column: 10 } };
  }
}
