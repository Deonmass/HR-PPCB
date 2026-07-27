import 'server-only';

import ExcelJS from 'exceljs';
import fs from 'fs';
import {
  type CompilationData,
  type CompilationRow,
  type CompilationRowWeek,
} from './timesheet-compilation';
import {
  applyCompilationPolicy,
  type PolicyChange,
} from './timesheet-compilation-policy';
import { OVERTIMES_EXPORT_XLSX_PATH } from './excel-overtimes-paths';

const WEEK_START_COL = 6; // F
const DATA_START_ROW = 4;
const LAST_DATA_COL = 27; // AA = Total
/** Timesheet N + Total Général (V–AA) — styles du template à conserver. */
const TOTAL_GEN_FIRST_COL = 22;
const TOTAL_GEN_LAST_COL = 27;
const POLICY_YELLOW = 'FFFFFF00';
const TOTAL_BLACK = 'FF000000';
const TOTAL_WHITE = 'FFFFFFFF';

const OT_FIELDS: { key: keyof CompilationRowWeek; label: string }[] = [
  { key: 'ot13', label: '1.3' },
  { key: 'ot16', label: '1.6' },
  { key: 'ot2', label: '2' },
  { key: 'night', label: 'N' },
];

const SHEET_RAW = 'Données brutes';
const SHEET_POLICY = 'Politique';

function num(value: number): number | null {
  const rounded = Math.round(value * 100) / 100;
  return rounded ? rounded : null;
}

function fieldLabel(field: keyof CompilationRowWeek): string {
  return OT_FIELDS.find((f) => f.key === field)?.label ?? String(field);
}

function fmtHours(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2);
}

function weekCol(weekPos: number, field: keyof CompilationRowWeek): number {
  const offset = OT_FIELDS.findIndex((f) => f.key === field);
  return WEEK_START_COL + weekPos * 4 + Math.max(0, offset);
}

function isTotalGeneralCol(col: number): boolean {
  return col >= TOTAL_GEN_FIRST_COL && col <= TOTAL_GEN_LAST_COL;
}

function buildChangeCommentMap(changes: PolicyChange[]): Map<string, string> {
  const byKey = new Map<string, PolicyChange[]>();
  for (const change of changes) {
    const key = `${change.matricule}::${change.weekPos}::${change.field}`;
    const list = byKey.get(key) ?? [];
    list.push(change);
    byKey.set(key, list);
  }

  const comments = new Map<string, string>();
  for (const [key, list] of byKey) {
    const lines = list.map(
      (c) =>
        `${fieldLabel(c.field)} : ${fmtHours(c.from)} → ${fmtHours(c.to)}\n${c.reason}`,
    );
    comments.set(key, `Politique conventionnelle\n${lines.join('\n\n')}`);
  }
  return comments;
}

function cloneStyle(style: Partial<ExcelJS.Style> | ExcelJS.Style): ExcelJS.Style {
  return JSON.parse(JSON.stringify(style)) as ExcelJS.Style;
}

/** Capture les styles template des colonnes Timesheet N + Total Général (ligne modèle). */
function captureTotalGeneralStyles(sheet: ExcelJS.Worksheet): Map<number, ExcelJS.Style> {
  const map = new Map<number, ExcelJS.Style>();
  for (let c = TOTAL_GEN_FIRST_COL; c <= TOTAL_GEN_LAST_COL; c++) {
    map.set(c, cloneStyle(sheet.getCell(DATA_START_ROW, c).style));
  }
  return map;
}

/** Fresh style object — avoids mutating ExcelJS shared stylesheet entries. */
function plainCellStyle(
  extras: Partial<ExcelJS.Style> = {},
): Partial<ExcelJS.Style> {
  return {
    font: { name: 'Calibri', size: 11, color: { argb: 'FF000000' }, ...(extras.font ?? {}) },
    fill: extras.fill ?? {
      type: 'pattern',
      pattern: 'none',
    },
    alignment: extras.alignment ?? { vertical: 'middle' },
    border: extras.border,
    numFmt: extras.numFmt,
  };
}

