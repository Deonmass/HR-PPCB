/**
 * Importe les sorties (Termination Date) de New Engagements and Terminations
 * dans data/employees/exits.json, et les retire de la base active si besoin.
 *
 * Usage:
 *   node scripts/import-exits-from-engagements.mjs "d:/Rapports/July 26/New Engagements and Terminations_July 2026.xlsx"
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const EMP_PATH = path.join(ROOT, 'data', 'employees', 'employees.json');
const EXIT_PATH = path.join(ROOT, 'data', 'employees', 'exits.json');

const SOURCE =
  process.argv[2]
  || 'd:/Rapports/July 26/New Engagements and Terminations_July 2026.xlsx';

function isMatricule(value) {
  const s = String(value ?? '').trim();
  return /^\d{5,}$/.test(s) ? s : null;
}

function fmtDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const shifted = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${String(parsed.d).padStart(2, '0')}/${String(parsed.m).padStart(2, '0')}/${parsed.y}`;
    }
  }
  const s = String(value).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return s;
}

function displayName(row) {
  if (row.firstName && row.lastName) return `${row.firstName} ${row.lastName}`.trim();
  return [row.lastName, row.initials].filter(Boolean).join(' ').trim();
}

function mapRaison(raw) {
  const s = String(raw || '').toLowerCase();
  if (s.includes('resign') || s.includes('voluntary severance')) return 'Demission';
  if (s.includes('dismiss') || s.includes('misconduct') || s.includes('constructive')) return 'Licenciement';
  if (s.includes('retir')) return 'Retraite';
  if (s.includes('contract') || s.includes('expir')) return 'Fin de contrat';
  return raw.trim() || 'Demission';
}

function localisationFrom(payPoint, sheetName) {
  const p = String(payPoint || '').toUpperCase();
  if (p.startsWith('KC')) return 'Kinshasa';
  if (p.startsWith('KQ')) return 'Lubudi';
  if (p.startsWith('KM')) return 'Zamba';
  const sheet = String(sheetName || '').toLowerCase();
  if (sheet.includes('qco') || sheet.includes('quar')) return 'Lubudi';
  return 'Zamba';
}

function centreCoutFrom(payPoint) {
  const m = String(payPoint || '').match(/^([A-Z]{2}\d{4})/i);
  return m ? m[1].toUpperCase() : '';
}

function companyFromSheet(sheetName) {
  const s = String(sheetName || '').toLowerCase();
  if (s.includes('qco') || s.includes('quar')) return 'PPC Barnet DRC Quarrying';
  return 'PPC Barnet DRC Manufacturing';
}

function departmentFrom(orgUnit, payPoint) {
  const raw = `${orgUnit} ${payPoint}`.toLowerCase();
  if (/\bhr\b|human resource|talent/.test(raw)) return 'Human Resources';
  if (/sales|marketing|customer excellence|customer relationship|customer account/.test(raw)) {
    return 'Sales and Marketing';
  }
  if (/logistic|warehouse|stores|procurement|supply chain|dispatch|inbound|outbound/.test(raw)) {
    return 'Logistic';
  }
  if (/\bshe\b|environment|safety|risk/.test(raw)) return 'Risk & Environment';
  if (/financ|account|internal control|internal audit|revenue/.test(raw)) return 'Finance';
  if (/mining|quarry|dozing/.test(raw)) return 'Mining';
  if (/engineer|mechanical|instrument|garage|plumber/.test(raw)) return 'Engineering';
  if (/packag|bagging|burning|production|optim/.test(raw)) return 'Production';
  if (/laborator|quality/.test(raw)) return 'Quality';
  if (/legal/.test(raw)) return 'Legal';
  if (/project|performance|managing director|ceo/.test(raw)) return 'General Management';
  const cleaned = String(orgUnit || payPoint || '')
    .replace(/^[A-Z]{2}\d{4}\s*[-–]?\s*/i, '')
    .trim();
  return cleaned || '—';
}

function parseFrDate(dateStr) {
  const m = String(dateStr || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isAfterDate(a, b) {
  const da = parseFrDate(a);
  const db = parseFrDate(b);
  return Boolean(da && db && da.getTime() > db.getTime());
}

function ageFromBirth(dateStr) {
  const birth = parseFrDate(dateStr);
  if (!birth) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

function parseTerminations(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const out = [];
  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    });
    let headerRow = -1;
    for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
      const a = String(rows[r]?.[0] ?? '').toLowerCase();
      if (a.includes('emp number')) {
        headerRow = r;
        break;
      }
    }
    if (headerRow < 0) continue;
    for (let r = headerRow + 1; r < rows.length; r += 1) {
      const row = rows[r];
      if (!row) continue;
      const matricule = isMatricule(row[0]);
      if (!matricule) continue;
      const terminationDate = fmtDate(row[6]);
      if (!terminationDate) continue;
      out.push({
        sheetName,
        matricule,
        lastName: String(row[1] ?? '').trim(),
        initials: String(row[2] ?? '').trim(),
        firstName: String(row[10] ?? '').trim(),
        orgUnit: String(row[3] ?? '').trim(),
        payPoint: String(row[4] ?? '').trim(),
        employmentDate: fmtDate(row[5]),
        terminationDate,
        terminationReason: String(row[7] ?? '').trim(),
        position: String(row[16] ?? '').trim(),
        grade: String(row[17] ?? '').trim(),
        gender: String(row[13] ?? '').trim(),
        nationality: String(row[14] ?? '').trim(),
        birthDate: fmtDate(row[12]),
      });
    }
  }
  return out;
}

