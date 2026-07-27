import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx-js-style';
import { OVERTIMES_DATA_XLSX_PATH } from './excel-overtimes-paths';
import {
  OT_COL,
  OT_HEADERS,
  OT_LAST_COL,
  OT_WEEK_COLS_WIDTHS,
  OVERTIMES_DATA_SCHEMA_VERSION,
  OVERTIMES_DATA_SHEET,
  OVERTIMES_DATA_START,
  OVERTIMES_META_SHEET,
  OVERTIMES_PLANNING_SHEET,
  PLAN_COL,
  PLAN_COLS_WIDTHS,
  PLAN_HEADERS,
  PLAN_LAST_COL,
} from './overtimes-data-columns';
import {
  getSheet,
  getSheetBlock,
  isWorksheetBloated,
  readWorkbook,
  rebuildSheetFromRows,
  saveWorkbook,
  withExcelLock,
  writeRowValues,
  type AoaRow,
} from './excel-io';
import { getTimesheetWeekFromTo } from './timesheet-period';
import type { WeeklyOvertimeData, WeeklyOvertimeEntry, WeeklyOvertimeWeek } from './timesheet-weekly-ot';
import { emptyWeeklyOvertimeEntry, weeklyOtKey, weeklyOtWeekKey } from './timesheet-weekly-ot';
import { matchesDepartment } from './timesheet-permissions';

const EXCEL_PATH = OVERTIMES_DATA_XLSX_PATH;
const COMPACT_FILE_BYTES = 5 * 1024 * 1024;

