/**
 * Compact Excel/overtimes/OVERTIMES_DATA.xlsx — supprime les lignes vides /
 * métadonnées 1M+ lignes qui gonflent le fichier (~150 MB).
 *
 * Usage: node scripts/trim-overtimes-data-workbook.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx-js-style';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XLSX_PATH = path.join(__dirname, '..', 'Excel', 'overtimes', 'OVERTIMES_DATA.xlsx');

const SHEETS = {
  weeks: {
    dataStart: 1,
    keyCol: 2,
    maxCols: 14,
    headers: [
      'year', 'month', 'department', 'weekIndex', 'weekFromTo', 'locked',
      'updatedAt', 'updatedBy', 'confirmedAt', 'confirmedBy', 'closedAt', 'closedBy',
      'lockedAt', 'lockedBy', 'entries',
    ],
  },
  planning: {
    dataStart: 1,
    keyCol: 2,
    maxCols: 6,
    headers: ['year', 'month', 'dateKey', 'weekday', 'updatedAt', 'updatedBy', 'entries'],
  },
};

function getMaxPopulatedRow(ws) {
  let max = 0;
  for (const key of Object.keys(ws)) {
    if (key[0] === '!') continue;
    const { r } = XLSX.utils.decode_cell(key);
    if (r > max) max = r;
  }
  return max;
}

function readRow(ws, rowIndex, colEnd) {
  const row = [];
  for (let c = 0; c <= colEnd; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c })];
    const v = cell?.v;
    row.push(v === undefined || v === null ? '' : v);
  }
  return row;
}

function readDataRows(ws, { dataStart, keyCol, maxCols }) {
  const maxRow = getMaxPopulatedRow(ws);
  const rows = [];
  let emptyStreak = 0;
  for (let r = dataStart; r <= maxRow; r++) {
    const row = readRow(ws, r, maxCols);
    const key = String(row[keyCol] ?? '').trim();
    if (!key) {
      emptyStreak += 1;
      if (rows.length > 0 && emptyStreak >= 3) break;
      continue;
    }
    emptyStreak = 0;
    rows.push(row);
  }
  return rows;
}

if (!fs.existsSync(XLSX_PATH)) {
  console.error(`Fichier introuvable : ${XLSX_PATH}`);
  process.exit(1);
}

const beforeBytes = fs.statSync(XLSX_PATH).size;
console.log(`Avant : ${(beforeBytes / 1e6).toFixed(2)} MB`);

const wb = XLSX.read(fs.readFileSync(XLSX_PATH), { cellStyles: true, cellDates: true });
const out = XLSX.utils.book_new();

for (const [name, cfg] of Object.entries(SHEETS)) {
  const ws = wb.Sheets[name];
  if (!ws) {
    console.log(`Feuille "${name}" absente — ignorée`);
    continue;
  }
  const refBefore = ws['!ref'] ?? '—';
  const dataRows = readDataRows(ws, cfg);
  const compact = XLSX.utils.aoa_to_sheet([cfg.headers, ...dataRows]);
  if (ws['!cols']) compact['!cols'] = ws['!cols'];
  XLSX.utils.book_append_sheet(out, compact, name);
  console.log(
    `${name}: dimension ${refBefore} → ${compact['!ref'] ?? '—'} (${dataRows.length} ligne(s) de données)`,
  );
}

if (wb.Sheets.meta) {
  XLSX.utils.book_append_sheet(out, wb.Sheets.meta, 'meta');
}

const buffer = XLSX.write(out, { type: 'buffer', bookType: 'xlsx', cellStyles: true });

try {
  fs.writeFileSync(XLSX_PATH, buffer);
  const afterBytes = fs.statSync(XLSX_PATH).size;
  console.log(`Après : ${(afterBytes / 1e6).toFixed(2)} MB`);
  console.log(`Fichier compacté : ${XLSX_PATH}`);
} catch (err) {
  if (err && typeof err === 'object' && 'code' in err && err.code === 'EBUSY') {
    const altPath = XLSX_PATH.replace(/\.xlsx$/i, '.compact.xlsx');
    fs.writeFileSync(altPath, buffer);
    console.log(`Fichier verrouillé — version compacte écrite : ${altPath}`);
    console.log(`Fermez Excel puis remplacez ${XLSX_PATH} par ce fichier.`);
  } else {
    throw err;
  }
}