function emptyHr() {
  return {
    company: '',
    centreCout: '',
    appointmentDate: '',
    gender: '',
    dateOfBirth: '',
    age: null,
    nationality: '',
    maritalStatus: '',
    numberOfChildren: null,
    personnelArea: 'DRC',
    personnelSubArea: '',
    employeeSubGroup: '',
    payrollArea: 'Monthly',
    position: '',
    departmentHr: '',
    lineManagerName: '',
    lineManagerPosition: '',
    patersonGrade: '',
    statut: 'Inactive',
    typeContrat: '',
    dureeContratMois: null,
    periodeEssaiMois: null,
    dateFinPeriodeEssai: '',
    dateFinContrat: '',
    raisonExit: 'Demission',
    essaiActions: '',
    essaiResponsable: '',
    essaiEcheanceEval: '',
    essaiStatutEval: '',
    essaiCommentaire: '',
    cddHistoriqueDebut: '',
    cddHistoriqueFin: '',
    cddHistoriqueDureeMois: null,
    datePassageCdi: '',
    cnss: '',
    nif: '',
  };
}

if (!fs.existsSync(SOURCE)) {
  console.error('Fichier introuvable:', SOURCE);
  process.exit(1);
}

const rows = parseTerminations(SOURCE);
const byMatricule = new Map();
for (const row of rows) {
  const prev = byMatricule.get(row.matricule);
  if (!prev) {
    byMatricule.set(row.matricule, row);
    continue;
  }
  const [d1, m1, y1] = prev.terminationDate.split('/').map(Number);
  const [d2, m2, y2] = row.terminationDate.split('/').map(Number);
  if (new Date(y2, m2 - 1, d2) > new Date(y1, m1 - 1, d1)) {
    byMatricule.set(row.matricule, row);
  }
}

const employeesStore = JSON.parse(fs.readFileSync(EMP_PATH, 'utf8'));
const exitsStore = JSON.parse(fs.readFileSync(EXIT_PATH, 'utf8'));
const employees = Array.isArray(employeesStore.employees) ? employeesStore.employees : [];
const exits = Array.isArray(exitsStore.exits) ? exitsStore.exits : [];

const now = new Date().toISOString();
let added = 0;
let updated = 0;
let moved = 0;
let skippedRehire = 0;

for (const row of byMatricule.values()) {
  const raisonExit = mapRaison(row.terminationReason);
  const dept = departmentFrom(row.orgUnit, row.payPoint);
  const nom = displayName(row);
  const loc = localisationFrom(row.payPoint, row.sheetName);
  const patch = {
    statut: 'Inactive',
    dateFinContrat: row.terminationDate,
    raisonExit,
    appointmentDate: row.employmentDate || undefined,
    dateOfBirth: row.birthDate || undefined,
    age: ageFromBirth(row.birthDate),
    gender: row.gender || undefined,
    nationality: row.nationality || undefined,
    grade: row.grade || undefined,
    jobTitle: row.position || undefined,
    position: row.position || undefined,
    company: companyFromSheet(row.sheetName),
    centreCout: centreCoutFrom(row.payPoint),
    localisation: loc,
    departement: dept,
    departmentHr: dept,
  };

  const exitIdx = exits.findIndex((e) => e.matricule === row.matricule);
  const empIdx = employees.findIndex((e) => e.matricule === row.matricule);

  if (empIdx >= 0) {
    const current = employees[empIdx];
    if (isAfterDate(current.appointmentDate, row.terminationDate)) {
      skippedRehire += 1;
      continue;
    }
  }

  if (exitIdx >= 0) {
    const current = exits[exitIdx];
    exits[exitIdx] = {
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')),
      nom: current.nom || nom,
      statut: 'Inactive',
      dateFinContrat: row.terminationDate,
      raisonExit,
      updatedAt: now,
    };
    updated += 1;
    if (empIdx >= 0) {
      employees.splice(empIdx, 1);
      moved += 1;
    }
    continue;
  }

  if (empIdx >= 0) {
    const current = employees[empIdx];
    exits.push({
      ...current,
      ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')),
      nom: current.nom || nom,
      statut: 'Inactive',
      dateFinContrat: row.terminationDate,
      raisonExit,
      updatedAt: now,
    });
    employees.splice(empIdx, 1);
    moved += 1;
    continue;
  }

  exits.push({
    id: randomUUID(),
    matricule: row.matricule,
    nom,
    ...emptyHr(),
    ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined && v !== '')),
    statut: 'Inactive',
    dateFinContrat: row.terminationDate,
    raisonExit,
    createdAt: now,
    updatedAt: now,
  });
  added += 1;
}

exits.sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr', { sensitivity: 'base' }));

fs.writeFileSync(EMP_PATH, JSON.stringify({ employees }, null, 2), 'utf8');
fs.writeFileSync(EXIT_PATH, JSON.stringify({ exits }, null, 2), 'utf8');

console.log(`Source: ${SOURCE}`);
console.log(`Terminations uniques: ${byMatricule.size}`);
console.log(`Ajoutés: ${added} · Mis à jour: ${updated} · Déplacés depuis actifs: ${moved} · Réembauches ignorées: ${skippedRehire}`);
console.log(`Exits total: ${exits.length} · Actifs restants: ${employees.length}`);
