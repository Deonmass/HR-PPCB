/**
 * Ajoute la colonne "Lien document" (N) à la feuille DEPENDANTS
 * dans EMPLOYEE.xlsx et DEPENDANTS_EXPORT_TEMPLATE.xlsx.
 *
 * Usage:
 *   node scripts/add-dependants-lien-document-column.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XlsxPopulate from 'xlsx-populate';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const HEADER = 'Lien document';
const COL = 14; // N
const HEADER_ROW = 2;

const targets = [
  path.join(root, 'Excel', 'EMPLOYEE.xlsx'),
  path.join(root, 'Excel', 'templates', 'dependants', 'DEPENDANTS_EXPORT_TEMPLATE.xlsx'),
  path.join(root, 'Excel', 'DEPENDANTS_EXPORT_TEMPLATE.xlsx'),
].filter((filePath) => fs.existsSync(filePath));

if (!targets.length) {
  console.error('Aucun fichier Excel cible trouvé.');
  process.exit(1);
}

for (const filePath of targets) {
  const workbook = await XlsxPopulate.fromFileAsync(filePath);
  const sheet = workbook.sheet('DEPENDANTS');
  if (!sheet) {
    console.warn(`Feuille DEPENDANTS absente : ${filePath}`);
    continue;
  }

  const existing = String(sheet.cell(HEADER_ROW, COL).value() ?? '').trim();
  if (existing === HEADER) {
    console.log(`Déjà présent : ${path.basename(filePath)}`);
    continue;
  }

  // Copier le style de l'en-tête Commentaires (M2) si possible.
  try {
    const style = sheet.cell(HEADER_ROW, 13).style([
      'bold', 'italic', 'fill', 'border', 'horizontalAlignment',
      'verticalAlignment', 'fontColor', 'fontSize', 'wrapText',
    ]);
    sheet.cell(HEADER_ROW, COL).style(style);
  } catch {
    sheet.cell(HEADER_ROW, COL).style({ bold: true, wrapText: true });
  }

  sheet.cell(HEADER_ROW, COL).value(HEADER);
  sheet.column(COL).width(42);

  await workbook.toFileAsync(filePath);
  console.log(`Colonne ajoutée : ${filePath}`);
}
