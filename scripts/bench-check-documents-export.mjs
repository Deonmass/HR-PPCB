/**
 * Benchmark Check Documents export (template + live data).
 * Usage: node scripts/bench-check-documents-export.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XlsxPopulate from 'xlsx-populate';
import XLSX from 'xlsx-js-style';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const TEMPLATE = path.join(root, 'Excel', 'templates', 'check-documents', 'CHECK_DOCUMENTS_EXPORT_TEMPLATE.xlsx');
const LIVE = path.join(root, 'Excel', 'EMPLOYEE.xlsx');
const SHEET = 'CHECK DOCUMENTS BASE';
const FIRST = 4;
const DATA_END_COL = 25;
const OUT = path.join(root, 'Excel', '_bench_check_docs_export.xlsx');

function toCellValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  const asNum = Number(value);
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(asNum) && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    return asNum;
  }
  return String(value);
}

console.time('total');
console.time('read-live');
const liveWb = XLSX.read(fs.readFileSync(LIVE), { type: 'buffer', cellStyles: false });
const liveWs = liveWb.Sheets[SHEET];
const dataRows = [];
for (let r = 3; r < 500; r++) {
  const addr = XLSX.utils.encode_cell({ r, c: 0 });
  const mat = liveWs[addr]?.v;
  if (mat === undefined || mat === null || String(mat).trim() === '') {
    if (dataRows.length > 0) break;
    continue;
  }
  const row = [];
  for (let c = 0; c < DATA_END_COL; c++) {
    row.push(liveWs[XLSX.utils.encode_cell({ r, c })]?.v);
  }
  dataRows.push(row);
}
console.timeEnd('read-live');
console.log('rows', dataRows.length);

console.time('load-template');
const twb = await XlsxPopulate.fromFileAsync(TEMPLATE);
console.timeEnd('load-template');

console.time('write-range');
const sheet = twb.sheet(SHEET);
const matrix = dataRows.map((row) => row.map(toCellValue));
const endRow = FIRST + dataRows.length - 1;
sheet.range(FIRST, 1, endRow, DATA_END_COL).value(matrix);
console.timeEnd('write-range');

console.log('Z4', sheet.cell('Z4').formula());
console.log('AA4', sheet.cell('AA4').formula());
console.log('AC4', sheet.cell('AC4').formula());
console.log('Z180', sheet.cell('Z180').formula());

console.time('output');
const buf = await twb.outputAsync();
fs.writeFileSync(OUT, buf);
console.timeEnd('output');
console.timeEnd('total');
console.log('out MB', (buf.length / 1e6).toFixed(2), '->', OUT);