const LEGACY_JSON_PATH = path.join(process.cwd(), 'data', 'timesheet', 'weekly-ot.json');
const LEGACY_JSON_BAK = path.join(process.cwd(), 'data', 'timesheet', 'weekly-ot.json.bak');

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(str(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseLocked(value: unknown): boolean {
  const raw = str(value).toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'oui' || raw === 'yes' || raw === 'vrai';
}

function formatLocked(locked: boolean): string {
  return locked ? 'TRUE' : 'FALSE';
}

function parseEntriesCell(value: unknown): Record<string, WeeklyOvertimeEntry> {
  const raw = str(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === 'object'
        ? Object.values(parsed as Record<string, unknown>)
        : [];
    const entries: Record<string, WeeklyOvertimeEntry> = {};
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Partial<WeeklyOvertimeEntry>;
      const matricule = str(row.matricule);
      if (!matricule) continue;
      entries[matricule] = {
        matricule,
        ot13: Math.round((Number(row.ot13) || 0) * 1000) / 1000,
        ot16: Math.round((Number(row.ot16) || 0) * 1000) / 1000,
        ot2: Math.round((Number(row.ot2) || 0) * 1000) / 1000,
        night: Math.round((Number(row.night) || 0) * 1000) / 1000,
      };
    }
    return entries;
  } catch {
    return {};
  }
}

function serializeEntriesCell(entries: Record<string, WeeklyOvertimeEntry>): string {
  const list = Object.values(entries)
    .map((e) => ({
      matricule: e.matricule,
      ot13: e.ot13,
      ot16: e.ot16,
      ot2: e.ot2,
      night: e.night,
    }))
    .sort((a, b) => a.matricule.localeCompare(b.matricule, 'fr'));
  return JSON.stringify(list);
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

/**
 * Lit une ligne schéma v2, ou v1 legacy :
 * year,month,department,weekIndex,locked,lockedAt,lockedBy,entries
 */
function rowToWeek(row: AoaRow): { year: number; month: number; week: WeeklyOvertimeWeek } | null {
  const year = num(row[OT_COL.year]);
  const month = num(row[OT_COL.month]);
  const department = str(row[OT_COL.department]);
  if (!year || !month || !department) return null;

  const weekIndex = num(row[OT_COL.weekIndex]);
  const looksLikeV2 = str(row[OT_COL.weekFromTo]).startsWith('du ')
    || str(row[OT_COL.entries]).startsWith('[')
    || str(row[OT_COL.entries]).startsWith('{')
    || Boolean(str(row[OT_COL.updatedAt]) || str(row[OT_COL.confirmedAt]) || str(row[OT_COL.closedAt]));

  // Legacy v1: entries was at index 7 (now weekFromTo / mid columns)
  const legacyEntriesRaw = str(row[7]);
  const isLegacyV1 =
    !looksLikeV2
    && (legacyEntriesRaw.startsWith('[') || legacyEntriesRaw.startsWith('{'))
    && !str(row[OT_COL.entries]).startsWith('[');

  let week: WeeklyOvertimeWeek;

  if (isLegacyV1) {
    week = {
      weekIndex,
      department,
      weekFromTo: getTimesheetWeekFromTo(year, month, weekIndex).label,
      locked: parseLocked(row[4]),
      entries: parseEntriesCell(row[7]),
    };
    const lockedAt = str(row[5]);
    const lockedBy = str(row[6]);
    if (lockedAt) {
      // Historique : lockedAt = confirmation OU clôture — on le range en confirmedAt.
      week.confirmedAt = lockedAt;
      week.confirmedBy = lockedBy || undefined;
    }
  } else {
    week = {
      weekIndex,
      department,
      weekFromTo: str(row[OT_COL.weekFromTo]) || getTimesheetWeekFromTo(year, month, weekIndex).label,
      locked: parseLocked(row[OT_COL.locked]),
      entries: parseEntriesCell(row[OT_COL.entries]),
    };
    const updatedAt = str(row[OT_COL.updatedAt]);
    const updatedBy = str(row[OT_COL.updatedBy]);
    const confirmedAt = str(row[OT_COL.confirmedAt]);
    const confirmedBy = str(row[OT_COL.confirmedBy]);
    const closedAt = str(row[OT_COL.closedAt]);
    const closedBy = str(row[OT_COL.closedBy]);
    const lockedAt = str(row[OT_COL.lockedAt]);
    const lockedBy = str(row[OT_COL.lockedBy]);
    if (updatedAt) week.updatedAt = updatedAt;
    if (updatedBy) week.updatedBy = updatedBy;
    if (confirmedAt) week.confirmedAt = confirmedAt;
    if (confirmedBy) week.confirmedBy = confirmedBy;
    if (closedAt) week.closedAt = closedAt;
    if (closedBy) week.closedBy = closedBy;
    // Migration : anciens lockedAt sans confirmed/closed
    if (!week.confirmedAt && !week.closedAt && lockedAt) {
      week.confirmedAt = lockedAt;
      if (lockedBy) week.confirmedBy = lockedBy;
    }
  }

  syncLockFlags(week);
  ensureWeekFromTo(year, month, week);
  return { year, month, week };
}

function weekToRow(year: number, month: number, week: WeeklyOvertimeWeek): AoaRow {
  ensureWeekFromTo(year, month, week);
  syncLockFlags(week);
  return [
    year,
    month,
    week.department,
    week.weekIndex,
    week.weekFromTo ?? '',
    formatLocked(week.locked),
    week.updatedAt ?? '',
    week.updatedBy ?? '',
    week.confirmedAt ?? '',
    week.confirmedBy ?? '',
    week.closedAt ?? '',
    week.closedBy ?? '',
    week.lockedAt ?? '',
    week.lockedBy ?? '',
    serializeEntriesCell(week.entries),
  ];
}

function emptyWorkbook(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const weeks = XLSX.utils.aoa_to_sheet([OT_HEADERS.slice()]);
  weeks['!cols'] = OT_WEEK_COLS_WIDTHS.map((c) => ({ ...c }));
  const planning = XLSX.utils.aoa_to_sheet([PLAN_HEADERS.slice()]);
  planning['!cols'] = PLAN_COLS_WIDTHS.map((c) => ({ ...c }));
  const meta = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['schemaVersion', OVERTIMES_DATA_SCHEMA_VERSION],
    ['updatedAt', new Date().toISOString()],
    ['source', 'bootstrap'],
  ]);
  XLSX.utils.book_append_sheet(wb, weeks, OVERTIMES_DATA_SHEET);
  XLSX.utils.book_append_sheet(wb, planning, OVERTIMES_PLANNING_SHEET);
  XLSX.utils.book_append_sheet(wb, meta, OVERTIMES_META_SHEET);
  return wb;
}