function setPlainValue(cell: ExcelJS.Cell, value: ExcelJS.CellValue) {
  cell.value = value;
  // Ne pas toucher cell.note : assigner undefined/'' crée des commentaires vides (triangles rouges).
  cell.style = plainCellStyle({
    numFmt: typeof value === 'number' || (value && typeof value === 'object' && 'formula' in value)
      ? '0.00'
      : undefined,
  }) as ExcelJS.Style;
}

function setTotalGeneralValue(
  cell: ExcelJS.Cell,
  value: ExcelJS.CellValue,
  templateStyle: ExcelJS.Style,
) {
  cell.value = value;
  cell.style = cloneStyle(templateStyle);
}

function applyYellowAndComment(cell: ExcelJS.Cell, comment: string) {
  const currentValue = cell.value;
  cell.value = currentValue;
  cell.style = plainCellStyle({
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: POLICY_YELLOW },
    },
    numFmt: typeof currentValue === 'number' ? '0.00' : undefined,
  }) as ExcelJS.Style;
  // String simple — évite le bug ExcelJS des notes objets vides en cascade
  cell.note = comment;
}

function clearDataArea(
  sheet: ExcelJS.Worksheet,
  totalStyles: Map<number, ExcelJS.Style>,
) {
  const last = Math.max(sheet.rowCount, DATA_START_ROW);
  for (let r = DATA_START_ROW; r <= last; r++) {
    for (let c = 1; c <= LAST_DATA_COL; c++) {
      const cell = sheet.getCell(r, c);
      cell.value = null;
      if (isTotalGeneralCol(c) && totalStyles.has(c)) {
        cell.style = cloneStyle(totalStyles.get(c)!);
      } else {
        cell.style = plainCellStyle() as ExcelJS.Style;
      }
    }
  }
}

function keepOnlyCompilationSheet(workbook: ExcelJS.Workbook) {
  const toRemove = workbook.worksheets
    .map((ws) => ws.name)
    .filter((name) => name.trim().toLowerCase() !== 'compilation');
  for (const name of toRemove) {
    workbook.removeWorksheet(name);
  }
}

function writeWeekHeaders(sheet: ExcelJS.Worksheet, weeks: CompilationData['weeks']) {
  const weekCount = weeks.length;
  weeks.forEach((week, pos) => {
    const start = WEEK_START_COL + pos * 4;
    for (let c = 0; c < 4; c++) {
      sheet.getCell(1, start + c).value = week.label;
      sheet.getCell(2, start + c).value = week.range;
    }
  });
  for (let pos = weekCount; pos < 4; pos++) {
    const start = WEEK_START_COL + pos * 4;
    for (let c = 0; c < 4; c++) {
      sheet.getCell(1, start + c).value = `Semaine ${pos + 1}`;
      sheet.getCell(2, start + c).value = '';
    }
  }
}

