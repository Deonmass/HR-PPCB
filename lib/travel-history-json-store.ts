import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_TRAVEL_HISTORY_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import { formatDisplayDate } from './xlsx-populate-utils';
import { computeBudgetTotal, computeTripDays } from './travel-form';
import { resolveTravelHistoryPath } from './travel-template-paths';
import { extractTravelDepartmentName } from './travel-history-utils';
import type {
  TravelHistoryDashboard,
  TravelHistoryData,
  TravelHistoryDepartmentStat,
  TravelHistoryMonthlyTripsChart,
  TravelHistoryRow,
} from './travel-history-types';
import type { CashRequestRecord } from './travel-types';
import {
  getSheetBlock,
  readWorkbookForData,
  withExcelLock,
  type AoaRow,
} from './excel-io';

export { resolveTravelHistoryPath };

export const TRAVEL_HISTORY_SHEET = 'BASE VOYAGE';
export const TRAVEL_HISTORY_DATA_START_INDEX = 1;
export const TRAVEL_HISTORY_COLUMN_COUNT = 21;

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

interface TravelHistoryJsonStoreData {
  rows: TravelHistoryRow[];
  nextRowIndex: number;
}

function resolveStorePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'travel', 'history.json');
  }
  const writable = path.join(getWritableDataRoot(), 'travel', 'history.json');
  const bundled = path.join(process.cwd(), 'data', 'travel', 'history.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

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

function formatTravelDates(departureDate: string, returnDate: string): string {
  const departure = formatDisplayDate(departureDate);
  const returnDay = formatDisplayDate(returnDate);
  if (departure && returnDay) return `${departure} → ${returnDay}`;
  return departure || returnDay;
}

async function readJsonFile(fallback: TravelHistoryJsonStoreData): Promise<TravelHistoryJsonStoreData> {
  const storePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_TRAVEL_HISTORY_KEY, storePath);
  try {
    const raw = await fsPromises.readFile(storePath, 'utf8');
    const parsed = JSON.parse(raw) as TravelHistoryJsonStoreData;
    return {
      rows: Array.isArray(parsed.rows) ? parsed.rows : [],
      nextRowIndex: Number(parsed.nextRowIndex) > 0 ? Number(parsed.nextRowIndex) : 1,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(data: TravelHistoryJsonStoreData): Promise<void> {
  const storePath = resolveStorePath();
  await fsPromises.mkdir(path.dirname(storePath), { recursive: true });
  await fsPromises.writeFile(storePath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_TRAVEL_HISTORY_KEY, storePath);
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

async function readLegacyFromExcel(): Promise<TravelHistoryJsonStoreData> {
  const filePath = resolveTravelHistoryPath();
  return withExcelLock(filePath, async () => {
    const wb = await readWorkbookForData(filePath);
    const sheet = getSheetBlock(wb, TRAVEL_HISTORY_SHEET, TRAVEL_HISTORY_DATA_START_INDEX);
    const rows = sheet.dataRows
      .map((row, index) => rowToHistoryItem(row, TRAVEL_HISTORY_DATA_START_INDEX + index))
      .filter((row): row is TravelHistoryRow => row !== null);
    const maxIndex = rows.reduce((max, row) => Math.max(max, row.rowIndex), TRAVEL_HISTORY_DATA_START_INDEX - 1);
    return {
      rows,
      nextRowIndex: maxIndex + 1,
    };
  });
}

async function ensureMigrated(): Promise<void> {
  const storePath = resolveStorePath();
  const exists = await fsPromises.access(storePath).then(() => true).catch(() => false);
  if (exists) return;
  let legacy: TravelHistoryJsonStoreData = { rows: [], nextRowIndex: 1 };
  try {
    legacy = await readLegacyFromExcel();
  } catch {
    // keep empty if Excel unavailable
  }
  await writeJsonFile(legacy);
}

const TRAVEL_MONTH_LABELS = [
  'janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.',
];

function buildCalendarMonths(): TravelHistoryMonthlyTripsChart['months'] {
  return TRAVEL_MONTH_LABELS.map((label, index) => ({
    key: String(index + 1).padStart(2, '0'),
    label,
  }));
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
      parsedDate
      && parsedDate.getMonth() + 1 === currentMonth
      && parsedDate.getFullYear() === currentYear
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

export async function readTravelHistory(): Promise<TravelHistoryData> {
  await ensureMigrated();
  const store = await readJsonFile({ rows: [], nextRowIndex: 1 });
  const rows = [...store.rows].reverse();
  return {
    rows,
    dashboard: buildDashboard(rows),
  };
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

function historyRowFromRecord(record: CashRequestRecord, rowIndex: number): TravelHistoryRow {
  const values = buildHistoryRowValues(record);
  const employeeName = str(values[3]);
  const matricule = str(values[2]);
  const department = str(values[5]);
  const position = str(values[4]);
  const departureDate = str(values[10]);
  const returnDate = str(values[11]);
  return {
    rowIndex,
    date: str(values[0]),
    ref: str(values[1]),
    employee: formatEmployeeLine(employeeName, matricule),
    department: formatDepartmentLine(department, position),
    travelDates: formatTravelDates(departureDate, returnDate),
    tripDays: num(values[12]),
    totalBudget: num(values[20]),
    recordId: record.id || '',
  };
}

export async function deleteTravelHistoryRow(rowIndex: number, missionRef?: string): Promise<void> {
  await ensureMigrated();
  const store = await readJsonFile({ rows: [], nextRowIndex: 1 });
  const index = store.rows.findIndex((row) => row.rowIndex === rowIndex);
  if (index < 0) throw new Error('Ligne historique introuvable');
  const rowRef = store.rows[index].ref;
  const normalizedRef = missionRef?.trim();
  if (normalizedRef && rowRef && rowRef !== normalizedRef) {
    throw new Error('La référence ne correspond pas à la ligne sélectionnée');
  }
  store.rows.splice(index, 1);
  await writeJsonFile(store);
}

/** Restore a full history row snapshot (audit undo / reparateur). */
export async function restoreTravelHistoryRow(snapshot: TravelHistoryRow): Promise<TravelHistoryRow> {
  await ensureMigrated();
  const store = await readJsonFile({ rows: [], nextRowIndex: 1 });
  const row: TravelHistoryRow = {
    rowIndex: Number(snapshot.rowIndex),
    date: str(snapshot.date),
    ref: str(snapshot.ref),
    employee: str(snapshot.employee),
    department: str(snapshot.department),
    travelDates: str(snapshot.travelDates),
    tripDays: num(snapshot.tripDays),
    totalBudget: num(snapshot.totalBudget),
    recordId: str(snapshot.recordId),
  };
  if (!row.ref) throw new Error('Référence mission manquante');
  if (!Number.isInteger(row.rowIndex) || row.rowIndex < 0) {
    throw new Error('Index de ligne invalide pour restauration');
  }

  const byIndex = store.rows.findIndex((item) => item.rowIndex === row.rowIndex);
  const byRef = store.rows.findIndex((item) => item.ref === row.ref);
  if (byIndex >= 0) {
    store.rows[byIndex] = row;
  } else if (byRef >= 0) {
    store.rows[byRef] = row;
  } else {
    store.rows.push(row);
  }
  store.nextRowIndex = Math.max(store.nextRowIndex, row.rowIndex + 1);
  await writeJsonFile(store);
  return row;
}

export async function appendTravelHistoryRow(record: CashRequestRecord): Promise<void> {
  if (!record.missionRef?.trim()) {
    throw new Error('Reference ordre de mission manquante pour historique');
  }
  await ensureMigrated();
  const store = await readJsonFile({ rows: [], nextRowIndex: 1 });
  if (store.rows.some((row) => row.ref === record.missionRef)) return;
  const rowIndex = store.nextRowIndex;
  store.nextRowIndex += 1;
  store.rows.push(historyRowFromRecord(record, rowIndex));
  await writeJsonFile(store);
}
