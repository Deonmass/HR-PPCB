import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_OVERTIMES_TIMESHEETS_KEY,
  DURABLE_OVERTIMES_WEEKLY_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { TimesheetDayEntry, TimesheetShiftType } from './timesheet-types';
import type { WeeklyOvertimeData, WeeklyOvertimeEntry, WeeklyOvertimeWeek } from './timesheet-weekly-ot';
import { emptyWeeklyOvertimeEntry, weeklyOtKey, weeklyOtWeekKey } from './timesheet-weekly-ot';
import { getTimesheetWeekFromTo } from './timesheet-period';
import { matchesDepartment } from './timesheet-permissions';
import { OVERTIMES_DATA_XLSX_PATH } from './excel-overtimes-paths';

export interface TimesheetPeriodStore {
  days: Record<string, Record<string, TimesheetDayEntry>>;
}

export interface TimesheetEntriesData {
  periods: Record<string, TimesheetPeriodStore>;
}

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) return path.join(process.cwd(), relativePath);
  const writable = path.join(getWritableDataRoot(), relativePath.replace(/^data[\\/]/, ''));
  const bundled = path.join(process.cwd(), relativePath);
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

function timesheetsPath(): string {
  return resolveStorePath(path.join('data', 'overtimes', 'timesheets.json'));
}

function weeklyPath(): string {
  return resolveStorePath(path.join('data', 'overtimes', 'weekly-overtime.json'));
}

function periodKey(year: number, month: number): string {
  return `${year}-${month}`;
}

