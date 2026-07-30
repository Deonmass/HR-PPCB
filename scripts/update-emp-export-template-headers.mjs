/**
 * Met à jour le template d'export employés :
 * - en-têtes Base / EXIT / Periode d'essai / CDD
 * - crée les feuilles manquantes
 *
 * Usage: node scripts/update-emp-export-template-headers.mjs
 */
import ExcelJS from 'exceljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(
  __dirname,
  '..',
  'Excel',
  'templates',
  'employees',
  'EMPLOYEES_HR_EXPORT_TEMPLATE.xlsx',
);

const HEADERS = [
  'MATRICULE',
  'COMPANY',
  'COMPLET NAME',
  'DEPARTMENT',
  'GRADE',
  'JOB TITLE',
  'LOCALISATION',
  'CENTER DES COUTS',
  'Appointment Date',
  'Gender',
  'Date of Birth',
  'Age',
  'Nationality',
  'Marital Status',
  'number of children',
  'Personnal Area',
  'Employee SubGroup',
  'Payroll Area',
  'Payroll periode',
  'Line Manager Name',
  'Line manager position',
  'CNSS',
  'NIF',
  'Statut',
  'Type de contrat',
  'Duree contrat (mois)',
  "Periode d'essai (mois)",
  "Date fin periode d'essai",
  'Date fin contrat',
  'Raison exit',
  'Essai Actions',
  'Essai Responsable',
  'Essai Echeance eval',
  'Essai Statut eval',
  'Essai Commentaire',
];

const SHEETS = [
  { name: 'Base', title: 'BASE — EMPLOYES ACTIFS' },
  { name: "Periode d'essai", title: "PERIODE D'ESSAI — EN COURS" },
  { name: 'CDD', title: 'CDD — CONTRATS' },
  { name: 'EXIT', title: 'EXIT — AGENTS SORTIS' },
];

function applyHeaders(sheet, title) {
  sheet.getCell(1, 1).value = title;
  const row = sheet.getRow(2);
  HEADERS.forEach((header, i) => {
    row.getCell(i + 1).value = header;
  });
  for (let c = HEADERS.length + 1; c <= 45; c++) {
    row.getCell(c).value = null;
  }
  row.commit();
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);

  const base = wb.getWorksheet('Base');
  for (const { name, title } of SHEETS) {
    let sh = wb.getWorksheet(name);
    if (!sh) {
      sh = wb.addWorksheet(name);
      console.log('Created sheet', name);
    }
    // Copy row-1 style lightly from Base when possible
    if (base && name !== 'Base') {
      for (let c = 1; c <= HEADERS.length; c++) {
        const src = base.getRow(2).getCell(c);
        const dst = sh.getRow(2).getCell(c);
        if (src.style) dst.style = { ...src.style };
      }
    }
    applyHeaders(sh, title);
    console.log('Updated headers on', name);
  }

  await wb.xlsx.writeFile(templatePath);
  console.log('Wrote', templatePath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
