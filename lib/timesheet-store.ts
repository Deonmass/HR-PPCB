import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx-js-style';
import { OVERTIMES_DATA_XLSX_PATH } from './excel-overtimes-paths';
import {
  OVERTIMES_DATA_SCHEMA_VERSION,
  OVERTIMES_DATA_SHEET,
  OVERTIMES_DATA_START,
  OVERTIMES_META_SHEET,
  OVERTIMES_PLANNING_SHEET,
  PLAN_COL,
  PLAN_COLS_WIDTHS,
  PLAN_HEADERS,
  PLAN_LAST_COL,
  OT_HEADERS,
  OT_WEEK_COLS_WIDTHS,
} from './overtimes-data-columns';
import {
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  withExcelLock,
  type AoaRow,
} from './excel-io';
import type { TimesheetDayEntry, TimesheetShiftType } from './timesheet-types';

const EXCEL_PATH = OVERTIMES_DATA_XLSX_PATH;
const LEGACY_JSON_PATH = path.join(process.cwd(), 'data', 'timesheet', 'entries.json');
const LEGACY_JSON_BAK = path.join(process.cwd(), 'data', 'timesheet', 'entries.json.bak');

export interface TimesheetPeriodStore {
  days: Record<string, Record<string, TimesheetDayEntry>>;
}

export interface TimesheetEntriesData {
  periods: Record<string, TimesheetPeriodStore>;
}

function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(str(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function weekdayLabel(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return '';
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] ?? '';
}

function parseEntriesCell(value: unknown): Record<string, TimesheetDayEntry> {
  const raw = str(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? Object.values(parsed as Record<string, unknown>)
        : [];
    const entries: Record<string, TimesheetDayEntry> = {};
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Partial<TimesheetDayEntry>;
      const matricule = str(row.matricule);
      if (!matricule) continue;
      const from = str(row.from);
      const to = str(row.to);
      entries[matricule] = {
        matricule,
        present: Boolean(from && to),
        from,
        to,
        shiftType: (row.shiftType as TimesheetShiftType | null) ?? null,
        holiday: Boolean(row.holiday),
        updatedAt: row.updatedAt ? str(row.updatedAt) : undefined,
        updatedBy: row.updatedBy ? str(row.updatedBy) : undefined,
      };
    }
    return entries;
  } catch {
    return {};
  }
}

function serializeEntriesCell(entries: Record<string, TimesheetDayEntry>): string {
  const list = Object.values(entries)
    .map((e) => ({
      matricule: e.matricule,
      present: e.present,
      from: e.from,
      to: e.to,
      shiftType: e.shiftType,
      holiday: Boolean(e.holiday),
      updatedAt: e.updatedAt,
      updatedBy: e.updatedBy,
    }))
    .sort((a, b) => a.matricule.localeCompare(b.matricule, 'fr'));
  return JSON.stringify(list);
}

function rowToDay(row: AoaRow): {
  year: number;
  month: number;
  dateKey: string;
  entries: Record<string, TimesheetDayEntry>;
  updatedAt?: string;
  updatedBy?: string;
} | null {
  const year = num(row[PLAN_COL.year]);
  const month = num(row[PLAN_COL.month]);
  const dateKey = str(row[PLAN_COL.dateKey]);
  if (!year || !month || !dateKey) return null;
  const updatedAt = str(row[PLAN_COL.updatedAt]) || undefined;
  const updatedBy = str(row[PLAN_COL.updatedBy]) || undefined;
  return {
    year,
    month,
    dateKey,
    entries: parseEntriesCell(row[PLAN_COL.entries]),
    updatedAt,
    updatedBy,
  };
}

function dayToRow(
  year: number,
  month: number,
  dateKey: string,
  entries: Record<string, TimesheetDayEntry>,
): AoaRow {
  let updatedAt = '';
  let updatedBy = '';
  for (const entry of Object.values(entries)) {
    if (entry.updatedAt && entry.updatedAt > updatedAt) {
      updatedAt = entry.updatedAt;
      updatedBy = entry.updatedBy ?? '';
    }
  }
  return [
    year,
    month,
    dateKey,
    weekdayLabel(dateKey),
    updatedAt,
    updatedBy,
    serializeEntriesCell(entries),
  ];
}

function dataFromRows(dataRows: AoaRow[]): TimesheetEntriesData {
  const data: TimesheetEntriesData = { periods: {} };
  for (const row of dataRows) {
    const parsed = rowToDay(row);
    if (!parsed || Object.keys(parsed.entries).length === 0) continue;
    const key = periodKey(parsed.year, parsed.month);
    if (!data.periods[key]) data.periods[key] = { days: {} };
    data.periods[key].days[parsed.dateKey] = parsed.entries;
  }
  return data;
}

