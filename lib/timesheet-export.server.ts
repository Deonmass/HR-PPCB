import 'server-only';

import XlsxPopulate from 'xlsx-populate';
import { TIMESHEET_TEMPLATE_PATH as RESOLVED_TIMESHEET_TEMPLATE_PATH } from './excel-export-template-paths';
import { actualTimesForTemplateRow, scheduleTimesForRow } from './timesheet-template-view';
import { normalHoursBreakdown } from './timesheet-calc';
import type { DepartmentExportPayload, TimesheetExportPayload } from './timesheet-export';
import { formatTimesheetMonthLabel, isTimesheetWeekend, overtimeWeekInsertsAfterRow } from './timesheet-period';
import type { TimesheetRowData } from './timesheet-types';
import { getTimesheetWsExportValue } from './timesheet-ws';
import { getWeeklyOvertimeWeek } from './timesheet-weekly-ot-store';
import { clearCellValue, setCellValue } from './xlsx-populate-utils';

export const TIMESHEET_SHEET = 'TIMESHEET';

export const TIMESHEET_TEMPLATE_PATH = RESOLVED_TIMESHEET_TEMPLATE_PATH;

const DATA_START_ROW = 9;
const AS_PER_WS_FROM = '07:00';
const AS_PER_WS_TO = '16:30';

const COL = {
  date: 'A',
  day: 'B',
  ws: 'C',
  asFrom: 'D',
  asTo: 'E',
  actualFrom: 'F',
  actualTo: 'G',
  ordinary: 'H',
  shift1: 'I',
  shift2: 'J',
  shift3: 'K',
  nightNormal: 'L',
  ot13: 'M',
  ot16: 'N',
  ot2: 'O',
  otNight: 'P',
} as const;

const DATA_COLUMNS = Object.values(COL);
/** Full row span (DATE → AUTH) used for row-wide fills/styles. */
const ROW_COLUMNS = 'ABCDEFGHIJKLMNOPQRST'.split('');
/** Template: last plain day row before fixed Sub-Total / Accumulative styles. */
const TEMPLATE_DAY_STYLE_ROW = 9;
const TEMPLATE_SUBTOTAL_STYLE_ROW = 42;
const TEMPLATE_ACCUMULATIVE_STYLE_ROW = 43;
const OFF_ROW_FILL_REF = 'A6';
const PRISTINE_SHEET = '__TIMESHEET_TEMPLATE__';
const WEEK_SEPARATOR_FILL = 'F4CCCC';
/** Uniform body font for day / week / totals rows. */
const BODY_FONT_FAMILY = 'Calibri';
const BODY_FONT_SIZE = 12;
/** Matches the TIMESHEET template day rows (A9…). */
const DATE_NUMBER_FORMAT = '[$-409]d\\-mmm;@';

type PopulateSheet = ReturnType<
  Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>['sheet']
>;

type ExportLine =
  | { kind: 'day'; row: TimesheetRowData }
  | {
      kind: 'week';
      weekIndex: number;
      ot: { ot13: number; ot16: number; ot2: number; night: number };
    };

function cellRef(row: number, col: string): string {
  return `${col}${row}`;
}

function setFormula(sheet: PopulateSheet, address: string, formula: string): void {
  sheet.cell(address).formula(formula);
}

/**
 * Normal hours for a planning row, derived from the Actual From/To shown in the sheet
 * (real times when recorded, otherwise the planned shift's standard schedule) so the
 * displayed hours always match the times.
 */
function computeNormalHours(row: TimesheetRowData, localisation: string) {
  const actual = actualTimesForTemplateRow(row, localisation);
  return normalHoursBreakdown(actual.from, actual.to, row.shiftType);
}

function overtimeValue(hours: number): number | '' {
  return hours ? Math.round(hours * 100) / 100 : '';
}

function rowDateKey(row: TimesheetRowData): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(row.dateKey ?? '');
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  const value =
    row.date instanceof Date && !Number.isNaN(row.date.getTime())
      ? row.date
      : new Date(String(row.date));
  if (Number.isNaN(value.getTime())) return '1970-01-01';
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Date-only Excel serial (1899-12-30 epoch) so the cell stays a calendar day, not a timezone datetime. */
function toExportDateSerial(row: TimesheetRowData): number {
  const date = new Date(`${rowDateKey(row)}T00:00:00Z`);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((date.getTime() - epoch) / 86_400_000);
}