async function loadLegacyJson(): Promise<WeeklyOvertimeData | null> {
  for (const candidate of [LEGACY_JSON_PATH, LEGACY_JSON_BAK]) {
    try {
      const raw = await fsPromises.readFile(candidate, 'utf8');
      return JSON.parse(raw) as WeeklyOvertimeData;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code !== 'ENOENT') throw err;
    }
  }
  return null;
}

function dataFromRows(dataRows: AoaRow[]): WeeklyOvertimeData {
  const data: WeeklyOvertimeData = { periods: {} };
  for (const row of dataRows) {
    const parsed = rowToWeek(row);
    if (!parsed) continue;
    const periodKey = weeklyOtKey(parsed.year, parsed.month);
    if (!data.periods[periodKey]) data.periods[periodKey] = { weeks: {} };
    const weekKey = weeklyOtWeekKey(parsed.week.department, parsed.week.weekIndex);
    data.periods[periodKey].weeks[weekKey] = parsed.week;
  }
  return data;
}

function flattenData(data: WeeklyOvertimeData): Array<{ year: number; month: number; week: WeeklyOvertimeWeek }> {
  const out: Array<{ year: number; month: number; week: WeeklyOvertimeWeek }> = [];
  for (const [periodKey, period] of Object.entries(data.periods)) {
    const [y, m] = periodKey.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) continue;
    for (const week of Object.values(period.weeks)) {
      ensureWeekFromTo(y, m, week);
      syncLockFlags(week);
      out.push({ year: y, month: m, week });
    }
  }
  out.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    const dept = a.week.department.localeCompare(b.week.department, 'fr');
    if (dept !== 0) return dept;
    return a.week.weekIndex - b.week.weekIndex;
  });
  return out;
}

function readPlanningRowsFromWorkbook(wb: XLSX.WorkBook): AoaRow[] {
  if (!wb.Sheets[OVERTIMES_PLANNING_SHEET]) return [];
  const block = getSheetBlock(wb, OVERTIMES_PLANNING_SHEET, OVERTIMES_DATA_START, {
    keyCol: PLAN_COL.dateKey,
    emptyStreakLimit: 3,
    maxCols: PLAN_LAST_COL,
  });
  return block.dataRows;
}

function buildWeeksSheet(flat: Array<{ year: number; month: number; week: WeeklyOvertimeWeek }>): XLSX.WorkSheet {
  const weeksWs = rebuildSheetFromRows(
    [OT_HEADERS.slice()],
    flat.map((item) => weekToRow(item.year, item.month, item.week)),
  );
  weeksWs['!cols'] = OT_WEEK_COLS_WIDTHS.map((c) => ({ ...c }));
  return weeksWs;
}

function buildPlanningSheet(planningDataRows: AoaRow[]): XLSX.WorkSheet {
  const planningWs = rebuildSheetFromRows([PLAN_HEADERS.slice()], planningDataRows);
  planningWs['!cols'] = PLAN_COLS_WIDTHS.map((c) => ({ ...c }));
  return planningWs;
}

function workbookNeedsCompaction(wb: XLSX.WorkBook): boolean {
  try {
    if (fs.existsSync(EXCEL_PATH) && fs.statSync(EXCEL_PATH).size > COMPACT_FILE_BYTES) {
      return true;
    }
  } catch {
    // ignore
  }
  return [OVERTIMES_DATA_SHEET, OVERTIMES_PLANNING_SHEET].some((name) => {
    const ws = wb.Sheets[name];
    return Boolean(ws && isWorksheetBloated(ws));
  });
}

async function persistCompactWorkbook(
  wb: XLSX.WorkBook,
  flat: Array<{ year: number; month: number; week: WeeklyOvertimeWeek }>,
): Promise<void> {
  const planningDataRows = readPlanningRowsFromWorkbook(wb);
  wb.Sheets[OVERTIMES_DATA_SHEET] = buildWeeksSheet(flat);
  wb.Sheets[OVERTIMES_PLANNING_SHEET] = buildPlanningSheet(planningDataRows);

  wb.Sheets[OVERTIMES_META_SHEET] = XLSX.utils.aoa_to_sheet([
    ['key', 'value'],
    ['schemaVersion', OVERTIMES_DATA_SCHEMA_VERSION],
    ['updatedAt', new Date().toISOString()],
    ['source', 'compact'],
    ['rowCount', flat.length],
    ['planningRowCount', planningDataRows.length],
  ]);

  wb.SheetNames = [
    OVERTIMES_DATA_SHEET,
    OVERTIMES_PLANNING_SHEET,
    OVERTIMES_META_SHEET,
    ...wb.SheetNames.filter(
      (n) =>
        n !== OVERTIMES_DATA_SHEET &&
        n !== OVERTIMES_PLANNING_SHEET &&
        n !== OVERTIMES_META_SHEET,
    ),
  ];

  await saveWorkbook(wb, EXCEL_PATH);
}