function flattenData(
  data: TimesheetEntriesData,
): Array<{ year: number; month: number; dateKey: string; entries: Record<string, TimesheetDayEntry> }> {
  const out: Array<{
    year: number;
    month: number;
    dateKey: string;
    entries: Record<string, TimesheetDayEntry>;
  }> = [];

  for (const [pKey, period] of Object.entries(data.periods)) {
    const [y, m] = pKey.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
    for (const [dateKey, entries] of Object.entries(period.days)) {
      if (!Object.keys(entries).length) continue;
      out.push({ year: y, month: m, dateKey, entries });
    }
  }

  out.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    return a.dateKey.localeCompare(b.dateKey);
  });
  return out;
}

function ensureSheetNames(wb: XLSX.WorkBook): void {
  const order = [OVERTIMES_DATA_SHEET, OVERTIMES_PLANNING_SHEET, OVERTIMES_META_SHEET];
  for (const name of order) {
    if (!wb.SheetNames.includes(name)) wb.SheetNames.push(name);
  }
  // Keep weeks / planning / meta first if present
  wb.SheetNames = [
    ...order.filter((n) => wb.Sheets[n]),
    ...wb.SheetNames.filter((n) => !order.includes(n)),
  ];
}

function ensurePlanningSheet(wb: XLSX.WorkBook): void {
  if (!wb.Sheets[OVERTIMES_PLANNING_SHEET]) {
    const ws = XLSX.utils.aoa_to_sheet([PLAN_HEADERS.slice()]);
    ws['!cols'] = PLAN_COLS_WIDTHS.map((c) => ({ ...c }));
    wb.Sheets[OVERTIMES_PLANNING_SHEET] = ws;
  }
  if (!wb.Sheets[OVERTIMES_DATA_SHEET]) {
    const ws = XLSX.utils.aoa_to_sheet([OT_HEADERS.slice()]);
    ws['!cols'] = OT_WEEK_COLS_WIDTHS.map((c) => ({ ...c }));
    wb.Sheets[OVERTIMES_DATA_SHEET] = ws;
  }
  if (!wb.Sheets[OVERTIMES_META_SHEET]) {
    wb.Sheets[OVERTIMES_META_SHEET] = XLSX.utils.aoa_to_sheet([
      ['key', 'value'],
      ['schemaVersion', OVERTIMES_DATA_SCHEMA_VERSION],
    ]);
  }
  ensureSheetNames(wb);
}

async function loadLegacyJson(): Promise<TimesheetEntriesData | null> {
  for (const candidate of [LEGACY_JSON_PATH, LEGACY_JSON_BAK]) {
    try {
      const raw = await fsPromises.readFile(candidate, 'utf8');
      const json = JSON.parse(raw) as TimesheetEntriesData;
      return { periods: json.periods ?? {} };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }
  return null;
}

async function ensureWorkbookReady(): Promise<void> {
  fs.mkdirSync(path.dirname(EXCEL_PATH), { recursive: true });

  if (!fs.existsSync(EXCEL_PATH)) {
    const wb = XLSX.utils.book_new();
    ensurePlanningSheet(wb);
    const legacy = await loadLegacyJson();
    if (legacy && Object.keys(legacy.periods).length > 0) {
      const flat = flattenData(legacy);
      wb.Sheets[OVERTIMES_PLANNING_SHEET] = XLSX.utils.aoa_to_sheet([
        PLAN_HEADERS.slice(),
        ...flat.map((item) => dayToRow(item.year, item.month, item.dateKey, item.entries)),
      ]);
      (wb.Sheets[OVERTIMES_PLANNING_SHEET] as XLSX.WorkSheet)['!cols'] = PLAN_COLS_WIDTHS.map((c) => ({ ...c }));
      try {
        if (fs.existsSync(LEGACY_JSON_PATH)) {
          await fsPromises.copyFile(LEGACY_JSON_PATH, LEGACY_JSON_BAK);
        }
      } catch {
        // best-effort
      }
    }
    await saveWorkbook(wb, EXCEL_PATH);
    return;
  }

  // Workbook existant : garantir la structure des feuilles uniquement.
  // Ne jamais réimporter entries.json si l'utilisateur a vidé planning dans Excel.
  await withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    const sheetNamesBefore = [...wb.SheetNames];
    ensurePlanningSheet(wb);
    const structureChanged =
      sheetNamesBefore.length !== wb.SheetNames.length
      || !sheetNamesBefore.includes(OVERTIMES_PLANNING_SHEET)
      || !sheetNamesBefore.includes(OVERTIMES_DATA_SHEET)
      || !sheetNamesBefore.includes(OVERTIMES_META_SHEET);

    if (structureChanged) {
      await saveWorkbook(wb, EXCEL_PATH);
    }
  });
}