function writeDayDate(sheet: PopulateSheet, excelRow: number, row: TimesheetRowData) {
  const cell = sheet.cell(cellRef(excelRow, COL.date));
  cell.value(toExportDateSerial(row));
  cell.style({
    numberFormat: DATE_NUMBER_FORMAT,
    horizontalAlignment: 'center',
  });
}

function applyWeekendGrayFill(sheet: PopulateSheet, excelRow: number) {
  const grayFill = sheet.cell(OFF_ROW_FILL_REF).style('fill');
  for (const col of ROW_COLUMNS) {
    sheet.cell(cellRef(excelRow, col)).style('fill', grayFill);
  }
}

/** Snapshot of template totals chrome before data overwrites rows 42–43. */
type TotalsChrome = {
  fill: unknown;
  fontColor: unknown;
  bold: unknown;
  border: unknown;
};

function captureTotalsChrome(sheet: PopulateSheet): { subtotal: TotalsChrome; accumulative: TotalsChrome } {
  const border = sheet.cell(cellRef(TEMPLATE_DAY_STYLE_ROW, COL.date)).style('border');
  const read = (styleFromRow: number): TotalsChrome => {
    const sample = sheet.cell(cellRef(styleFromRow, COL.date));
    return {
      fill: sample.style('fill'),
      fontColor: sample.style('fontColor'),
      bold: sample.style('bold'),
      border,
    };
  };
  return {
    subtotal: read(TEMPLATE_SUBTOTAL_STYLE_ROW),
    accumulative: read(TEMPLATE_ACCUMULATIVE_STYLE_ROW),
  };
}

function applyCapturedChrome(sheet: PopulateSheet, excelRow: number, chrome: TotalsChrome) {
  for (const col of ROW_COLUMNS) {
    sheet.cell(cellRef(excelRow, col)).style({
      fill: chrome.fill,
      fontColor: chrome.fontColor,
      bold: chrome.bold,
      border: chrome.border,
      fontFamily: BODY_FONT_FAMILY,
      fontSize: BODY_FONT_SIZE,
    });
  }
}

/**
 * Reset a row to a plain day look (clears template Sub-Total / Accumulative fills
 * that would otherwise "stick" when data overflows past row 41).
 */
function resetToDayRowStyle(sheet: PopulateSheet, excelRow: number) {
  const sample = sheet.cell(cellRef(TEMPLATE_DAY_STYLE_ROW, COL.date));
  const border = sample.style('border');
  for (const col of ROW_COLUMNS) {
    sheet.cell(cellRef(excelRow, col)).style({
      fill: undefined,
      fontColor: '000000',
      bold: false,
      border,
      fontFamily: BODY_FONT_FAMILY,
      fontSize: BODY_FONT_SIZE,
    });
  }
}

function applyWeekSeparatorStyle(sheet: PopulateSheet, excelRow: number) {
  const border = sheet.cell(cellRef(TEMPLATE_DAY_STYLE_ROW, COL.date)).style('border');
  for (const col of ROW_COLUMNS) {
    sheet.cell(cellRef(excelRow, col)).style({
      fill: WEEK_SEPARATOR_FILL,
      fontColor: '000000',
      bold: true,
      border,
      fontFamily: BODY_FONT_FAMILY,
      fontSize: BODY_FONT_SIZE,
    });
  }
}

function buildExportLines(rows: TimesheetRowData[], year: number, month: number): ExportLine[] {
  const inserts = overtimeWeekInsertsAfterRow(rows, year, month);
  const lines: ExportLine[] = [];

  rows.forEach((row, index) => {
    const weekIndexes = inserts.get(index);
    if (weekIndexes?.length) {
      for (const weekIndex of weekIndexes) {
        lines.push({
          kind: 'week',
          weekIndex,
          ot: { ot13: 0, ot16: 0, ot2: 0, night: 0 },
        });
      }
    } else if (inserts.size === 0 && index % 7 === 0) {
      lines.push({
        kind: 'week',
        weekIndex: Math.floor(index / 7),
        ot: { ot13: 0, ot16: 0, ot2: 0, night: 0 },
      });
    }
    lines.push({ kind: 'day', row });
  });

  return lines;
}

/** Populate each week separator line with that week's imported overtime for the employee. */
async function attachWeeklyOt(
  lines: ExportLine[],
  year: number,
  month: number,
  department: string,
  matricule: string,
) {
  for (const line of lines) {
    if (line.kind !== 'week') continue;
    const week = await getWeeklyOvertimeWeek(year, month, department, line.weekIndex);
    const entry = week.entries[matricule];
    if (entry) {
      line.ot = { ot13: entry.ot13, ot16: entry.ot16, ot2: entry.ot2, night: entry.night };
    }
  }
}

