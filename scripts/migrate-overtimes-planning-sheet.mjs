/**
 * Ajoute / migre la feuille `planning` dans Excel/overtimes/OVERTIMES_DATA.xlsx
 * depuis data/timesheet/entries.json si besoin.
 *
 * Usage: node scripts/migrate-overtimes-planning-sheet.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx-js-style';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const XLSX_PATH = path.join(root, 'Excel', 'overtimes', 'OVERTIMES_DATA.xlsx');
const JSON_PATH = path.join(root, 'data', 'timesheet', 'entries.json');
const JSON_BAK = path.join(root, 'data', 'timesheet', 'entries.json.bak');

const PLAN_HEADERS = ['year', 'month', 'dateKey', 'weekday', 'updatedAt', 'updatedBy', 'entries'];
const OT_HEADERS = [
  'year', 'month', 'department', 'weekIndex', 'weekFromTo', 'locked',
  'updatedAt', 'updatedBy', 'confirmedAt', 'confirmedBy', 'closedAt', 'closedBy',
  'lockedAt', 'lockedBy', 'entries',
];

function weekdayLabel(dateKey) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!m) return '';
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()] ?? '';
}

function dayToRow(year, month, dateKey, entries) {
  let updatedAt = '';
  let updatedBy = '';
  const list = Object.values(entries || {}).map((e) => {
    if (e.updatedAt && e.updatedAt > updatedAt) {
      updatedAt = e.updatedAt;
      updatedBy = e.updatedBy || '';
    }
    return {
      matricule: e.matricule,
      present: e.present,
      from: e.from || '',
      to: e.to || '',
      shiftType: e.shiftType ?? null,
      updatedAt: e.updatedAt,
      updatedBy: e.updatedBy,
    };
  }).sort((a, b) => String(a.matricule).localeCompare(String(b.matricule), 'fr'));

  return [year, month, dateKey, weekdayLabel(dateKey), updatedAt, updatedBy, JSON.stringify(list)];
}

function loadPlanningFromJson() {
  if (!fs.existsSync(JSON_PATH)) return [];
  const data = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  const rows = [];
  for (const [pKey, period] of Object.entries(data.periods || {})) {
    const [year, month] = pKey.split('-').map(Number);
    for (const [dateKey, entries] of Object.entries(period.days || {})) {
      if (!Object.keys(entries).length) continue;
      rows.push(dayToRow(year, month, dateKey, entries));
    }
  }
  rows.sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  return rows;
}

fs.mkdirSync(path.dirname(XLSX_PATH), { recursive: true });

let wb;
if (fs.existsSync(XLSX_PATH)) {
  wb = XLSX.readFile(XLSX_PATH);
} else {
  wb = XLSX.utils.book_new();
  const weeks = XLSX.utils.aoa_to_sheet([OT_HEADERS]);
  XLSX.utils.book_append_sheet(wb, weeks, 'weeks');
}

const existingPlanningRows = wb.Sheets.planning
  ? XLSX.utils.sheet_to_json(wb.Sheets.planning, { header: 1 })
  : [];
const hasPlanningData = existingPlanningRows.length > 1;

const planningRows = hasPlanningData
  ? existingPlanningRows
  : [PLAN_HEADERS, ...loadPlanningFromJson()];

const planningWs = XLSX.utils.aoa_to_sheet(planningRows);
planningWs['!cols'] = [
  { wch: 6 }, { wch: 6 }, { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 14 }, { wch: 100 },
];
wb.Sheets.planning = planningWs;

if (!wb.Sheets.weeks) {
  wb.Sheets.weeks = XLSX.utils.aoa_to_sheet([OT_HEADERS]);
}

wb.Sheets.meta = XLSX.utils.aoa_to_sheet([
  ['key', 'value'],
  ['schemaVersion', 3],
  ['updatedAt', new Date().toISOString()],
  ['source', 'migrate-overtimes-planning-sheet'],
  ['planningRowCount', Math.max(0, planningRows.length - 1)],
]);

wb.SheetNames = ['weeks', 'planning', 'meta', ...wb.SheetNames.filter((n) => !['weeks', 'planning', 'meta'].includes(n))];

XLSX.writeFile(wb, XLSX_PATH);

if (!hasPlanningData && fs.existsSync(JSON_PATH) && planningRows.length > 1) {
  fs.copyFileSync(JSON_PATH, JSON_BAK);
  console.log(`Backup JSON : ${JSON_BAK}`);
}

console.log(`Mis à jour : ${XLSX_PATH}`);
console.log(`Feuilles : ${wb.SheetNames.join(', ')}`);
console.log(`Lignes planning : ${Math.max(0, planningRows.length - 1)}`);
