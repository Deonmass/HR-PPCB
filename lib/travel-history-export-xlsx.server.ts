import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import { listCashRequests } from './cash-request-store';
import type { CashRequestRecord } from './travel-types';
import {
  buildHistoryRowValues,
  readTravelHistory,
  TRAVEL_HISTORY_COLUMN_COUNT,
  TRAVEL_HISTORY_SHEET,
} from './travel-history-store';
import type { TravelHistoryRow } from './travel-history-types';
import { TRAVEL_HISTORY_EXPORT_TEMPLATE_PATH } from './excel-export-template-paths';
import { clearCellValue, setCellValue } from './xlsx-populate-utils';
import type { AoaRow } from './excel-io';

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromFileAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

const HEADER_ROW = 1;
const DATA_START_ROW = 2;

function colLetter(col1Based: number): string {
  let n = col1Based;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function cellAddress(row: number, col1Based: number): string {
  return `${colLetter(col1Based)}${row}`;
}

function parseEmployeeLine(employee: string): { name: string; matricule: string } {
  const match = employee.match(/^(.*)\((\d+)\)\s*$/);
  if (match) {
    return { name: match[1].trim(), matricule: match[2] };
  }
  return { name: employee.trim(), matricule: '' };
}

function parseDepartmentLine(department: string): { department: string; position: string } {
  const parts = department.split('—').map((part) => part.trim());
  if (parts.length >= 2) {
    return { department: parts[0] ?? '', position: parts.slice(1).join(' — ') };
  }
  return { department: department.trim(), position: '' };
}

function parseTravelDates(travelDates: string): { departure: string; returnDate: string } {
  const parts = travelDates.split('→').map((part) => part.trim());
  if (parts.length >= 2) {
    return { departure: parts[0] ?? '', returnDate: parts[1] ?? '' };
  }
  return { departure: travelDates.trim(), returnDate: '' };
}

function summaryRowToValues(row: TravelHistoryRow): AoaRow {
  const { name, matricule } = parseEmployeeLine(row.employee);
  const { department, position } = parseDepartmentLine(row.department);
  const { departure, returnDate } = parseTravelDates(row.travelDates);
  const values: AoaRow = Array.from({ length: TRAVEL_HISTORY_COLUMN_COUNT }, () => '');
  values[0] = row.date;
  values[1] = row.ref;
  values[2] = matricule;
  values[3] = name;
  values[4] = position;
  values[5] = department;
  values[10] = departure;
  values[11] = returnDate;
  values[12] = row.tripDays || '';
  values[20] = row.totalBudget || '';
  return values;
}

async function collectExportRows(): Promise<AoaRow[]> {
  const [history, cashRequests] = await Promise.all([
    readTravelHistory(),
    listCashRequests(),
  ]);

  const byRef = new Map<string, CashRequestRecord>();
  const byId = new Map<string, CashRequestRecord>();
  for (const record of cashRequests) {
    const ref = record.missionRef?.trim();
    if (ref) byRef.set(ref, record);
    if (record.id) byId.set(record.id, record);
  }

  const usedRefs = new Set<string>();
  const rows: AoaRow[] = [];

  // Chronological (oldest first) like the Excel template
  const historyRows = [...history.rows].reverse();
  for (const row of historyRows) {
    const record =
      (row.ref ? byRef.get(row.ref) : undefined) ??
      (row.recordId ? byId.get(row.recordId) : undefined);
    if (record?.missionRef?.trim()) {
      usedRefs.add(record.missionRef.trim());
      rows.push(buildHistoryRowValues(record));
      continue;
    }
    if (row.ref.trim()) {
      usedRefs.add(row.ref.trim());
      rows.push(summaryRowToValues(row));
    }
  }

  // Missions present in cash-requests but not yet in history.json
  const orphans = cashRequests
    .filter((record) => {
      const ref = record.missionRef?.trim();
      return Boolean(ref && record.travel && !usedRefs.has(ref));
    })
    .sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );

  for (const record of orphans) {
    rows.push(buildHistoryRowValues(record));
  }

  return rows;
}

function clearDataRows(sheet: PopulateSheet, fromRow: number, toRow: number): void {
  for (let row = fromRow; row <= toRow; row += 1) {
    for (let col = 1; col <= TRAVEL_HISTORY_COLUMN_COUNT; col += 1) {
      clearCellValue(sheet, cellAddress(row, col));
    }
  }
}

function writeDataRows(sheet: PopulateSheet, rows: AoaRow[]): void {
  const used = sheet.usedRange();
  const previousLast = used ? used.endCell().rowNumber() : DATA_START_ROW - 1;
  const clearThrough = Math.max(previousLast, DATA_START_ROW + rows.length - 1, DATA_START_ROW);
  clearDataRows(sheet, DATA_START_ROW, clearThrough);

  rows.forEach((values, index) => {
    const row = DATA_START_ROW + index;
    for (let col = 0; col < TRAVEL_HISTORY_COLUMN_COUNT; col += 1) {
      const value = values[col];
      if (value === undefined || value === null || value === '') continue;
      setCellValue(sheet, cellAddress(row, col + 1), value);
    }
  });
}

export async function buildTravelHistoryWorkbookBuffer(): Promise<Buffer> {
  const templatePath = TRAVEL_HISTORY_EXPORT_TEMPLATE_PATH;
  if (!fs.existsSync(templatePath)) {
    throw new Error(
      `Template introuvable : ${templatePath}. Placez Historique mission.xlsx dans Excel/templates/travel/.`,
    );
  }

  const rows = await collectExportRows();
  const workbook = await XlsxPopulate.fromFileAsync(templatePath);
  const sheet = workbook.sheet(TRAVEL_HISTORY_SHEET);
  if (!sheet) {
    throw new Error(`Feuille « ${TRAVEL_HISTORY_SHEET} » introuvable dans Historique mission.xlsx`);
  }

  // Keep header row / styles from template as-is
  if (!sheet.cell(HEADER_ROW, 1).value()) {
    throw new Error('En-têtes manquants dans le template Historique mission.xlsx');
  }

  writeDataRows(sheet, rows);
  return Buffer.from(await workbook.outputAsync());
}