function fillTimesheetHeader(sheet: PopulateSheet, payload: TimesheetExportPayload) {
  setCellValue(sheet, 'B3', payload.company);
  setCellValue(sheet, 'B4', payload.department);
  setCellValue(sheet, 'P3', payload.employeeName);
  setCellValue(sheet, 'P4', payload.matricule);
  setCellValue(sheet, 'F6', formatTimesheetMonthLabel(payload.period.year, payload.period.month));
}

function fillDayRow(sheet: PopulateSheet, excelRow: number, row: TimesheetRowData, localisation: string) {
  const normal = computeNormalHours(row, localisation);

  // Clear leftover template totals values (esp. rows 42–43) before writing the day.
  clearRow(sheet, excelRow);
  resetToDayRowStyle(sheet, excelRow);

  writeDayDate(sheet, excelRow, row);
  setCellValue(sheet, cellRef(excelRow, COL.day), row.dayLabel);
  setCellValue(sheet, cellRef(excelRow, COL.ws), getTimesheetWsExportValue(row));
  const schedule = scheduleTimesForRow(row, localisation);
  setCellValue(sheet, cellRef(excelRow, COL.asFrom), schedule?.from ?? 'OFF');
  setCellValue(sheet, cellRef(excelRow, COL.asTo), schedule?.to ?? 'OFF');
  const actual = actualTimesForTemplateRow(row, localisation);
  setCellValue(sheet, cellRef(excelRow, COL.actualFrom), actual.from);
  setCellValue(sheet, cellRef(excelRow, COL.actualTo), actual.to);
  setCellValue(sheet, cellRef(excelRow, COL.ordinary), overtimeValue(normal.ordinary));
  setCellValue(sheet, cellRef(excelRow, COL.shift1), overtimeValue(normal.shift1));
  setCellValue(sheet, cellRef(excelRow, COL.shift2), overtimeValue(normal.shift2));
  setCellValue(sheet, cellRef(excelRow, COL.shift3), overtimeValue(normal.shift3));
  setCellValue(sheet, cellRef(excelRow, COL.nightNormal), overtimeValue(normal.night));

  if (isTimesheetWeekend(row.date)) {
    applyWeekendGrayFill(sheet, excelRow);
  }
}

function fillWeekRow(sheet: PopulateSheet, excelRow: number, line: Extract<ExportLine, { kind: 'week' }>) {
  clearRow(sheet, excelRow);
  applyWeekSeparatorStyle(sheet, excelRow);
  setCellValue(sheet, cellRef(excelRow, COL.date), `Semaine ${line.weekIndex + 1}`);
  // Normal hours (H–L) stay empty: Sub-Total / Accumulative formulas sum the day rows.
  setCellValue(sheet, cellRef(excelRow, COL.ot13), overtimeValue(line.ot.ot13));
  setCellValue(sheet, cellRef(excelRow, COL.ot16), overtimeValue(line.ot.ot16));
  setCellValue(sheet, cellRef(excelRow, COL.ot2), overtimeValue(line.ot.ot2));
  setCellValue(sheet, cellRef(excelRow, COL.otNight), overtimeValue(line.ot.night));
}

function clearRow(sheet: PopulateSheet, excelRow: number) {
  for (const col of DATA_COLUMNS) {
    clearCellValue(sheet, cellRef(excelRow, col));
  }
}

async function fillTimesheetSheet(sheet: PopulateSheet, payload: TimesheetExportPayload) {
  // Capture totals chrome BEFORE day rows overwrite template rows 42–43.
  const totalsChrome = captureTotalsChrome(sheet);

  fillTimesheetHeader(sheet, payload);
  const localisation = payload.localisation ?? '';
  const lines = buildExportLines(payload.rows, payload.period.year, payload.period.month);
  await attachWeeklyOt(
    lines,
    payload.period.year,
    payload.period.month,
    payload.department,
    payload.matricule,
  );

  let excelRow = DATA_START_ROW;
  for (const line of lines) {
    if (line.kind === 'day') {
      fillDayRow(sheet, excelRow, line.row, localisation);
    } else {
      fillWeekRow(sheet, excelRow, line);
    }
    excelRow += 1;
  }

  const lastDataRow = excelRow - 1;
  const clearThrough = Math.max(excelRow + 2, TEMPLATE_ACCUMULATIVE_STYLE_ROW + 2, DATA_START_ROW + 56);

  for (let row = excelRow; row <= clearThrough; row += 1) {
    clearRow(sheet, row);
    resetToDayRowStyle(sheet, row);
  }

  fillTotalsRows(sheet, DATA_START_ROW, lastDataRow, excelRow, totalsChrome);
}

