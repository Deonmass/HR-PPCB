import fs from 'fs';
import path from 'path';
import XlsxPopulate from 'xlsx-populate';

function norm(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function excelSerialToIso(serial) {
  if (typeof serial !== 'number' || !Number.isFinite(serial)) return '';
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(utc);
  return d.toISOString().slice(0, 10);
}

function cellText(v) {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v && 'text' in v) return String(v.text || '');
  return String(v).trim();
}

const template = path.join(process.cwd(), 'Excel/templates/sante/PATHOLOGIES_TEMPLATE.xlsx');
const wb = await XlsxPopulate.fromFileAsync(template);
const sheet = wb.sheet('Données');
const employees = JSON.parse(fs.readFileSync('data/employees/employees.json', 'utf8')).employees || [];
const dependants = JSON.parse(fs.readFileSync('data/dependants/dependants.json', 'utf8')).dependants || [];

const visits = [];
for (let r = 2; r <= 400; r++) {
  const nom = cellText(sheet.cell(r, 2).value());
  const pathologie = cellText(sheet.cell(r, 7).value());
  if (!nom && !pathologie) continue;
  const date2 = cellText(sheet.cell(r, 12).value());
  const serial = sheet.cell(r, 1).value();
  const date = /^\d{4}-\d{2}-\d{2}/.test(date2) ? date2.slice(0, 10) : excelSerialToIso(Number(serial));
  if (!date || (!nom && !pathologie)) continue;
  const postnom = cellText(sheet.cell(r, 3).value());
  const sexeRaw = cellText(sheet.cell(r, 4).value()).toUpperCase();
  const ageRaw = sheet.cell(r, 5).value();
  const typeMalade = cellText(sheet.cell(r, 6).value()) || 'AGENT';
  const target = norm(`${nom} ${postnom}`);
  let employeeMatricule = '';
  let employeeNom = '';
  let dependantId = null;
  const isFamily = /enfant|epouse|conjoint/i.test(typeMalade);
  if (isFamily) {
    const dep = dependants.find((d) => {
      const n = norm(d.nom);
      return n === target || n.includes(target) || target.includes(n);
    });
    if (dep) {
      dependantId = dep.id;
      employeeMatricule = dep.matricule || '';
      const emp = employees.find((e) => e.matricule === dep.matricule);
      employeeNom = emp?.nom || '';
    }
  } else {
    const emp = employees.find((e) => {
      const n = norm(e.nom);
      return n === target || n === norm(`${postnom} ${nom}`) || n.includes(target) || target.includes(n);
    });
    if (emp) {
      employeeMatricule = emp.matricule;
      employeeNom = emp.nom;
    }
  }
  visits.push({
    id: `sante-imp-${String(r).padStart(4, '0')}`,
    date,
    nom: nom || '—',
    postnom,
    sexe: sexeRaw.startsWith('F') ? 'F' : sexeRaw.startsWith('M') ? 'M' : '',
    age: typeof ageRaw === 'number' ? ageRaw : ageRaw ? Number(ageRaw) : null,
    typeMalade,
    pathologie,
    traitement: cellText(sheet.cell(r, 8).value()),
    reference: cellText(sheet.cell(r, 9).value()) || 'NON',
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    employeeMatricule,
    employeeNom,
    dependantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: 'import-template',
  });
}

const outDir = path.join(process.cwd(), 'data/sante');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'visits.json'), `${JSON.stringify({ visits }, null, 2)}\n`);
const linked = visits.filter((v) => v.employeeMatricule).length;
console.log('imported', visits.length, 'linked', linked);
