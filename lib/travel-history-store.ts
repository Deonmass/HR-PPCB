import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import XLSX from 'xlsx-js-style';
import {
  cloneRowStyle,
  getSheet,
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  withExcelLock,
  writeRowValues,
  type AoaRow,
} from './excel-io';
import { formatDisplayDate } from './xlsx-populate-utils';
import { computeBudgetTotal, computeTripDays } from './travel-form';
import { resolveTravelHistoryPath } from './travel-template-paths';
import {
  formatMissionRef,
  nextMissionSequence,
} from './travel-mission-ref';

export { resolveTravelHistoryPath };

import type {
  TravelHistoryDashboard,
  TravelHistoryData,
  TravelHistoryDepartmentStat,
  TravelHistoryMonthlyTripsChart,
  TravelHistoryRow,
} from './travel-history-types';
import type { CashRequestRecord } from './travel-types';

export const TRAVEL_HISTORY_SHEET = 'BASE VOYAGE';
export const TRAVEL_HISTORY_DATA_START_INDEX = 1;
export const TRAVEL_HISTORY_COLUMN_COUNT = 21;

/** Colonnes alignées sur Historique mission.xlsx — feuille BASE VOYAGE */
export const TRAVEL_HISTORY_COLUMNS = {
  date: 0,
  ref: 1,
  matricule: 2,
  employeeName: 3,
  position: 4,
  department: 5,
  costCenter: 6,
  companyName: 7,
  tripPurpose: 8,
  documentDate: 9,
  departureDate: 10,
  returnDate: 11,
  days: 12,
  peopleCount: 13,
  departurePlace: 14,
  destinationPlace: 15,
  departmentToWorkWith: 16,
  contactPerson: 17,
  transportMeans: 18,
  paymentOrderSignatory: 19,
  budgetTotal: 20,
} as const;

const DATA_BORDER = {
  top: { style: 'thin', color: { rgb: '000000' } },
  bottom: { style: 'thin', color: { rgb: '000000' } },
  left: { style: 'thin', color: { rgb: '000000' } },
  right: { style: 'thin', color: { rgb: '000000' } },
};

const DATA_STYLE = {
  alignment: { vertical: 'center', wrapText: true },
  border: DATA_BORDER,
};

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatEmployeeLine(name: string, matricule: string): string {
  const trimmedName = name.trim();
  const trimmedMatricule = matricule.trim();
  return trimmedMatricule ? `${trimmedName} (${trimmedMatricule})` : trimmedName;
}

function formatDepartmentLine(department: string, position: string): string {
  const dept = department.trim();
  const pos = position.trim();
  if (dept && pos) return `${dept} — ${pos}`;
  return dept || pos;
}

import { extractTravelDepartmentName } from './travel-history-utils';

function formatTravelDates(departureDate: string, returnDate: string): string {
  const departure = formatDisplayDate(departureDate);
  const returnDay = formatDisplayDate(returnDate);
  if (departure && returnDay) return `${departure} → ${returnDay}`;
  return departure || returnDay;
}

function applyDataRowStyle(ws: XLSX.WorkSheet, rowIndex: number): void {
  for (let col = 0; col < TRAVEL_HISTORY_COLUMN_COUNT; col += 1) {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c: col });
    const existing = ws[addr] as XLSX.CellObject | undefined;
    ws[addr] = {
      ...(existing || { t: 'z' }),
      s: {
        ...(existing?.s || {}),
        ...DATA_STYLE,
      },
    };
  }
}

async function ensureHistoryWorkbook(): Promise<string> {
  const preferred = resolveTravelHistoryPath();
  try {
    await fs.access(preferred);
    return preferred;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    throw new Error(
      `Fichier historique introuvable : ${preferred}` +
        (code === 'ENOENT'
          ? '. Vérifiez TRAVEL_HISTORY_XLSX ou placez Historique mission.xlsx dans Excel/voyage template.'
          : ''),
    );
  }
}

function rowToHistoryItem(row: AoaRow, rowIndex: number): TravelHistoryRow | null {
  const ref = str(row[TRAVEL_HISTORY_COLUMNS.ref]);
  if (!ref) return null;

  const employeeName = str(row[TRAVEL_HISTORY_COLUMNS.employeeName]);
  const matricule = str(row[TRAVEL_HISTORY_COLUMNS.matricule]);
  const department = str(row[TRAVEL_HISTORY_COLUMNS.department]);
  const position = str(row[TRAVEL_HISTORY_COLUMNS.position]);
  const departureDate = str(row[TRAVEL_HISTORY_COLUMNS.departureDate]);
  const returnDate = str(row[TRAVEL_HISTORY_COLUMNS.returnDate]);

  return {
    rowIndex,
    date: str(row[TRAVEL_HISTORY_COLUMNS.date]),
    ref,
    employee: formatEmployeeLine(employeeName, matricule),
    department: formatDepartmentLine(department, position),
    travelDates: formatTravelDates(departureDate, returnDate),
    tripDays: num(row[TRAVEL_HISTORY_COLUMNS.days]),
    totalBudget: num(row[TRAVEL_HISTORY_COLUMNS.budgetTotal]),
    recordId: '',
  };
}

