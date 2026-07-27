/**
 * Crée / migre Excel/overtimes/OVERTIMES_DATA.xlsx (schéma v2).
 *
 * Usage: node scripts/build-overtimes-data-workbook.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx-js-style';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUTPUT = path.join(root, 'Excel', 'overtimes', 'OVERTIMES_DATA.xlsx');
const LEGACY_OUTPUT = path.join(root, 'Excel', 'OVERTIMES_DATA.xlsx');
const JSON_PATH = path.join(root, 'data', 'timesheet', 'weekly-ot.json');
const JSON_BAK = path.join(root, 'data', 'timesheet', 'weekly-ot.json.bak');

const HEADERS = [
  'year',
  'month',
  'department',
  'weekIndex',
  'weekFromTo',
  'locked',
  'updatedAt',
  'updatedBy',
  'confirmedAt',
  'confirmedBy',
  'closedAt',
  'closedBy',
  'lockedAt',
  'lockedBy',
  'entries',
];

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function mondayOnOrBefore(date) {
  const cursor = startOfDay(date);
  while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() - 1);
  return cursor;
}

function lastMondayBefore(date) {
  const cursor = startOfDay(date);
  cursor.setDate(cursor.getDate() - 1);
  while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() - 1);
  return cursor;
}

function formatFr(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${date.getFullYear()}`;
}

function weekFromToLabel(year, month, weekIndex) {
  const fifteenthCurrent = new Date(year, month - 1, 15);
  const prevMonthDate = new Date(year, month - 2, 15);
  const start = mondayOnOrBefore(prevMonthDate);
  const end = lastMondayBefore(fifteenthCurrent);
  const days = [];
  for (let cursor = startOfDay(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    days.push(startOfDay(cursor));
  }
  const from = days[weekIndex * 7];
  const to = days[Math.min(weekIndex * 7 + 6, days.length - 1)];
  if (!from || !to) return '';
  return `du ${formatFr(from)} au ${formatFr(to)}`;
}

function loadWeeklyOtJson() {
  for (const p of [JSON_PATH, JSON_BAK]) {
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  }
  return { periods: {} };
}

/** Relit un OVERTIMES_DATA existant (v1 ou v2) → tableau de semaines. */
function loadExistingWorkbook(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets.weeks;
  if (!ws) return [];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rows.length) return [];
  const header = rows[0].map((h) => String(h));
  const isV2 = header.includes('weekFromTo');
  const out = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row.length) continue;
    const year = Number(row[0]);
    const month = Number(row[1]);
    const department = String(row[2] ?? '').trim();
    const weekIndex = Number(row[3]);
    if (!year || !month || !department) continue;

    if (isV2) {
      out.push({
        year,
        month,
        department,
        weekIndex,
        weekFromTo: String(row[4] ?? '') || weekFromToLabel(year, month, weekIndex),
        locked: String(row[5]).toUpperCase() === 'TRUE',
        updatedAt: String(row[6] ?? ''),
        updatedBy: String(row[7] ?? ''),
        confirmedAt: String(row[8] ?? ''),
        confirmedBy: String(row[9] ?? ''),
        closedAt: String(row[10] ?? ''),
        closedBy: String(row[11] ?? ''),
        lockedAt: String(row[12] ?? ''),
        lockedBy: String(row[13] ?? ''),
        entries: String(row[14] ?? '[]'),
      });
    } else {
      const lockedAt = String(row[5] ?? '');
      const lockedBy = String(row[6] ?? '');
      out.push({
        year,
        month,
        department,
        weekIndex,
        weekFromTo: weekFromToLabel(year, month, weekIndex),
        locked: String(row[4]).toUpperCase() === 'TRUE',
        updatedAt: '',
        updatedBy: '',
        confirmedAt: lockedAt,
        confirmedBy: lockedBy,
        closedAt: '',
        closedBy: '',
        lockedAt,
        lockedBy,
        entries: String(row[7] ?? '[]'),
      });
    }
  }
  return out;
}