function fillSheetRows(
  sheet: ExcelJS.Worksheet,
  rows: CompilationRow[],
  weekCount: number,
  totalStyles: Map<number, ExcelJS.Style>,
  policyComments?: Map<string, string>,
) {
  const nightCol = WEEK_START_COL + weekCount * 4;
  const totalStart = nightCol + 1;

  clearDataArea(sheet, totalStyles);

  rows.forEach((row, index) => {
    const excelRow = DATA_START_ROW + index;
    setPlainValue(sheet.getCell(excelRow, 1), row.matricule);
    setPlainValue(sheet.getCell(excelRow, 2), row.nom);
    setPlainValue(sheet.getCell(excelRow, 3), row.departement);
    setPlainValue(sheet.getCell(excelRow, 4), row.localisation);
    setPlainValue(sheet.getCell(excelRow, 5), row.grade);

    row.weeks.slice(0, weekCount).forEach((week, weekPos) => {
      OT_FIELDS.forEach((col) => {
        const colIdx = weekCol(weekPos, col.key);
        const cell = sheet.getCell(excelRow, colIdx);
        const commentKey = `${row.matricule}::${weekPos}::${col.key}`;
        const comment = policyComments?.get(commentKey);
        const value = comment
          ? Math.round(week[col.key] * 100) / 100
          : num(week[col.key]);
        setPlainValue(cell, value);
        if (comment) applyYellowAndComment(cell, comment);
      });
    });

    const nightStyle = totalStyles.get(nightCol);
    if (nightStyle) {
      setTotalGeneralValue(sheet.getCell(excelRow, nightCol), num(row.nightNormal), nightStyle);
    } else {
      setPlainValue(sheet.getCell(excelRow, nightCol), num(row.nightNormal));
    }

    const ot13Refs: string[] = [];
    const ot16Refs: string[] = [];
    const ot2Refs: string[] = [];
    const otNightRefs: string[] = [];
    for (let pos = 0; pos < weekCount; pos += 1) {
      ot13Refs.push(sheet.getCell(excelRow, weekCol(pos, 'ot13')).address);
      ot16Refs.push(sheet.getCell(excelRow, weekCol(pos, 'ot16')).address);
      ot2Refs.push(sheet.getCell(excelRow, weekCol(pos, 'ot2')).address);
      otNightRefs.push(sheet.getCell(excelRow, weekCol(pos, 'night')).address);
    }

    const refNightNormal = sheet.getCell(excelRow, nightCol).address;
    const refTotalOt13 = sheet.getCell(excelRow, totalStart).address;
    const refTotalOt16 = sheet.getCell(excelRow, totalStart + 1).address;
    const refTotalOt2 = sheet.getCell(excelRow, totalStart + 2).address;
    const refTotalOtNight = sheet.getCell(excelRow, totalStart + 3).address;

    const sumOrZero = (refs: string[]) => (refs.length ? `SUM(${refs.join(',')})` : '0');

    const writeTotal = (col: number, value: ExcelJS.CellValue) => {
      const style = totalStyles.get(col);
      if (style) setTotalGeneralValue(sheet.getCell(excelRow, col), value, style);
      else setPlainValue(sheet.getCell(excelRow, col), value);
    };

    writeTotal(totalStart, { formula: sumOrZero(ot13Refs) });
    writeTotal(totalStart + 1, { formula: sumOrZero(ot16Refs) });
    writeTotal(totalStart + 2, { formula: sumOrZero(ot2Refs) });
    writeTotal(totalStart + 3, {
      formula: `${sumOrZero(otNightRefs)}+${refNightNormal}`,
    });
    writeTotal(totalStart + 4, {
      formula: `${refTotalOt13}+${refTotalOt16}+${refTotalOt2}+${refTotalOtNight}`,
    });
  });

  const firstData = DATA_START_ROW;
  const lastData = DATA_START_ROW + rows.length - 1;
  const totalRow = lastData + 1;

  // Ligne TOTAL — fond noir, texte blanc, formules SUM
  for (let c = 1; c <= LAST_DATA_COL; c++) {
    const cell = sheet.getCell(totalRow, c);
    if (c === 1) {
      cell.value = 'TOTAL';
    } else if (c >= 2 && c <= 5) {
      cell.value = null;
    } else if (rows.length > 0) {
      const colLetter = sheet.getCell(firstData, c).address.replace(/\d+$/, '');
      cell.value = { formula: `SUM(${colLetter}${firstData}:${colLetter}${lastData})` };
    } else {
      cell.value = null;
    }
    cell.style = plainCellStyle({
      font: {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: TOTAL_WHITE },
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: TOTAL_BLACK },
      },
      alignment: { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' },
      numFmt: c >= WEEK_START_COL ? '0.00' : undefined,
    }) as ExcelJS.Style;
  }

  // Neutraliser les lignes vides résiduelles du template (au-delà du TOTAL)
  for (let r = totalRow + 1; r <= sheet.rowCount; r++) {
    for (let c = 1; c <= LAST_DATA_COL; c++) {
      const cell = sheet.getCell(r, c);
      cell.value = null;
      if (isTotalGeneralCol(c) && totalStyles.has(c)) {
        cell.style = cloneStyle(totalStyles.get(c)!);
      } else {
        cell.style = plainCellStyle() as ExcelJS.Style;
      }
    }
    sheet.getRow(r).hidden = true;
  }
}

