/**
 * Rebuilds Excel/templates/check-documents/CHECK_DOCUMENTS_EXPORT_TEMPLATE.xlsx from a formatted EMPLOYEE workbook.
 *
 * Usage:
 *   node scripts/build-check-documents-export-template.mjs
 *   node scripts/build-check-documents-export-template.mjs "D:\Employee file\EMPLOYEE.xlsx"
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XlsxPopulate from 'xlsx-populate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const OUTPUT = path.join(root, 'Excel', 'templates', 'check-documents', 'CHECK_DOCUMENTS_EXPORT_TEMPLATE.xlsx');
const SHEET_NAME = 'CHECK DOCUMENTS BASE';

const candidates = [
  process.argv[2],
  process.env.CHECK_DOCUMENTS_EXPORT_TEMPLATE_SOURCE,
  process.env.EMPLOYEE_XLSX,
  path.join(root, 'Excel', 'EMPLOYEE.xlsx'),
  'd:/Employee file/EMPLOYEE.xlsx',
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
  if (sheetName !== SHEET_NAME) {
    workbook.sheet(sheetName).delete();
  }
}

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
await workbook.toFileAsync(OUTPUT);
console.log(`Modèle export créé : ${OUTPUT}`);
console.log(`Source : ${sourcePath}`);

// Le fichier source Excel a souvent une dimension gonflée (1M+ lignes) :
// on trimme systématiquement pour garder un export < 10 s.
const { spawnSync } = await import('child_process');
const trim = spawnSync(process.execPath, [path.join(__dirname, 'trim-check-documents-export-template.mjs')], {
  stdio: 'inherit',
});
if (trim.status !== 0) {
  console.warn('Attention : trim du template a échoué — l’export risque d’être lent.');
}