async function ensureWorkbookExists(): Promise<void> {
  if (fs.existsSync(EXCEL_PATH)) return;

  fs.mkdirSync(path.dirname(EXCEL_PATH), { recursive: true });
  const legacy = await loadLegacyJson();
  const wb = emptyWorkbook();
  if (legacy && Object.keys(legacy.periods).length > 0) {
    const ws = getSheet(wb, OVERTIMES_DATA_SHEET);
    const flat = flattenData(legacy);
    flat.forEach((item, index) => {
      writeRowValues(ws, OVERTIMES_DATA_START + index, weekToRow(item.year, item.month, item.week));
    });
    try {
      if (fs.existsSync(LEGACY_JSON_PATH)) {
        await fsPromises.copyFile(LEGACY_JSON_PATH, LEGACY_JSON_BAK);
      }
    } catch {
      // best-effort
    }
  }
  await saveWorkbook(wb, EXCEL_PATH);
}

async function readData(): Promise<WeeklyOvertimeData> {
  await ensureWorkbookExists();
  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    if (!wb.Sheets[OVERTIMES_DATA_SHEET]) {
      wb.SheetNames.push(OVERTIMES_DATA_SHEET);
      wb.Sheets[OVERTIMES_DATA_SHEET] = XLSX.utils.aoa_to_sheet([OT_HEADERS.slice()]);
    }
    const sheet = getSheetBlock(wb, OVERTIMES_DATA_SHEET, OVERTIMES_DATA_START, {
      keyCol: OT_COL.department,
      emptyStreakLimit: 3,
      maxCols: OT_LAST_COL,
    });
    const data = dataFromRows(sheet.dataRows);

    if (workbookNeedsCompaction(wb)) {
      await persistCompactWorkbook(wb, flattenData(data));
    }

    return data;
  });
}

async function writeData(data: WeeklyOvertimeData): Promise<void> {
  await ensureWorkbookExists();
  return withExcelLock(EXCEL_PATH, async () => {
    let wb = await readWorkbook(EXCEL_PATH);
    if (!wb.Sheets[OVERTIMES_DATA_SHEET]) {
      wb = emptyWorkbook();
    }

    const flat = flattenData(data);
    const planningDataRows = readPlanningRowsFromWorkbook(wb);

    wb.Sheets[OVERTIMES_DATA_SHEET] = buildWeeksSheet(flat);
    wb.Sheets[OVERTIMES_PLANNING_SHEET] = buildPlanningSheet(planningDataRows);

    const metaWs = XLSX.utils.aoa_to_sheet([
      ['key', 'value'],
      ['schemaVersion', OVERTIMES_DATA_SCHEMA_VERSION],
      ['updatedAt', new Date().toISOString()],
      ['source', 'app-weeks'],
      ['rowCount', flat.length],
      ['planningRowCount', planningDataRows.length],
    ]);
    wb.Sheets[OVERTIMES_META_SHEET] = metaWs;

    wb.SheetNames = [
      OVERTIMES_DATA_SHEET,
      OVERTIMES_PLANNING_SHEET,
      OVERTIMES_META_SHEET,
      ...wb.SheetNames.filter(
        (n) =>
          n !== OVERTIMES_DATA_SHEET &&
          n !== OVERTIMES_PLANNING_SHEET &&
          n !== OVERTIMES_META_SHEET,
      ),
    ];

    await saveWorkbook(wb, EXCEL_PATH);
  });
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
  const periodKey = weeklyOtKey(year, month);
  if (!data.periods[periodKey]) data.periods[periodKey] = { weeks: {} };
  const existing = findWeekInPeriod(data.periods[periodKey].weeks, department, weekIndex);
  if (existing) {
    ensureWeekFromTo(year, month, existing);
    return existing;
  }
  const weekKey = weeklyOtWeekKey(department, weekIndex);
  data.periods[periodKey].weeks[weekKey] = {
    weekIndex,
    department,
    weekFromTo: getTimesheetWeekFromTo(year, month, weekIndex).label,
    locked: false,
    entries: {},
  };
  return data.periods[periodKey].weeks[weekKey];
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
  const data = await readData();
  const periodKey = weeklyOtKey(year, month);
  const weeks = data.periods[periodKey]?.weeks ?? {};
  const week =
    findWeekInPeriod(weeks, department, weekIndex) ?? {
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
  const data = await readData();
  const periodKey = weeklyOtKey(year, month);
  const weeks = data.periods[periodKey]?.weeks ?? {};
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
}): Promise<WeeklyOvertimeWeek> {
  const data = await readData();
  const week = ensureWeek(data, input.year, input.month, input.department, input.weekIndex);
  syncLockFlags(week);
  if (week.locked) throw new Error('Heures sup. de la semaine verrouillées');

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

  await writeData(data);
  return week;
}