function findNextEmptyRow(dataRows: AoaRow[]): number {
  const firstEmpty = dataRows.findIndex((row) => !str(row[TRAVEL_HISTORY_COLUMNS.ref]));
  if (firstEmpty >= 0) return TRAVEL_HISTORY_DATA_START_INDEX + firstEmpty;
  return TRAVEL_HISTORY_DATA_START_INDEX + dataRows.length;
}

function collectExcelRefs(dataRows: AoaRow[]): string[] {
  return dataRows.map((row) => str(row[TRAVEL_HISTORY_COLUMNS.ref])).filter(Boolean);
}

async function collectAllExistingRefs(dataRows: AoaRow[]): Promise<string[]> {
  const excelRefs = collectExcelRefs(dataRows);
  try {
    const jsonPath = path.join(process.cwd(), 'data', 'travel', 'cash-requests.json');
    const raw = await fs.readFile(jsonPath, 'utf8');
    const json = JSON.parse(raw) as { cashRequests?: Array<{ missionRef?: string }> };
    const jsonRefs = (json.cashRequests ?? [])
      .map((item) => str(item.missionRef))
      .filter(Boolean);
    return [...new Set([...excelRefs, ...jsonRefs])];
  } catch {
    return excelRefs;
  }
}

const TRAVEL_MONTH_LABELS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function buildCalendarMonths(): TravelHistoryMonthlyTripsChart['months'] {
  return TRAVEL_MONTH_LABELS.map((label, index) => ({
    key: String(index + 1).padStart(2, '0'),
    label,
  }));
}

function buildMonthlyTripsChart(rows: TravelHistoryRow[]): TravelHistoryMonthlyTripsChart {
  const months = buildCalendarMonths();
  const yearSet = new Set<number>();

  for (const row of rows) {
    const parsedDate = parseHistoryDate(row.date);
    if (parsedDate) yearSet.add(parsedDate.getFullYear());
  }

  const years = [...yearSet].sort((a, b) => b - a);
  if (!years.length) years.push(new Date().getFullYear());

  const byYear: TravelHistoryMonthlyTripsChart['byYear'] = {};

  for (const year of years) {
    const countsByMonth = new Map<string, Map<string, number>>();
    const departmentSet = new Set<string>();

    for (const row of rows) {
      const parsedDate = parseHistoryDate(row.date);
      if (!parsedDate || parsedDate.getFullYear() !== year) continue;

      const monthKey = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const department = extractTravelDepartmentName(row.department);
      departmentSet.add(department);

      const monthCounts = countsByMonth.get(monthKey) ?? new Map<string, number>();
      monthCounts.set(department, (monthCounts.get(department) ?? 0) + 1);
      countsByMonth.set(monthKey, monthCounts);
    }

    byYear[year] = [...departmentSet]
      .sort((a, b) => a.localeCompare(b, 'fr'))
      .map((department) => ({
        department,
        values: months.map((month) => countsByMonth.get(month.key)?.get(department) ?? 0),
      }));
  }

  return { years, months, byYear };
}

function buildDashboard(rows: TravelHistoryRow[]): TravelHistoryDashboard {
  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const departmentMap = new Map<string, TravelHistoryDepartmentStat>();
  let tripsThisMonth = 0;
  let budgetThisMonth = 0;

  for (const row of rows) {
    const deptKey = extractTravelDepartmentName(row.department);
    const existing = departmentMap.get(deptKey) ?? { department: deptKey, count: 0, budget: 0 };
    existing.count += 1;
    existing.budget += row.totalBudget;
    departmentMap.set(deptKey, existing);

    const parsedDate = parseHistoryDate(row.date);
    if (
      parsedDate &&
      parsedDate.getMonth() + 1 === currentMonth &&
      parsedDate.getFullYear() === currentYear
    ) {
      tripsThisMonth += 1;
      budgetThisMonth += row.totalBudget;
    }
  }

  const totalBudget = rows.reduce((sum, row) => sum + row.totalBudget, 0);
  const departments = [...departmentMap.values()].sort((a, b) => b.budget - a.budget);

  return {
    totalTrips: rows.length,
    totalBudget,
    averageBudget: rows.length > 0 ? totalBudget / rows.length : 0,
    tripsThisMonth,
    budgetThisMonth,
    departments,
    monthlyTrips: buildMonthlyTripsChart(rows),
  };
}