/**
 * Sub-Total and Accumulative Total rows use live SUM formulas so they recalculate
 * automatically. Normal-hours columns sum the day rows (week rows are blank there),
 * while overtime columns sum the week rows (day rows are blank there).
 * Styles come from a snapshot of template rows 42 / 43 (black totals chrome).
 */
function fillTotalsRows(
  sheet: PopulateSheet,
  firstDataRow: number,
  lastDataRow: number,
  subtotalRow: number,
  totalsChrome: { subtotal: TotalsChrome; accumulative: TotalsChrome },
) {
  const accumulativeRow = subtotalRow + 1;
  const range = (col: string) => `SUM(${col}${firstDataRow}:${col}${lastDataRow})`;
  const normalCols = [COL.ordinary, COL.shift1, COL.shift2, COL.shift3, COL.nightNormal];
  const otCols = [COL.ot13, COL.ot16, COL.ot2, COL.otNight];

  clearRow(sheet, subtotalRow);
  applyCapturedChrome(sheet, subtotalRow, totalsChrome.subtotal);
  setCellValue(sheet, cellRef(subtotalRow, COL.date), 'Sub-Total');
  for (const col of normalCols) {
    setFormula(sheet, cellRef(subtotalRow, col), range(col));
  }
  for (const col of otCols) {
    setFormula(sheet, cellRef(subtotalRow, col), range(col));
  }

  clearRow(sheet, accumulativeRow);
  applyCapturedChrome(sheet, accumulativeRow, totalsChrome.accumulative);
  setCellValue(sheet, cellRef(accumulativeRow, COL.date), 'Accumulative Total');
  // Accumulative Total carries only the Night + Overtime totals (columns L → P).
  const accumulativeCols = [COL.nightNormal, ...otCols];
  for (const col of accumulativeCols) {
    setFormula(sheet, cellRef(accumulativeRow, col), `${col}${subtotalRow}`);
  }
}

function sanitizeSheetName(name: string, matricule: string): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, '').trim() || 'Employe';
  return `${cleaned}_${matricule}`.slice(0, 31);
}

async function loadTemplateWorkbook() {
  return XlsxPopulate.fromFileAsync(TIMESHEET_TEMPLATE_PATH);
}

export async function buildTimesheetWorkbookBuffer(payload: TimesheetExportPayload): Promise<Buffer> {
  const workbook = await loadTemplateWorkbook();
  const sheet = workbook.sheet(TIMESHEET_SHEET);
  await fillTimesheetSheet(sheet, payload);
  return workbook.outputAsync() as Promise<Buffer>;
}

export async function buildDepartmentTimesheetWorkbookBuffer(
  payload: DepartmentExportPayload,
): Promise<Buffer> {
  if (!payload.employees.length) {
    throw new Error('Aucun employé dans ce département');
  }

  const workbook = await loadTemplateWorkbook();
  const templateSheet = workbook.sheet(TIMESHEET_SHEET);
  workbook.cloneSheet(templateSheet, PRISTINE_SHEET);

  const usedNames = new Set<string>();

  for (const [index, employee] of payload.employees.entries()) {
    let sheetName = sanitizeSheetName(employee.nom, employee.matricule);
    let suffix = 1;
    while (usedNames.has(sheetName)) {
      sheetName = sanitizeSheetName(`${employee.nom}${suffix}`, employee.matricule);
      suffix += 1;
    }
    usedNames.add(sheetName);

    const sheet = index === 0 ? templateSheet : workbook.cloneSheet(workbook.sheet(PRISTINE_SHEET), sheetName);
    if (index === 0) templateSheet.name(sheetName);

    await fillTimesheetSheet(sheet, {
      company: payload.company,
      department: payload.department,
      employeeName: employee.nom,
      matricule: employee.matricule,
      localisation: employee.localisation ?? '',
      period: payload.period,
      rows: employee.rows,
    });
  }

  workbook.deleteSheet(PRISTINE_SHEET);
  return workbook.outputAsync() as Promise<Buffer>;
}