async function readData(): Promise<TimesheetEntriesData> {
  await ensureWorkbookReady();
  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    ensurePlanningSheet(wb);
    const sheet = getSheetBlock(wb, OVERTIMES_PLANNING_SHEET, OVERTIMES_DATA_START, {
      keyCol: PLAN_COL.dateKey,
      emptyStreakLimit: 3,
      maxCols: PLAN_LAST_COL,
    });
    return dataFromRows(sheet.dataRows);
  });
}

async function writeData(data: TimesheetEntriesData): Promise<void> {
  await ensureWorkbookReady();
  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    ensurePlanningSheet(wb);

    const flat = flattenData(data);
    const planningWs = XLSX.utils.aoa_to_sheet([
      PLAN_HEADERS.slice(),
      ...flat.map((item) => dayToRow(item.year, item.month, item.dateKey, item.entries)),
    ]);
    planningWs['!cols'] = PLAN_COLS_WIDTHS.map((c) => ({ ...c }));
    wb.Sheets[OVERTIMES_PLANNING_SHEET] = planningWs;

    // Mettre à jour meta sans toucher à weeks
    wb.Sheets[OVERTIMES_META_SHEET] = XLSX.utils.aoa_to_sheet([
      ['key', 'value'],
      ['schemaVersion', OVERTIMES_DATA_SCHEMA_VERSION],
      ['updatedAt', new Date().toISOString()],
      ['source', 'app-planning'],
      ['planningRowCount', flat.length],
    ]);
    ensureSheetNames(wb);
    await saveWorkbook(wb, EXCEL_PATH);
  });
}

function normalizeEntry(entry: Partial<TimesheetDayEntry> & { matricule: string }): TimesheetDayEntry {
  const from = entry.from?.trim() ?? '';
  const to = entry.to?.trim() ?? '';
  const present = Boolean(from && to);
  return {
    matricule: entry.matricule,
    present,
    from,
    to,
    shiftType: entry.shiftType ?? null,
    holiday: Boolean(entry.holiday),
    updatedAt: entry.updatedAt,
    updatedBy: entry.updatedBy,
  };
}

function isActiveEntry(entry: TimesheetDayEntry): boolean {
  return Boolean(entry.from?.trim() && entry.to?.trim());
}

function shouldPersistEntry(entry: TimesheetDayEntry): boolean {
  return isActiveEntry(entry) || entry.shiftType !== null || Boolean(entry.holiday);
}

function isConfiguredEntry(entry: TimesheetDayEntry): boolean {
  return entry.shiftType !== null && entry.shiftType !== undefined;
}

export async function getDepartmentCalendarStatus(
  year: number,
  month: number,
  departmentMatricules: Set<string>,
): Promise<{ savedDateKeys: string[]; completeDateKeys: string[]; planningCompleteDateKeys: string[] }> {
  const total = departmentMatricules.size;
  if (!total) return { savedDateKeys: [], completeDateKeys: [], planningCompleteDateKeys: [] };

  const data = await readData();
  const key = periodKey(year, month);
  const days = data.periods[key]?.days ?? {};

  const savedDateKeys: string[] = [];
  const completeDateKeys: string[] = [];
  const planningCompleteDateKeys: string[] = [];

  for (const [dateKey, dayEntries] of Object.entries(days)) {
    let configuredCount = 0;
    let activeCount = 0;
    let hasProgress = false;

    for (const matricule of departmentMatricules) {
      const entry = dayEntries[matricule];
      if (!entry) continue;
      if (isConfiguredEntry(entry)) configuredCount += 1;
      if (isActiveEntry(entry)) activeCount += 1;
      if (isConfiguredEntry(entry) || isActiveEntry(entry)) hasProgress = true;
    }

    if (configuredCount === total) planningCompleteDateKeys.push(dateKey);
    if (configuredCount === total || activeCount === total) {
      completeDateKeys.push(dateKey);
    } else if (hasProgress) {
      savedDateKeys.push(dateKey);
    }
  }

  return { savedDateKeys, completeDateKeys, planningCompleteDateKeys };
}

export async function getSavedDateKeysForDepartment(
  year: number,
  month: number,
  departmentMatricules: Set<string>,
): Promise<string[]> {
  const { savedDateKeys, completeDateKeys } = await getDepartmentCalendarStatus(
    year,
    month,
    departmentMatricules,
  );
  return [...savedDateKeys, ...completeDateKeys];
}

export async function getEmployeeTimesheetEntries(
  year: number,
  month: number,
  matricule: string,
): Promise<Record<string, TimesheetDayEntry>> {
  const data = await readData();
  const key = periodKey(year, month);
  const period = data.periods[key];
  if (!period) return {};

  const result: Record<string, TimesheetDayEntry> = {};
  for (const [dateKey, dayEntries] of Object.entries(period.days)) {
    const entry = dayEntries[matricule];
    if (entry) result[dateKey] = entry;
  }
  return result;
}

