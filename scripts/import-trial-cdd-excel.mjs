/**
 * Importe Trial period & CDD.xlsx dans data/employees/employees.json
 * (met à jour les matricules existants uniquement).
 *
 * Usage: node scripts/import-trial-cdd-excel.mjs
 */
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const employeesPath = path.join(root, 'data', 'employees', 'employees.json');
const sourcePath =
  process.argv[2] ||
  path.join(process.env.USERPROFILE || '', 'Downloads', 'Trial period  CDD.xlsx');

function cellText(raw) {
  if (raw == null) return '';
  if (raw instanceof Date) {
    const dd = String(raw.getDate()).padStart(2, '0');
    const mm = String(raw.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${raw.getFullYear()}`;
  }
  if (typeof raw === 'object') {
    if ('result' in raw && raw.result != null) return cellText(raw.result);
    if ('text' in raw) return String(raw.text ?? '');
    if ('richText' in raw) return (raw.richText || []).map((p) => p.text).join('');
  }
  return String(raw).trim();
}

function toDisplayDate(value) {
  const t = cellText(value);
  if (!t) return '';
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) {
    const [d, m, y] = t.split('/');
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
  }
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) {
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }
  return '';
}

function num(value) {
  const n = Number(String(cellText(value)).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function main() {
  if (!fs.existsSync(sourcePath)) {
    console.error('Source introuvable:', sourcePath);
    process.exit(1);
  }
  const store = JSON.parse(fs.readFileSync(employeesPath, 'utf8'));
  const byMat = new Map(store.employees.map((e) => [String(e.matricule), e]));
  let updated = 0;
  let missing = 0;

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(sourcePath);

  const probation = wb.getWorksheet('Probation period');
  if (probation) {
    for (let r = 5; r <= probation.rowCount; r++) {
      const row = probation.getRow(r);
      const matricule = cellText(row.getCell(1).value);
      if (!matricule || /^fy\d+/i.test(matricule)) continue;
      const emp = byMat.get(matricule);
      if (!emp) {
        missing += 1;
        console.warn('Matricule absent (essai):', matricule);
        continue;
      }
      const typeContrat = cellText(row.getCell(6).value) || emp.typeContrat || '';
      const periodeEssaiMois = num(row.getCell(7).value);
      const start = toDisplayDate(row.getCell(8).value);
      const finEssai = toDisplayDate(row.getCell(9).value);
      Object.assign(emp, {
        typeContrat,
        periodeEssaiMois: periodeEssaiMois ?? emp.periodeEssaiMois ?? null,
        appointmentDate: start || emp.appointmentDate || '',
        dateFinPeriodeEssai: finEssai || emp.dateFinPeriodeEssai || '',
        essaiActions: cellText(row.getCell(10).value) || emp.essaiActions || '',
        essaiResponsable: cellText(row.getCell(11).value) || emp.essaiResponsable || '',
        essaiEcheanceEval: toDisplayDate(row.getCell(12).value) || emp.essaiEcheanceEval || '',
        essaiStatutEval: cellText(row.getCell(13).value) || emp.essaiStatutEval || '',
        essaiCommentaire: cellText(row.getCell(14).value) || emp.essaiCommentaire || '',
        dureeContratMois: emp.dureeContratMois ?? null,
      });
      updated += 1;
    }
  }

  const cdd = wb.getWorksheet('CDD');
  if (cdd) {
    for (let r = 3; r <= cdd.rowCount; r++) {
      const row = cdd.getRow(r);
      const matricule = cellText(row.getCell(1).value);
      if (!matricule) continue;
      const emp = byMat.get(matricule);
      if (!emp) {
        missing += 1;
        console.warn('Matricule absent (CDD):', matricule);
        continue;
      }
      Object.assign(emp, {
        typeContrat: cellText(row.getCell(6).value) || 'CDD',
        dureeContratMois: num(row.getCell(7).value) ?? emp.dureeContratMois ?? null,
        appointmentDate: toDisplayDate(row.getCell(8).value) || emp.appointmentDate || '',
        dateFinContrat: toDisplayDate(row.getCell(9).value) || emp.dateFinContrat || '',
        essaiActions: emp.essaiActions || '',
        essaiResponsable: emp.essaiResponsable || '',
        essaiEcheanceEval: emp.essaiEcheanceEval || '',
        essaiStatutEval: emp.essaiStatutEval || '',
        essaiCommentaire: emp.essaiCommentaire || '',
      });
      updated += 1;
    }
  }

  // Ensure new fields exist on all records
  for (const emp of store.employees) {
    if (emp.dureeContratMois === undefined) emp.dureeContratMois = null;
    if (emp.essaiActions === undefined) emp.essaiActions = '';
    if (emp.essaiResponsable === undefined) emp.essaiResponsable = '';
    if (emp.essaiEcheanceEval === undefined) emp.essaiEcheanceEval = '';
    if (emp.essaiStatutEval === undefined) emp.essaiStatutEval = '';
    if (emp.essaiCommentaire === undefined) emp.essaiCommentaire = '';
  }

  fs.writeFileSync(employeesPath, JSON.stringify(store, null, 2), 'utf8');
  console.log(`Updated ${updated} rows; missing matricules: ${missing}`);
  console.log('Wrote', employeesPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