function parseHistoryDate(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const date = new Date(`${trimmed.slice(0, 10)}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const frMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (frMatch) {
    const date = new Date(
      `${frMatch[3]}-${frMatch[2].padStart(2, '0')}-${frMatch[1].padStart(2, '0')}T00:00:00`,
    );
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function loadHistoryState(filePath: string) {
  const wb = await readWorkbook(filePath);
  const ws = getSheet(wb, TRAVEL_HISTORY_SHEET);
  const sheet = getSheetBlock(wb, TRAVEL_HISTORY_SHEET, TRAVEL_HISTORY_DATA_START_INDEX);
  return { filePath, wb, ws, dataRows: sheet.dataRows };
}

export async function previewNextMissionRef(date: Date = new Date()): Promise<string> {
  const filePath = await ensureHistoryWorkbook();
  return withExcelLock(filePath, async () => {
    const state = await loadHistoryState(filePath);
    const refs = await collectAllExistingRefs(state.dataRows);
    const sequence = nextMissionSequence(refs, date);
    return formatMissionRef(sequence, date);
  });
}

export async function allocateMissionRef(date: Date = new Date()): Promise<string> {
  return previewNextMissionRef(date);
}

export async function readTravelHistory(): Promise<TravelHistoryData> {
  const filePath = await ensureHistoryWorkbook();
  return withExcelLock(filePath, async () => {
    const state = await loadHistoryState(filePath);
    const rows = state.dataRows
      .map((row, index) => rowToHistoryItem(row, TRAVEL_HISTORY_DATA_START_INDEX + index))
      .filter((row): row is TravelHistoryRow => row !== null)
      .reverse();
    return {
      rows,
      dashboard: buildDashboard(rows),
    };
  });
}

export function buildHistoryRowValues(record: CashRequestRecord): AoaRow {
  const travel = record.travel;
  const tripDays = travel
    ? computeTripDays(travel.departureDate, travel.returnDate)
    : 0;
  const totalBudget = travel
    ? computeBudgetTotal(travel.budgetLines, travel.peopleCount, tripDays)
    : record.total;

  const createdAt = new Date(record.createdAt);
  const dateValue = Number.isNaN(createdAt.getTime())
    ? record.requestDate
    : createdAt.toISOString().slice(0, 10);

  return [
    dateValue,
    record.missionRef || '',
    record.employeeMatricule,
    record.employeeName,
    travel?.position || '',
    travel?.department || record.employeeDepartment,
    travel?.costCenter || record.costCenter,
    travel?.companyName || '',
    travel?.tripPurpose || record.objet,
    travel?.documentDate || record.requestDate,
    travel?.departureDate || '',
    travel?.returnDate || '',
    tripDays,
    travel?.peopleCount || 1,
    travel?.departurePlace || '',
    travel?.destinationPlace || '',
    travel?.departmentToWorkWith || '',
    travel?.contactPerson || '',
    travel?.transportMeans || '',
    travel?.paymentOrderSignatory || '',
    totalBudget,
  ];
}

export async function deleteTravelHistoryRow(rowIndex: number, missionRef?: string): Promise<void> {
  const filePath = await ensureHistoryWorkbook();
  await withExcelLock(filePath, async () => {
    const state = await loadHistoryState(filePath);
    const sheetRowIndex = rowIndex - TRAVEL_HISTORY_DATA_START_INDEX;
    if (sheetRowIndex < 0 || sheetRowIndex >= state.dataRows.length) {
      throw new Error('Ligne historique introuvable');
    }

    const rowRef = str(state.dataRows[sheetRowIndex][TRAVEL_HISTORY_COLUMNS.ref]);
    const normalizedRef = missionRef?.trim();
    if (normalizedRef && rowRef && rowRef !== normalizedRef) {
      throw new Error('La référence ne correspond pas à la ligne sélectionnée');
    }

    const emptyRow = Array.from({ length: TRAVEL_HISTORY_COLUMN_COUNT }, () => '');
    writeRowValues(state.ws, rowIndex, emptyRow);
    await saveWorkbook(state.wb, state.filePath);
  });
}

export async function appendTravelHistoryRow(record: CashRequestRecord): Promise<void> {
  if (!record.missionRef?.trim()) {
    throw new Error('Reference ordre de mission manquante pour historique');
  }

  const filePath = await ensureHistoryWorkbook();
  await withExcelLock(filePath, async () => {
    const state = await loadHistoryState(filePath);
    const excelRefs = collectExcelRefs(state.dataRows);
    if (excelRefs.some((ref) => ref === record.missionRef)) return;

    const targetRowIndex = findNextEmptyRow(state.dataRows);
    const styleSourceRow =
      targetRowIndex > TRAVEL_HISTORY_DATA_START_INDEX ? targetRowIndex - 1 : 0;
    cloneRowStyle(
      state.ws,
      styleSourceRow,
      targetRowIndex,
      0,
      TRAVEL_HISTORY_COLUMN_COUNT - 1,
    );
    writeRowValues(state.ws, targetRowIndex, buildHistoryRowValues(record));
    applyDataRowStyle(state.ws, targetRowIndex);
    await saveWorkbook(state.wb, state.filePath);
  });
}