export async function getDayEntriesMap(
  year: number,
  month: number,
  dateKey: string,
): Promise<Record<string, TimesheetDayEntry>> {
  const data = await readData();
  const key = periodKey(year, month);
  return { ...(data.periods[key]?.days[dateKey] ?? {}) };
}

export interface SaveDayEntriesInput {
  year: number;
  month: number;
  dateKey: string;
  entries: Array<{
    matricule: string;
    from: string;
    to: string;
    shiftType: TimesheetShiftType | null;
  }>;
  updatedBy: string;
}

export async function saveDayEntries(input: SaveDayEntriesInput): Promise<Record<string, TimesheetDayEntry>> {
  const data = await readData();
  const key = periodKey(input.year, input.month);
  if (!data.periods[key]) data.periods[key] = { days: {} };
  if (!data.periods[key].days[input.dateKey]) data.periods[key].days[input.dateKey] = {};

  const now = new Date().toISOString();
  const dayMap = data.periods[key].days[input.dateKey];

  for (const entry of input.entries) {
    const normalized = normalizeEntry(entry);
    if (!isActiveEntry(normalized)) {
      if (shouldPersistEntry(normalized)) {
        dayMap[entry.matricule] = {
          ...normalized,
          present: false,
          from: '',
          to: '',
          updatedAt: now,
          updatedBy: input.updatedBy,
        };
      } else {
        delete dayMap[entry.matricule];
      }
      continue;
    }
    dayMap[entry.matricule] = {
      ...normalized,
      updatedAt: now,
      updatedBy: input.updatedBy,
    };
  }

  if (!Object.keys(dayMap).length) {
    delete data.periods[key].days[input.dateKey];
  }

  await writeData(data);
  return { ...dayMap };
}

export async function getPlanningCompleteWeekIndexes(
  year: number,
  month: number,
  departmentMatricules: Set<string>,
  periodDateKeys: string[],
): Promise<number[]> {
  const total = departmentMatricules.size;
  if (!total || !periodDateKeys.length) return [];

  const data = await readData();
  const key = periodKey(year, month);
  const days = data.periods[key]?.days ?? {};
  const weekCount = Math.ceil(periodDateKeys.length / 7);
  const complete: number[] = [];

  for (let weekIndex = 0; weekIndex < weekCount; weekIndex += 1) {
    const weekDayKeys = periodDateKeys.slice(weekIndex * 7, weekIndex * 7 + 7);
    let weekComplete = true;

    for (const dateKey of weekDayKeys) {
      const dayEntries = days[dateKey] ?? {};
      let configuredCount = 0;
      for (const matricule of departmentMatricules) {
        const entry = dayEntries[matricule];
        if (entry && isConfiguredEntry(entry)) configuredCount += 1;
      }
      if (configuredCount !== total) {
        weekComplete = false;
        break;
      }
    }

    if (weekComplete) complete.push(weekIndex);
  }

  return complete;
}

export async function getWeekPlanningEntries(
  year: number,
  month: number,
  dateKeys: string[],
): Promise<Record<string, Record<string, TimesheetDayEntry>>> {
  const data = await readData();
  const key = periodKey(year, month);
  const days = data.periods[key]?.days ?? {};
  const result: Record<string, Record<string, TimesheetDayEntry>> = {};

  for (const dateKey of dateKeys) {
    result[dateKey] = { ...(days[dateKey] ?? {}) };
  }

  return result;
}

export interface SavePlanningWeekInput {
  year: number;
  month: number;
  entries: Array<{
    matricule: string;
    dateKey: string;
    shiftType: TimesheetShiftType | null;
  }>;
  updatedBy: string;
}

export async function savePlanningWeekEntries(input: SavePlanningWeekInput): Promise<void> {
  const data = await readData();
  const key = periodKey(input.year, input.month);
  if (!data.periods[key]) data.periods[key] = { days: {} };

  const now = new Date().toISOString();

  for (const entry of input.entries) {
    if (!data.periods[key].days[entry.dateKey]) {
      data.periods[key].days[entry.dateKey] = {};
    }
    const dayMap = data.periods[key].days[entry.dateKey];

    if (entry.shiftType === null) {
      delete dayMap[entry.matricule];
      if (!Object.keys(dayMap).length) delete data.periods[key].days[entry.dateKey];
      continue;
    }

    dayMap[entry.matricule] = {
      matricule: entry.matricule,
      present: false,
      from: '',
      to: '',
      shiftType: entry.shiftType,
      updatedAt: now,
      updatedBy: input.updatedBy,
    };
  }

  await writeData(data);
}

export async function savePlanningDayEntries(
  input: SaveDayEntriesInput,
): Promise<Record<string, TimesheetDayEntry>> {
  return saveDayEntries({
    ...input,
    entries: input.entries.map((entry) => ({
      ...entry,
      from: '',
      to: '',
    })),
  });
}
