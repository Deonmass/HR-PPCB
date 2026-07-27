import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';

const DATA_START_ROW = 9;

function setValue(sheet, address, value) {
  if (value === undefined || value === null || value === '') {
    sheet.cell(address).value('');
    return;
  }
  sheet.cell(address).value(value);
}

const workbook = await XlsxPopulate.fromFileAsync('Excel/overtimes/Timesheet template.xlsx');
const sheet = workbook.sheet('TIMESHEET');

setValue(sheet, 'B3', 'PPC Barnet');
setValue(sheet, 'B4', 'Admin');
setValue(sheet, 'P3', 'Kahasha Patrick');
setValue(sheet, 'P4', '70000180');
setValue(sheet, 'F6', 'MONTH : July 2026');

const r = DATA_START_ROW;
setValue(sheet, `A${r}`, new Date(2026, 5, 19));
setValue(sheet, `B${r}`, 'Fri');
setValue(sheet, `C${r}`, 'HS Sem. 1');
setValue(sheet, `D${r}`, '22:00');
setValue(sheet, `E${r}`, '06:00');
setValue(sheet, `K${r}`, 7);

await workbook.toFileAsync('tmp-test-export.xlsx');

// compare row 9 cell count in xml
import { execSync } from 'child_process';
execSync('copy /Y tmp-test-export.xlsx tmp-test-export.zip', { shell: 'cmd.exe' });
// use powershell to expand
execSync('powershell -Command "Expand-Archive -Path tmp-test-export.zip -DestinationPath tmp-test-export-xlsx -Force"', { stdio: 'inherit' });
const xml = fs.readFileSync('tmp-test-export-xlsx/xl/worksheets/sheet1.xml', 'utf8');
const row9 = xml.match(/<row r="9"[^>]*>([\s\S]*?)<\/row>/);
console.log('styles.xml size', fs.statSync('tmp-test-export-xlsx/xl/styles.xml').size);
console.log('row9 length', row9?.[1]?.length);
console.log('row9 cells', (row9?.[1]?.match(/<c r="/g) || []).length);
console.log('row9 sample', row9?.[1]?.slice(0, 600));
