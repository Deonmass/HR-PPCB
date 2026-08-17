import 'server-only';

import XlsxPopulate from 'xlsx-populate';
import { TIMESHEET_TEMPLATE_PATH as RESOLVED_TIMESHEET_TEMPLATE_PATH } from './excel-export-template-paths';
import { actualTimesForTemplateRow } from './timesheet-template-view';
import { shouldGrayTimesheetTemplateRow } from './timesheet-off-day';
import { normalHoursBreakdown } from './timesheet-calc';
import type { DepartmentExportPayload, TimesheetExportPayload } from './timesheet-export';
import { formatTimesheetMonthLabel, overtimeWeekInsertsAfterRow } from './timesheet-period';
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
const OFF_ROW_FILL_REF = 'A6';
const PRISTINE_SHEET = '__TIMESHEET_TEMPLATE__';
const WEEK_SEPARATOR_FILL = 'F4CCCC';

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

function toExportDate(value: Date | string): Date {
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date(`${String(value).slice(0, 10)}T12:00:00`);
}

function applyOffRowGrayFill(sheet: PopulateSheet, excelRow: number) {
  const grayFill = sheet.cell(OFF_ROW_FILL_REF).style('fill');
  for (const col of ROW_COLUMNS) {
    sheet.cell(cellRef(excelRow, col)).style('fill', grayFill);
  }
}

function applyWeekSeparatorStyle(sheet: PopulateSheet, excelRow: number) {
  for (const col of ROW_COLUMNS) {
    sheet.cell(cellRef(excelRow, col)).style({
      fill: WEEK_SEPARATOR_FILL,
      fontColor: '000000',
      bold: true,
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

  setCellValue(sheet, cellRef(excelRow, COL.date), toExportDate(row.date));
  setCellValue(sheet, cellRef(excelRow, COL.day), row.dayLabel);
  setCellValue(sheet, cellRef(excelRow, COL.ws), getTimesheetWsExportValue(row));
  setCellValue(sheet, cellRef(excelRow, COL.asFrom), AS_PER_WS_FROM);
  setCellValue(sheet, cellRef(excelRow, COL.asTo), AS_PER_WS_TO);
  const actual = actualTimesForTemplateRow(row, localisation);
  setCellValue(sheet, cellRef(excelRow, COL.actualFrom), actual.from);
  setCellValue(sheet, cellRef(excelRow, COL.actualTo), actual.to);
  setCellValue(sheet, cellRef(excelRow, COL.ordinary), overtimeValue(normal.ordinary));
  setCellValue(sheet, cellRef(excelRow, COL.shift1), overtimeValue(normal.shift1));
  setCellValue(sheet, cellRef(excelRow, COL.shift2), overtimeValue(normal.shift2));
  setCellValue(sheet, cellRef(excelRow, COL.shift3), overtimeValue(normal.shift3));
  setCellValue(sheet, cellRef(excelRow, COL.nightNormal), overtimeValue(normal.night));

  if (shouldGrayTimesheetTemplateRow(row)) {
    applyOffRowGrayFill(sheet, excelRow);
  }
}

function fillWeekRow(sheet: PopulateSheet, excelRow: number, line: Extract<ExportLine, { kind: 'week' }>) {
  applyWeekSeparatorStyle(sheet, excelRow);
  setCellValue(sheet, cellRef(excelRow, COL.date), `Semaine ${line.weekIndex + 1}`);
  // Normal hours (H–L) are left empty: the Sub-Total/Accumulative formulas sum the day rows.
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

  for (let row = excelRow; row < DATA_START_ROW + 56; row += 1) {
    clearRow(sheet, row);
  }

  fillTotalsRows(sheet, DATA_START_ROW, lastDataRow, excelRow);
}

/**
 * Sub-Total and Accumulative Total rows use live SUM formulas so they recalculate
 * automatically. Normal-hours columns sum the day rows (week rows are blank there),
 * while overtime columns sum the week rows (day rows are blank there).
 */
function fillTotalsRows(
  sheet: PopulateSheet,
  firstDataRow: number,
  lastDataRow: number,
  subtotalRow: number,
) {
  const accumulativeRow = subtotalRow + 1;
  const range = (col: string) => `SUM(${col}${firstDataRow}:${col}${lastDataRow})`;
  const normalCols = [COL.ordinary, COL.shift1, COL.shift2, COL.shift3, COL.nightNormal];
  const otCols = [COL.ot13, COL.ot16, COL.ot2, COL.otNight];

  setCellValue(sheet, cellRef(subtotalRow, COL.date), 'Sub-Total');
  for (const col of normalCols) {
    setFormula(sheet, cellRef(subtotalRow, col), range(col));
  }
  for (const col of otCols) {
    setFormula(sheet, cellRef(subtotalRow, col), range(col));
  }

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
