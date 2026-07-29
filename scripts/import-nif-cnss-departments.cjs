/**
 * Import départements, centres de coût, et maj employés (département, CC, CNSS, NIF)
 * depuis le fichier payroll « NIF CNSS ».
 *
 * Usage:
 *   node scripts/import-nif-cnss-departments.cjs [chemin.xlsx]
 */
const XLSX = require('xlsx-js-style');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DEFAULT_EXCEL = path.join(
  process.env.USERPROFILE || process.env.HOME || '',
  'Downloads',
  'NIF CNSS- 05 06 26.xlsx',
);
const excelPath = process.argv[2] || DEFAULT_EXCEL;

function slugify(value) {
  return (
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

function deptId(name) {
  return `dept-${slugify(name)}`;
}

function ccId(code) {
  return `cc-${slugify(code)}`;
}

function parseCostCentre(raw) {
  const text = String(raw || '').trim();
  const match = text.match(/^([A-Za-z0-9]+)\s*[-–—]\s*(.*)$/);
  if (match) {
    return { code: match[1].trim(), name: (match[2] || match[1]).trim() };
  }
  return { code: text, name: text };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw err;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

if (!fs.existsSync(excelPath)) {
  console.error(`Fichier introuvable: ${excelPath}`);
  process.exit(1);
}

const wb = XLSX.read(fs.readFileSync(excelPath), { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

/** @type {Map<string, {matricule: string, department: string, ccCode: string, ccName: string, cnss: string, nif: string}>} */
const byMatricule = new Map();
const deptNames = new Set();
/** @type {Map<string, { code: string, name: string, department: string }>} */
const costCenters = new Map();

for (const row of rows) {
  const matricule = String(row['Emp Number'] || '').trim();
  const department = String(row.Departments || '').trim();
  const { code: ccCode, name: ccName } = parseCostCentre(row['Cost Centre Description']);
  const cnss = String(row['CNSS registration number'] || '').trim();
  const nif = String(row['NIF Numbers'] || '').trim();

  if (department) deptNames.add(department);
  if (ccCode) {
    const prev = costCenters.get(ccCode.toUpperCase());
    costCenters.set(ccCode.toUpperCase(), {
      code: ccCode,
      name: ccName || ccCode,
      department: department || prev?.department || '',
    });
  }

  if (!matricule) continue;
  byMatricule.set(matricule, {
    matricule,
    department,
    ccCode,
    ccName,
    cnss,
    nif,
  });
}

const departments = [...deptNames]
  .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
  .map((name) => ({
    id: deptId(name),
    name,
    code: name,
    active: true,
  }));

const deptIdByName = new Map(departments.map((d) => [d.name, d.id]));

const costCentersList = [...costCenters.values()]
  .sort((a, b) => a.code.localeCompare(b.code, 'fr'))
  .map((cc) => ({
    id: ccId(cc.code),
    code: cc.code,
    name: cc.name || cc.code,
    departmentId: deptIdByName.get(cc.department) || undefined,
    active: true,
  }));

const departmentsPath = path.join(ROOT, 'data', 'settings', 'departments.json');
const costCentersPath = path.join(ROOT, 'data', 'settings', 'cost-centers.json');
const employeesPath = path.join(ROOT, 'data', 'employees', 'employees.json');
const exitsPath = path.join(ROOT, 'data', 'employees', 'exits.json');

// Backup once per run
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(ROOT, 'data', '_backups', `nif-cnss-${stamp}`);
fs.mkdirSync(backupDir, { recursive: true });
for (const file of [departmentsPath, costCentersPath, employeesPath, exitsPath]) {
  if (fs.existsSync(file)) {
    fs.copyFileSync(file, path.join(backupDir, path.basename(file)));
  }
}

writeJson(departmentsPath, { departments });
writeJson(costCentersPath, { costCenters: costCentersList });

const now = new Date().toISOString();
const employeesStore = readJson(employeesPath, { employees: [] });
const exitsStore = readJson(exitsPath, { exits: [] });

function patchList(list) {
  let updated = 0;
  let unchanged = 0;
  const missing = [];
  const next = list.map((employee) => {
    const src = byMatricule.get(String(employee.matricule));
    if (!src) return employee;
    const patch = {
      ...employee,
      departement: src.department || employee.departement,
      centreCout: src.ccCode || employee.centreCout,
      cnss: src.cnss,
      nif: src.nif,
      updatedAt: now,
    };
    const changed =
      patch.departement !== employee.departement
      || patch.centreCout !== employee.centreCout
      || patch.cnss !== (employee.cnss || '')
      || patch.nif !== (employee.nif || '');
    if (changed) {
      updated += 1;
      return patch;
    }
    unchanged += 1;
    return { ...employee, cnss: employee.cnss || '', nif: employee.nif || '' };
  });

  for (const mat of byMatricule.keys()) {
    if (!list.some((e) => String(e.matricule) === mat)) missing.push(mat);
  }

  return { next, updated, unchanged, missing };
}

const activeResult = patchList(employeesStore.employees || []);
const exitResult = patchList(exitsStore.exits || []);

// Matricules Excel absents des deux stores
const known = new Set([
  ...(employeesStore.employees || []).map((e) => String(e.matricule)),
  ...(exitsStore.exits || []).map((e) => String(e.matricule)),
]);
const excelMissingInApp = [...byMatricule.keys()].filter((m) => !known.has(m));

writeJson(employeesPath, { employees: activeResult.next });
writeJson(exitsPath, { exits: exitResult.next });

const report = {
  source: excelPath,
  backup: backupDir,
  excelRows: rows.length,
  uniqueMatricules: byMatricule.size,
  departments: departments.length,
  costCenters: costCentersList.length,
  employeesUpdated: activeResult.updated,
  exitsUpdated: exitResult.updated,
  employeesUnchanged: activeResult.unchanged,
  exitsUnchanged: exitResult.unchanged,
  excelMatriculesMissingInApp: excelMissingInApp,
};

fs.writeFileSync(
  path.join(backupDir, 'import-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);

console.log(JSON.stringify(report, null, 2));