async function readJsonFile<T>(repoKey: string, filePath: string, fallback: T): Promise<T> {
  await hydrateDurableFile(repoKey, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(repoKey: string, filePath: string, value: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  await persistDurableFile(repoKey, filePath);
}

async function loadLegacyTimesheets(): Promise<TimesheetEntriesData> {
  const candidates = [
    path.join(process.cwd(), 'data', 'timesheet', 'entries.json'),
    path.join(process.cwd(), 'data', 'timesheet', 'entries.json.bak'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = await fsPromises.readFile(candidate, 'utf8');
      const json = JSON.parse(raw) as TimesheetEntriesData;
      return { periods: json.periods ?? {} };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }
  // Excel fallback via existing Excel store only if needed — avoid circular import;
  // seed empty and let one-shot Excel read happen through dynamic import.
  try {
    const { readWorkbookForData, getSheetBlock, withExcelLock } = await import('./excel-io');
    const {
      OVERTIMES_PLANNING_SHEET,
      OVERTIMES_DATA_START,
      PLAN_COL,
      PLAN_LAST_COL,
    } = await import('./overtimes-data-columns');
    if (!fs.existsSync(OVERTIMES_DATA_XLSX_PATH)) return { periods: {} };
    return withExcelLock(OVERTIMES_DATA_XLSX_PATH, async () => {
      const wb = await readWorkbookForData(OVERTIMES_DATA_XLSX_PATH);
      if (!wb.Sheets[OVERTIMES_PLANNING_SHEET]) return { periods: {} };
      const sheet = getSheetBlock(wb, OVERTIMES_PLANNING_SHEET, OVERTIMES_DATA_START, {
        keyCol: PLAN_COL.dateKey,
        emptyStreakLimit: 3,
        maxCols: PLAN_LAST_COL,
      });
      const data: TimesheetEntriesData = { periods: {} };
      for (const row of sheet.dataRows) {
        const year = Number(row[PLAN_COL.year]) || 0;
        const month = Number(row[PLAN_COL.month]) || 0;
        const dateKey = String(row[PLAN_COL.dateKey] ?? '').trim();
        if (!year || !month || !dateKey) continue;
        let entries: Record<string, TimesheetDayEntry> = {};
        try {
          const parsed = JSON.parse(String(row[PLAN_COL.entries] ?? '')) as unknown;
          const list = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === 'object'
              ? Object.values(parsed as Record<string, unknown>)
              : [];
          for (const item of list) {
            if (!item || typeof item !== 'object') continue;
            const rowItem = item as Partial<TimesheetDayEntry>;
            const matricule = String(rowItem.matricule ?? '').trim();
            if (!matricule) continue;
            const from = String(rowItem.from ?? '').trim();
            const to = String(rowItem.to ?? '').trim();
            entries[matricule] = {
              matricule,
              present: Boolean(from && to),
              from,
              to,
              shiftType: (rowItem.shiftType as TimesheetShiftType | null) ?? null,
              holiday: Boolean(rowItem.holiday),
              updatedAt: rowItem.updatedAt ? String(rowItem.updatedAt) : undefined,
              updatedBy: rowItem.updatedBy ? String(rowItem.updatedBy) : undefined,
            };
          }
        } catch {
          entries = {};
        }
        if (!Object.keys(entries).length) continue;
        const key = periodKey(year, month);
        if (!data.periods[key]) data.periods[key] = { days: {} };
        data.periods[key].days[dateKey] = entries;
      }
      return data;
    });
  } catch {
    return { periods: {} };
  }
}

async function loadLegacyWeekly(): Promise<WeeklyOvertimeData> {
  const candidates = [
    path.join(process.cwd(), 'data', 'timesheet', 'weekly-ot.json'),
    path.join(process.cwd(), 'data', 'timesheet', 'weekly-ot.json.bak'),
  ];
  for (const candidate of candidates) {
    try {
      const raw = await fsPromises.readFile(candidate, 'utf8');
      return JSON.parse(raw) as WeeklyOvertimeData;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }
  return { periods: {} };
}

async function ensureTimesheetsMigrated(): Promise<void> {
  const exists = await fsPromises.access(timesheetsPath()).then(() => true).catch(() => false);
  if (exists) return;
  const legacy = await loadLegacyTimesheets();
  await writeJsonFile(DURABLE_OVERTIMES_TIMESHEETS_KEY, timesheetsPath(), legacy);
}

async function ensureWeeklyMigrated(): Promise<void> {
  const exists = await fsPromises.access(weeklyPath()).then(() => true).catch(() => false);
  if (exists) return;
  const legacy = await loadLegacyWeekly();
  await writeJsonFile(DURABLE_OVERTIMES_WEEKLY_KEY, weeklyPath(), legacy);
}

async function readTimesheetData(): Promise<TimesheetEntriesData> {
  await ensureTimesheetsMigrated();
  return readJsonFile(DURABLE_OVERTIMES_TIMESHEETS_KEY, timesheetsPath(), { periods: {} });
}

async function writeTimesheetData(data: TimesheetEntriesData): Promise<void> {
  await writeJsonFile(DURABLE_OVERTIMES_TIMESHEETS_KEY, timesheetsPath(), data);
}

async function readWeeklyData(): Promise<WeeklyOvertimeData> {
  await ensureWeeklyMigrated();
  return readJsonFile(DURABLE_OVERTIMES_WEEKLY_KEY, weeklyPath(), { periods: {} });
}

async function writeWeeklyData(data: WeeklyOvertimeData): Promise<void> {
  await writeJsonFile(DURABLE_OVERTIMES_WEEKLY_KEY, weeklyPath(), data);
}

function normalizeEntry(entry: Partial<TimesheetDayEntry> & { matricule: string }): TimesheetDayEntry {
  const from = entry.from?.trim() ?? '';
  const to = entry.to?.trim() ?? '';
  return {
    matricule: entry.matricule,
    present: Boolean(from && to),
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
  const data = await readTimesheetData();
  const days = data.periods[periodKey(year, month)]?.days ?? {};
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
    if (configuredCount === total || activeCount === total) completeDateKeys.push(dateKey);
    else if (hasProgress) savedDateKeys.push(dateKey);
  }
  return { savedDateKeys, completeDateKeys, planningCompleteDateKeys };
}

export async function getSavedDateKeysForDepartment(
  year: number,
  month: number,
  departmentMatricules: Set<string>,
): Promise<string[]> {
  const { savedDateKeys, completeDateKeys } = await getDepartmentCalendarStatus(year, month, departmentMatricules);
  return [...savedDateKeys, ...completeDateKeys];
}

export async function getEmployeeTimesheetEntries(
  year: number,
  month: number,
  matricule: string,
): Promise<Record<string, TimesheetDayEntry>> {
  const data = await readTimesheetData();
  const period = data.periods[periodKey(year, month)];
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
  const data = await readTimesheetData();
  return { ...(data.periods[periodKey(year, month)]?.days[dateKey] ?? {}) };
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
  const data = await readTimesheetData();
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
    dayMap[entry.matricule] = { ...normalized, updatedAt: now, updatedBy: input.updatedBy };
  }
  if (!Object.keys(dayMap).length) delete data.periods[key].days[input.dateKey];
  await writeTimesheetData(data);
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
  const data = await readTimesheetData();
  const days = data.periods[periodKey(year, month)]?.days ?? {};
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
  const data = await readTimesheetData();
  const days = data.periods[periodKey(year, month)]?.days ?? {};
  const result: Record<string, Record<string, TimesheetDayEntry>> = {};
  for (const dateKey of dateKeys) result[dateKey] = { ...(days[dateKey] ?? {}) };
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
  const data = await readTimesheetData();
  const key = periodKey(input.year, input.month);
  if (!data.periods[key]) data.periods[key] = { days: {} };
  const now = new Date().toISOString();
  for (const entry of input.entries) {
    if (!data.periods[key].days[entry.dateKey]) data.periods[key].days[entry.dateKey] = {};
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
  await writeTimesheetData(data);
}

export async function savePlanningDayEntries(
  input: SaveDayEntriesInput,
): Promise<Record<string, TimesheetDayEntry>> {
  return saveDayEntries({
    ...input,
    entries: input.entries.map((entry) => ({ ...entry, from: '', to: '' })),
  });
}

function syncLockFlags(week: WeeklyOvertimeWeek): void {
  week.locked = Boolean(week.confirmedAt || week.closedAt);
  if (week.closedAt) {
    week.lockedAt = week.closedAt;
    week.lockedBy = week.closedBy;
  } else if (week.confirmedAt) {
    week.lockedAt = week.confirmedAt;
    week.lockedBy = week.confirmedBy;
  } else {
    delete week.lockedAt;
    delete week.lockedBy;
  }
}

function ensureWeekFromTo(year: number, month: number, week: WeeklyOvertimeWeek): void {
  if (week.weekFromTo) return;
  week.weekFromTo = getTimesheetWeekFromTo(year, month, week.weekIndex).label;
}

function findWeekInPeriod(
  weeks: Record<string, WeeklyOvertimeWeek>,
  department: string,
  weekIndex: number,
): WeeklyOvertimeWeek | undefined {
  const direct = weeks[weeklyOtWeekKey(department, weekIndex)];
  if (direct) return direct;
  return Object.values(weeks).find(
    (week) => week.weekIndex === weekIndex && matchesDepartment(week.department, department),
  );
}

function ensureWeek(
  data: WeeklyOvertimeData,
  year: number,
  month: number,
  department: string,
  weekIndex: number,
): WeeklyOvertimeWeek {
  const key = weeklyOtKey(year, month);
  if (!data.periods[key]) data.periods[key] = { weeks: {} };
  const existing = findWeekInPeriod(data.periods[key].weeks, department, weekIndex);
  if (existing) {
    ensureWeekFromTo(year, month, existing);
    return existing;
  }
  const weekKey = weeklyOtWeekKey(department, weekIndex);
  data.periods[key].weeks[weekKey] = {
    weekIndex,
    department,
    weekFromTo: getTimesheetWeekFromTo(year, month, weekIndex).label,
    locked: false,
    entries: {},
  };
  return data.periods[key].weeks[weekKey];
}

function stampUpdated(week: WeeklyOvertimeWeek, userId: string): void {
  week.updatedAt = new Date().toISOString();
  week.updatedBy = userId;
}

export async function getWeeklyOvertimeWeek(
  year: number,
  month: number,
  department: string,
  weekIndex: number,
): Promise<WeeklyOvertimeWeek> {
  const data = await readWeeklyData();
  const weeks = data.periods[weeklyOtKey(year, month)]?.weeks ?? {};
  const week = findWeekInPeriod(weeks, department, weekIndex) ?? {
    weekIndex,
    department,
    weekFromTo: getTimesheetWeekFromTo(year, month, weekIndex).label,
    locked: false,
    entries: {},
  };
  ensureWeekFromTo(year, month, week);
  syncLockFlags(week);
  return week;
}

export async function getLockedWeekIndexes(
  year: number,
  month: number,
  department: string,
): Promise<number[]> {
  const data = await readWeeklyData();
  const weeks = data.periods[weeklyOtKey(year, month)]?.weeks ?? {};
  return Object.values(weeks)
    .filter((week) => {
      syncLockFlags(week);
      return matchesDepartment(week.department, department) && week.locked;
    })
    .map((week) => week.weekIndex)
    .sort((a, b) => a - b);
}

export async function saveWeeklyOvertimeWeek(input: {
  year: number;
  month: number;
  department: string;
  weekIndex: number;
  entries: WeeklyOvertimeEntry[];
  userId: string;
  /** Permission « Modifier OT après validation » */
  allowWhenLocked?: boolean;
}): Promise<WeeklyOvertimeWeek> {
  const data = await readWeeklyData();
  const week = ensureWeek(data, input.year, input.month, input.department, input.weekIndex);
  syncLockFlags(week);
  if (week.locked && !input.allowWhenLocked) {
    throw new Error('Heures sup. de la semaine verrouillées — validation requise pour modifier');
  }
  for (const entry of input.entries) {
    week.entries[entry.matricule] = {
      matricule: entry.matricule,
      ot13: Math.round(entry.ot13 * 1000) / 1000,
      ot16: Math.round(entry.ot16 * 1000) / 1000,
      ot2: Math.round(entry.ot2 * 1000) / 1000,
      night: Math.round(entry.night * 1000) / 1000,
    };
  }
  stampUpdated(week, input.userId);
  await writeWeeklyData(data);
  return week;
}

export async function lockWeeklyOvertimeWeek(input: {
  year: number;
  month: number;
  department: string;
  weekIndex: number;
  userId: string;
}): Promise<WeeklyOvertimeWeek> {
  const data = await readWeeklyData();
  const week = ensureWeek(data, input.year, input.month, input.department, input.weekIndex);
  const timestamp = new Date().toISOString();
  week.confirmedAt = timestamp;
  week.confirmedBy = input.userId;
  syncLockFlags(week);
  await writeWeeklyData(data);
  return week;
}

export async function setWeeklyOvertimeMonthClosed(input: {
  year: number;
  month: number;
  department: string;
  weekIndexes: number[];
  closed: boolean;
  userId: string;
}): Promise<void> {
  const data = await readWeeklyData();
  const timestamp = new Date().toISOString();
  for (const weekIndex of input.weekIndexes) {
    const week = ensureWeek(data, input.year, input.month, input.department, weekIndex);
    if (input.closed) {
      week.closedAt = timestamp;
      week.closedBy = input.userId;
    } else {
      delete week.closedAt;
      delete week.closedBy;
    }
    syncLockFlags(week);
  }
  await writeWeeklyData(data);
}

export async function getImportedWeekIndexes(
  year: number,
  month: number,
  department: string,
): Promise<number[]> {
  const data = await readWeeklyData();
  const weeks = data.periods[weeklyOtKey(year, month)]?.weeks ?? {};
  return Object.values(weeks)
    .filter(
      (week) =>
        matchesDepartment(week.department, department)
        && Object.keys(week.entries).length > 0,
    )
    .map((week) => week.weekIndex)
    .sort((a, b) => a - b);
}

export async function getDepartmentWeeklyOtForMatricule(
  year: number,
  month: number,
  department: string,
  matricule: string,
): Promise<Record<number, WeeklyOvertimeEntry>> {
  const data = await readWeeklyData();
  const weeks = data.periods[weeklyOtKey(year, month)]?.weeks ?? {};
  const byWeek: Record<number, WeeklyOvertimeEntry> = {};
  for (const week of Object.values(weeks)) {
    if (!matchesDepartment(week.department, department)) continue;
    const entry = week.entries[matricule];
    if (entry) byWeek[week.weekIndex] = entry;
  }
  return byWeek;
}

export async function importWeeklyOvertimeBulk(input: {
  year: number;
  month: number;
  weekIndex: number;
  rowsByDepartment: Map<string, WeeklyOvertimeEntry[]>;
  allowedByDepartment: Map<string, Set<string>>;
  userId: string;
  allowWhenLocked?: boolean;
}): Promise<{
  results: Array<{ department: string; status: 'imported' | 'locked'; imported: number; skipped: number }>;
  importedMatriculeKeys: Set<string>;
  totalImported: number;
  totalSkipped: number;
}> {
  const data = await readWeeklyData();
  const results: Array<{ department: string; status: 'imported' | 'locked'; imported: number; skipped: number }> = [];
  const importedMatriculeKeys = new Set<string>();
  let totalImported = 0;
  let totalSkipped = 0;
  for (const [department, rows] of input.rowsByDepartment.entries()) {
    const allowed = input.allowedByDepartment.get(department);
    if (!allowed?.size) continue;
    const week = ensureWeek(data, input.year, input.month, department, input.weekIndex);
    syncLockFlags(week);
    if (week.locked && !input.allowWhenLocked) {
      results.push({ department, status: 'locked', imported: 0, skipped: 0 });
      continue;
    }
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!allowed.has(row.matricule)) continue;
      if (row.matricule in week.entries) {
        skipped += 1;
        continue;
      }
      week.entries[row.matricule] = {
        matricule: row.matricule,
        ot13: Math.round(row.ot13 * 1000) / 1000,
        ot16: Math.round(row.ot16 * 1000) / 1000,
        ot2: Math.round(row.ot2 * 1000) / 1000,
        night: Math.round(row.night * 1000) / 1000,
      };
      importedMatriculeKeys.add(`${department}::${row.matricule}`);
      imported += 1;
    }
    totalImported += imported;
    totalSkipped += skipped;
    if (imported > 0) stampUpdated(week, input.userId);
    if (imported > 0 || skipped > 0) {
      results.push({ department, status: 'imported', imported, skipped });
    }
  }
  if (totalImported > 0) await writeWeeklyData(data);
  if (!results.length) throw new Error('Aucune ligne importée pour les départements autorisés');
  if (totalImported === 0 && totalSkipped > 0) {
    throw new Error('Toutes les lignes du fichier étaient déjà importées pour cette semaine');
  }
  return { results, importedMatriculeKeys, totalImported, totalSkipped };
}

export async function importWeeklyOvertimeRows(input: {
  year: number;
  month: number;
  department: string;
  weekIndex: number;
  rows: WeeklyOvertimeEntry[];
  allowedMatricules: Set<string>;
  userId: string;
  allowWhenLocked?: boolean;
}): Promise<{ week: WeeklyOvertimeWeek; imported: number; skipped: number }> {
  const data = await readWeeklyData();
  const week = ensureWeek(data, input.year, input.month, input.department, input.weekIndex);
  syncLockFlags(week);
  if (week.locked && !input.allowWhenLocked) {
    throw new Error('Heures sup. de la semaine verrouillées');
  }
  let imported = 0;
  let skipped = 0;
  for (const row of input.rows) {
    if (!input.allowedMatricules.has(row.matricule)) continue;
    if (row.matricule in week.entries) {
      skipped += 1;
      continue;
    }
    week.entries[row.matricule] = {
      matricule: row.matricule,
      ot13: Math.round(row.ot13 * 1000) / 1000,
      ot16: Math.round(row.ot16 * 1000) / 1000,
      ot2: Math.round(row.ot2 * 1000) / 1000,
      night: Math.round(row.night * 1000) / 1000,
    };
    imported += 1;
  }
  if (imported === 0 && skipped > 0) {
    throw new Error('Toutes les lignes du fichier étaient déjà importées pour cette semaine');
  }
  if (imported > 0) {
    stampUpdated(week, input.userId);
    await writeWeeklyData(data);
  }
  return { week, imported, skipped };
}

export function buildWeeklyEntriesForAgents(
  matricules: string[],
  existing: Record<string, WeeklyOvertimeEntry>,
): WeeklyOvertimeEntry[] {
  return matricules.map((matricule) => existing[matricule] ?? emptyWeeklyOvertimeEntry(matricule));
}

export function getOvertimesDataPath(): string {
  return timesheetsPath();
}
