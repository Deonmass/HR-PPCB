/**
 * Rebuilds Excel/export-templates/DEPENDANTS_EXPORT_TEMPLATE.xlsx from a formatted EMPLOYEE workbook.
 *
 * Usage:
 *   node scripts/build-dependants-export-template.mjs
 *   node scripts/build-dependants-export-template.mjs "D:\Employee file\EMPLOYEE.xlsx"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XlsxPopulate from 'xlsx-populate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUTPUT = path.join(root, 'Excel', 'export-templates', 'DEPENDANTS_EXPORT_TEMPLATE.xlsx');

const candidates = [
  process.argv[2],
  process.env.DEPENDANTS_EXPORT_TEMPLATE_SOURCE,
  'd:/Employee file/EMPLOYEE.xlsx',
  process.env.EMPLOYEE_XLSX,
  path.join(root, 'Excel', 'EMPLOYEE.xlsx'),
].filter(Boolean);

let sourcePath = null;
for (const candidate of candidates) {
  if (candidate && fs.existsSync(candidate)) {
    sourcePath = candidate;
    break;
  }
}

if (!sourcePath) {
  console.error('Aucun fichier EMPLOYEE.xlsx source trouvé.');
  process.exit(1);
}

const workbook = await XlsxPopulate.fromFileAsync(sourcePath);
for (const sheetName of workbook.sheets().map((sheet) => sheet.name())) {
  if (!['DEPENDANTS', 'RESUME'].includes(sheetName)) {
    workbook.sheet(sheetName).delete();
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
await workbook.toFileAsync(OUTPUT);
console.log(`Modèle export créé : ${OUTPUT}`);
console.log(`Source : ${sourcePath}`);