export async function lockWeeklyOvertimeWeek(input: {
  year: number;
  month: number;
  department: string;
  weekIndex: number;
  userId: string;
}): Promise<WeeklyOvertimeWeek> {
  const data = await readData();
  const week = ensureWeek(data, input.year, input.month, input.department, input.weekIndex);
  const timestamp = new Date().toISOString();
  week.confirmedAt = timestamp;
  week.confirmedBy = input.userId;
  syncLockFlags(week);
  await writeData(data);
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
  const data = await readData();
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
  await writeData(data);
}

export async function getImportedWeekIndexes(
  year: number,
  month: number,
  department: string,
): Promise<number[]> {
  const data = await readData();
  const periodKey = weeklyOtKey(year, month);
  const weeks = data.periods[periodKey]?.weeks ?? {};
  return Object.values(weeks)
    .filter(
      (week) =>
        matchesDepartment(week.department, department) &&
        Object.keys(week.entries).length > 0,
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
  const data = await readData();
  const periodKey = weeklyOtKey(year, month);
  const weeks = data.periods[periodKey]?.weeks ?? {};
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
}): Promise<{
  results: Array<{ department: string; status: 'imported' | 'locked'; imported: number; skipped: number }>;
  importedMatriculeKeys: Set<string>;
  totalImported: number;
  totalSkipped: number;
}> {
  const data = await readData();
  const results: Array<{ department: string; status: 'imported' | 'locked'; imported: number; skipped: number }> = [];
  const importedMatriculeKeys = new Set<string>();
  let totalImported = 0;
  let totalSkipped = 0;

  for (const [department, rows] of input.rowsByDepartment.entries()) {
    const allowed = input.allowedByDepartment.get(department);
    if (!allowed?.size) continue;

    const week = ensureWeek(data, input.year, input.month, department, input.weekIndex);
    syncLockFlags(week);
    if (week.locked) {
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

    if (imported > 0) {
      stampUpdated(week, input.userId);
    }

    if (imported > 0 || skipped > 0) {
      results.push({ department, status: 'imported', imported, skipped });
    }
  }

  if (totalImported > 0) {
    await writeData(data);
  }

  if (!results.length) {
    throw new Error('Aucune ligne importée pour les départements autorisés');
  }

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
}): Promise<{ week: WeeklyOvertimeWeek; imported: number; skipped: number }> {
  const data = await readData();
  const week = ensureWeek(data, input.year, input.month, input.department, input.weekIndex);
  syncLockFlags(week);
  if (week.locked) throw new Error('Heures sup. de la semaine verrouillées');

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
    await writeData(data);
  }

  return { week, imported, skipped };
}

export function buildWeeklyEntriesForAgents(
  matricules: string[],
  existing: Record<string, WeeklyOvertimeEntry>,
): WeeklyOvertimeEntry[] {
  return matricules.map(
    (matricule) => existing[matricule] ?? emptyWeeklyOvertimeEntry(matricule),
  );
}

export function getOvertimesDataPath(): string {
  return EXCEL_PATH;
}
