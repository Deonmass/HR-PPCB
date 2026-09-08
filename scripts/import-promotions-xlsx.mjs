/**
 * Importe Employee mvt - promotions.xlsx (3 feuilles) vers data/employees/mouvements.json.
 * N’écrase pas les postes actuels des fiches employés.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const XLSX_PATH =
  process.argv[2] ||
  'd:\\Agents\\Cug Kiesse\\Employee mvt - promotions.xlsx';
const OUT_PATH = path.join(process.cwd(), 'data', 'employees', 'mouvements.json');
const EMP_PATH = path.join(process.cwd(), 'data', 'employees', 'employees.json');

const MONTHS = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function isoDate(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function fromJsDate(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return isoDate(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

function parseMonthCell(value, year) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return fromJsDate(value);
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed.m && parsed.d) return isoDate(parsed.y, parsed.m, parsed.d);
  }
  const s = String(value).trim();
  if (!s) return null;
  const asDate = new Date(s);
  if (!Number.isNaN(asDate.getTime()) && /\d{4}/.test(s) && /[A-Za-z]{3}/.test(s)) {
    return fromJsDate(asDate);
  }
  const m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)$/i);
  if (m && year) {
    const month = MONTHS[m[2].toLowerCase()];
    if (month) return isoDate(year, month, Number(m[1]));
  }
  return null;
}

function parseYearCell(value) {
  if (typeof value === 'number' && value >= 2000 && value <= 2100) return value;
  const n = Number(String(value || '').trim());
  if (Number.isInteger(n) && n >= 2000 && n <= 2100) return n;
  return null;
}

/** FY27 → 2026, FY26 → 2025, FY24 → 2023 */
function sheetAnnee(sheetName) {
  const m = String(sheetName).match(/FY(\d{2})/i);
  if (!m) return null;
  return 2000 + Number(m[1]) - 1;
}

function mapType(flag, posteAvant, posteActuel) {
  const f = String(flag || '').trim().toUpperCase();
  if (f.startsWith('Y')) return 'promotion';
  const same = posteAvant.trim().toLowerCase() === posteActuel.trim().toLowerCase();
  return same ? 'reclassement' : 'changement_transversal';
}

function loadEmployees() {
  const raw = JSON.parse(fs.readFileSync(EMP_PATH, 'utf8'));
  const list = Array.isArray(raw.employees) ? raw.employees : [];
  const map = new Map();
  for (const e of list) {
    const mat = String(e.matricule || '').trim();
    if (mat) map.set(mat, e);
  }
  return map;
}

function parseWorkbook(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const rowsOut = [];
  for (const sheetName of wb.SheetNames) {
    const anneeFeuille = sheetAnnee(sheetName);
    const matrix = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: true,
    });
    let year = anneeFeuille;
    let lastDate = null;
    for (const row of matrix) {
      const yearCell = parseYearCell(row[1]);
      if (yearCell) year = yearCell;
      const monthIso = parseMonthCell(row[2], year);
      if (monthIso) {
        lastDate = monthIso;
        if (!year) year = Number(monthIso.slice(0, 4));
      }
      const matricule = String(row[3] ?? '').trim();
      const nom = String(row[4] ?? '').trim();
      if (!/^\d{5,}$/.test(matricule) || !nom) continue;
      const annee = anneeFeuille || year || (lastDate ? Number(lastDate.slice(0, 4)) : 0);
      const date = lastDate || (annee ? String(annee) : '');
      if (!date) continue;
      const gradeAvant = String(row[5] ?? '').trim();
      const gradeActuel = String(row[6] ?? '').trim();
      const posteAvant = String(row[7] ?? '').trim();
      const posteActuel = String(row[8] ?? '').trim() || posteAvant;
      if (!posteActuel) continue;
      const flag = String(row[9] ?? '').trim();
      rowsOut.push({
        sheet: sheetName,
        annee,
        matricule,
        nom,
        posteAvant,
        posteActuel,
        date,
        type: mapType(flag, posteAvant, posteActuel),
        notes: [
          gradeAvant || gradeActuel ? `Grade ${gradeAvant || '—'} → ${gradeActuel || '—'}` : '',
          flag && !/^Y$/i.test(flag) ? `Promotion: ${flag}` : '',
          `Source: ${sheetName}`,
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }
  }
  rowsOut.sort(
    (a, b) =>
      a.annee - b.annee
      || String(a.date).localeCompare(String(b.date))
      || a.matricule.localeCompare(b.matricule),
  );
  return rowsOut;
}

function main() {
  if (!fs.existsSync(XLSX_PATH)) {
    console.error('Fichier introuvable:', XLSX_PATH);
    process.exit(1);
  }
  const employees = loadEmployees();
  const parsed = parseWorkbook(XLSX_PATH);
  const now = new Date().toISOString();
  const mouvements = parsed.map((r, i) => {
    const emp = employees.get(r.matricule);
    const dept = (emp?.departement || emp?.departmentHr || '').trim();
    return {
      id: `mvt-promo-${r.annee}-${r.matricule}-${i + 1}`,
      numeroOrdre: parsed.length - i,
      agentMatricule: r.matricule,
      agentNom: (emp?.nom || r.nom).trim(),
      posteAvant: r.posteAvant,
      departementAvant: dept,
      posteActuel: r.posteActuel,
      departementActuel: dept,
      date: r.date,
      annee: r.annee,
      sourceSheet: r.sheet,
      type: r.type,
      notes: r.notes,
      createdAt: now,
      updatedAt: now,
      createdBy: 'import-promotions-xlsx',
    };
  });
  const payload = { nextOrdre: mouvements.length + 1, mouvements };
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  const bySheet = {};
  const byYear = {};
  for (const m of mouvements) {
    bySheet[m.sourceSheet] = (bySheet[m.sourceSheet] || 0) + 1;
    byYear[m.annee] = (byYear[m.annee] || 0) + 1;
  }
  console.log(`Importé ${mouvements.length} mouvements → ${OUT_PATH}`);
  console.log('par feuille', bySheet);
  console.log('par année', byYear);
}

main();