function entriesToJson(entries) {
  if (typeof entries === 'string') return entries || '[]';
  if (!entries || typeof entries !== 'object') return '[]';
  const list = Object.values(entries).map((e) => ({
    matricule: String(e.matricule ?? ''),
    ot13: Number(e.ot13) || 0,
    ot16: Number(e.ot16) || 0,
    ot2: Number(e.ot2) || 0,
    night: Number(e.night) || 0,
  }));
  return JSON.stringify(list);
}

function weeksFromJson(data) {
  const out = [];
  for (const [periodKey, period] of Object.entries(data?.periods ?? {})) {
    const [year, month] = periodKey.split('-').map(Number);
    if (!Number.isFinite(year) || !Number.isFinite(month)) continue;
    for (const week of Object.values(period.weeks ?? {})) {
      const lockedAt = week.lockedAt ? String(week.lockedAt) : '';
      out.push({
        year,
        month,
        department: String(week.department ?? ''),
        weekIndex: Number(week.weekIndex) || 0,
        weekFromTo: weekFromToLabel(year, month, Number(week.weekIndex) || 0),
        locked: Boolean(week.locked),
        updatedAt: week.updatedAt ? String(week.updatedAt) : '',
        updatedBy: week.updatedBy ? String(week.updatedBy) : '',
        confirmedAt: week.confirmedAt ? String(week.confirmedAt) : lockedAt,
        confirmedBy: week.confirmedBy ? String(week.confirmedBy) : (week.lockedBy ? String(week.lockedBy) : ''),
        closedAt: week.closedAt ? String(week.closedAt) : '',
        closedBy: week.closedBy ? String(week.closedBy) : '',
        lockedAt,
        lockedBy: week.lockedBy ? String(week.lockedBy) : '',
        entries: entriesToJson(week.entries),
      });
    }
  }
  return out;
}

function mergeWeeks(primary, fallback) {
  const map = new Map();
  for (const week of [...fallback, ...primary]) {
    const key = `${week.year}-${week.month}::${week.department}::${week.weekIndex}`;
    map.set(key, week);
  }
  return [...map.values()].sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    if (a.month !== b.month) return a.month - b.month;
    const dept = a.department.localeCompare(b.department, 'fr');
    if (dept !== 0) return dept;
    return a.weekIndex - b.weekIndex;
  });
}

const existingPath = fs.existsSync(OUTPUT) ? OUTPUT : LEGACY_OUTPUT;
const fromExcel = loadExistingWorkbook(existingPath);
const fromJson = weeksFromJson(loadWeeklyOtJson());
const weeks = mergeWeeks(fromExcel, fromJson);

const aoa = [
  HEADERS.slice(),
  ...weeks.map((w) => [
    w.year,
    w.month,
    w.department,
    w.weekIndex,
    w.weekFromTo || weekFromToLabel(w.year, w.month, w.weekIndex),
    w.locked || w.confirmedAt || w.closedAt ? 'TRUE' : 'FALSE',
    w.updatedAt,
    w.updatedBy,
    w.confirmedAt,
    w.confirmedBy,
    w.closedAt,
    w.closedBy,
    w.lockedAt || w.confirmedAt || w.closedAt || '',
    w.lockedBy || w.confirmedBy || w.closedBy || '',
    w.entries || '[]',
  ]),
];

const weeksSheet = XLSX.utils.aoa_to_sheet(aoa);
weeksSheet['!cols'] = [
  { wch: 6 }, { wch: 6 }, { wch: 18 }, { wch: 10 }, { wch: 28 },
  { wch: 8 }, { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 14 },
  { wch: 22 }, { wch: 14 }, { wch: 22 }, { wch: 14 }, { wch: 80 },
];

const metaSheet = XLSX.utils.aoa_to_sheet([
  ['key', 'value'],
  ['schemaVersion', 2],
  ['updatedAt', new Date().toISOString()],
  ['source', 'build-overtimes-data-workbook'],
  ['rowCount', weeks.length],
]);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, weeksSheet, 'weeks');
XLSX.utils.book_append_sheet(wb, metaSheet, 'meta');

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
XLSX.writeFile(wb, OUTPUT);
console.log(`Créé / migré : ${OUTPUT}`);
console.log(`Lignes weeks : ${weeks.length}`);
if (weeks[0]) {
  console.log(`Exemple weekFromTo : ${weeks[0].weekFromTo}`);
}
