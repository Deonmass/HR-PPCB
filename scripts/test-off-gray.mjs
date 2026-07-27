import XlsxPopulate from 'xlsx-populate';
import fs from 'fs';

const workbook = await XlsxPopulate.fromFileAsync('Excel/overtimes/Timesheet template.xlsx');
const sheet = workbook.sheet('TIMESHEET');

sheet.cell('F6').value('MONTH : June 2026');

const grayFill = sheet.cell('A6').style('fill');
for (const col of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S']) {
  sheet.cell(`${col}15`).style('fill', grayFill);
}

await workbook.toFileAsync('tmp-off-gray-test.xlsx');

const buf = fs.readFileSync('tmp-off-gray-test.xlsx');
fs.writeFileSync('tmp-off-gray-test.zip', buf);
// quick xml check
import { execSync } from 'child_process';
execSync('powershell -Command "Expand-Archive -Path tmp-off-gray-test.zip -DestinationPath tmp-off-gray-test -Force"', { stdio: 'ignore' });
const xml = fs.readFileSync('tmp-off-gray-test/xl/worksheets/sheet1.xml', 'utf8');
const f6 = xml.match(/<c r="F6"[^>]*>/);
const row15 = xml.match(/<row r="15"[^>]*>([\s\S]*?)<\/row>/);
console.log('F6', f6?.[0]);
console.log('row15 styles', [...new Set([...(row15?.[1]?.matchAll(/s="(\d+)"/g) ?? [])].map((m) => m[1]))]);