function copySheetStructure(source: ExcelJS.Worksheet, target: ExcelJS.Worksheet) {
  source.columns.forEach((col, index) => {
    if (col.width != null) target.getColumn(index + 1).width = col.width;
  });

  for (let r = 1; r <= 3; r++) {
    const srcRow = source.getRow(r);
    const dstRow = target.getRow(r);
    if (srcRow.height != null) dstRow.height = srcRow.height;
    for (let c = 1; c <= LAST_DATA_COL; c++) {
      const src = source.getCell(r, c);
      const dst = target.getCell(r, c);
      dst.value = src.value;
      dst.style = cloneStyle(src.style);
    }
  }

  const merges = (source.model as { merges?: string[] } | undefined)?.merges ?? [];
  for (const merge of merges) {
    try {
      target.mergeCells(merge);
    } catch {
      // ignore duplicate / invalid merges
    }
  }
}

export interface CompilationExportOptions {
  /**
   * Lignes après politique (et annulations éventuelles).
   * Si omis, la politique est recalculée depuis data.rows.
   */
  policyRows?: CompilationRow[];
  /** Modifications à surligner (jaune + commentaire) sur la feuille Politique. */
  policyChanges?: PolicyChange[];
}

/**
 * Export compilation OT à partir du template Excel/overtimes/OVERTIMES.xlsx.
 * Produit toujours 2 feuilles : « Données brutes » et « Politique ».
 */
export async function buildCompilationWorkbookBuffer(
  data: CompilationData,
  options: CompilationExportOptions = {},
): Promise<Buffer> {
  if (!fs.existsSync(OVERTIMES_EXPORT_XLSX_PATH)) {
    throw new Error(
      `Template introuvable : ${OVERTIMES_EXPORT_XLSX_PATH}. Placez OVERTIMES.xlsx dans Excel/overtimes/.`,
    );
  }

  const rawRows = data.rows;
  const policyResult =
    options.policyRows && options.policyChanges
      ? { rows: options.policyRows, changes: options.policyChanges }
      : options.policyRows
        ? {
            rows: options.policyRows,
            changes: options.policyChanges ?? applyCompilationPolicy(rawRows).changes,
          }
        : applyCompilationPolicy(rawRows);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(OVERTIMES_EXPORT_XLSX_PATH);
  keepOnlyCompilationSheet(workbook);

  const rawSheet = workbook.getWorksheet('Compilation');
  if (!rawSheet) {
    throw new Error('Feuille « Compilation » introuvable dans OVERTIMES.xlsx');
  }

  // Capturer les couleurs Total Général AVANT toute réécriture
  const totalStyles = captureTotalGeneralStyles(rawSheet);
  rawSheet.name = SHEET_RAW;

  const weeks = data.weeks.slice(0, 4);
  const weekCount = weeks.length;

  writeWeekHeaders(rawSheet, weeks);
  fillSheetRows(rawSheet, rawRows, weekCount, totalStyles);

  const policySheet = workbook.addWorksheet(SHEET_POLICY);
  copySheetStructure(rawSheet, policySheet);
  writeWeekHeaders(policySheet, weeks);
  fillSheetRows(
    policySheet,
    policyResult.rows,
    weekCount,
    totalStyles,
    buildChangeCommentMap(policyResult.changes),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
