/**
 * One-shot seed of JSON stores from Excel / legacy snapshots.
 * Run: node scripts/seed-json-stores.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx-js-style');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeJson(rel, data) {
  const full = path.join(root, rel);
  ensureDir(full);
  fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf8');
  console.log('wrote', rel);
}

function str(v) {
  return String(v ?? '').trim();
}

function num(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function readSheetRows(filePath, sheetName, dataStart) {
  if (!fs.existsSync(filePath)) return [];
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
  return aoa.slice(dataStart);
}

// Village
{
  const employeeXlsx = path.join(root, 'Excel', 'EMPLOYEE.xlsx');
  const tailles = readSheetRows(employeeXlsx, 'TAILLE', 1)
    .map((row) => {
      const code = str(row[0]);
      if (!code) return null;
      return { code, label: str(row[1]) || code, capacite: num(row[2]), commentaires: str(row[3]) };
    })
    .filter(Boolean);
  const maisons = readSheetRows(employeeXlsx, 'MAISON', 1)
    .map((row) => {
      const numero = str(row[0]);
      if (!numero) return null;
      const taille = str(row[1]);
      return {
        numero,
        taille,
        typeMaison: str(row[2]) || taille,
        commentaires: str(row[3]),
        occupantExterne: str(row[4]),
      };
    })
    .filter(Boolean);
  const history = readSheetRows(employeeXlsx, 'AFFECTATION_HISTO', 1)
    .map((row) => {
      const date = str(row[0]);
      const matricule = str(row[2]);
      if (!date && !matricule) return null;
      return {
        date,
        action: str(row[1]) || 'Affecter',
        matricule,
        nom: str(row[3]),
        numeroVilla: str(row[4]),
        typeMaison: str(row[5]),
        ancienNumero: str(row[6]),
        raison: str(row[7]),
        commentaire: str(row[8]),
      };
    })
    .filter(Boolean);
  const suggestions = readSheetRows(employeeXlsx, 'SUGGESTION_AFFECTATION', 1)
    .map((row) => {
      const id = str(row[0]);
      const numeroVilla = str(row[1]);
      if (!id || !numeroVilla) return null;
      return {
        id,
        numeroVilla,
        matricule: str(row[2]),
        nom: str(row[3]),
        commentaire: str(row[4]),
        createdAt: str(row[5]),
      };
    })
    .filter(Boolean);
  writeJson('data/village/tailles.json', { tailles });
  writeJson('data/village/maisons.json', { maisons });
  writeJson('data/village/affectation-history.json', { entries: history });
  writeJson('data/village/affectation-suggestions.json', { suggestions });
}

// Factures / fournisseurs
{
  const preferred = path.join(root, 'Excel', 'factures-fournisseurs', 'FACTURES_FOURNISSEURS.xlsx');
  const legacy = path.join(root, 'Excel', 'FACTURES_FOURNISSEURS.xlsx');
  const xlsx = fs.existsSync(preferred) ? preferred : legacy;
  const factureRows = readSheetRows(xlsx, 'Factures', 2);
  const factures = [];
  let nextFactureSeq = 2;
  for (let i = 0; i < factureRows.length; i += 1) {
    const row = factureRows[i];
    const facture = str(row[2]);
    const societe = str(row[1]);
    if (!facture && !societe) continue;
    const id = `fac-${2 + i}`;
    nextFactureSeq = Math.max(nextFactureSeq, 2 + i + 1);
    const pr = str(row[5]);
    const po = str(row[7]);
    const grn = str(row[9]);
    const payment = str(row[11]);
    let statut = 'facture';
    if (pr && !po) statut = 'pr';
    else if (po && !grn) statut = 'po';
    else if (grn && !payment) statut = 'posted';
    else if (payment) statut = 'paid';
    const labels = {
      facture: 'Facture reçue',
      pr: 'unpaid',
      po: 'unpaid',
      posted: 'Posted and unpaid',
      paid: 'paid',
    };
    factures.push({
      id,
      date: str(row[0]),
      societe,
      facture,
      montant: num(row[3]),
      echeance: str(row[4]),
      pr,
      datePr: str(row[6]),
      po,
      datePo: str(row[8]),
      grn,
      dateGrn: str(row[10]),
      payment,
      datePym: str(row[12]),
      statut,
      statutLabel: labels[statut],
      commentaire: str(row[14]),
    });
  }
  const fournisseurRows = readSheetRows(xlsx, 'Fournisseurs', 1);
  const fournisseurs = [];
  let nextFournisseurSeq = 1;
  for (let i = 0; i < fournisseurRows.length; i += 1) {
    const nom = str(fournisseurRows[i][0]);
    if (!nom) continue;
    const seq = 1 + i;
    nextFournisseurSeq = Math.max(nextFournisseurSeq, seq + 1);
    fournisseurs.push({ id: `frn-${seq}`, nom, natureService: str(fournisseurRows[i][1]) });
  }
  writeJson('data/factures-fournisseurs/factures.json', { factures, nextFactureSeq });
  writeJson('data/factures-fournisseurs/fournisseurs.json', { fournisseurs, nextFournisseurSeq });
}

// Projects
{
  const snapshotPath = path.join(root, 'data', 'projects.json');
  if (fs.existsSync(snapshotPath)) {
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    writeJson('data/projects/projects.json', { projects: snapshot.projects ?? [] });
    writeJson('data/projects/expenses.json', { expenses: snapshot.expenses ?? [] });
  } else {
    writeJson('data/projects/projects.json', { projects: [] });
    writeJson('data/projects/expenses.json', { expenses: [] });
  }
}

// Overtimes
{
  const entriesPath = path.join(root, 'data', 'timesheet', 'entries.json');
  const weeklyPath = path.join(root, 'data', 'timesheet', 'weekly-ot.json');
  const timesheets = fs.existsSync(entriesPath)
    ? JSON.parse(fs.readFileSync(entriesPath, 'utf8'))
    : { periods: {} };
  const weekly = fs.existsSync(weeklyPath)
    ? JSON.parse(fs.readFileSync(weeklyPath, 'utf8'))
    : { periods: {} };
  writeJson('data/overtimes/timesheets.json', { periods: timesheets.periods ?? {} });
  const monthDir = path.join(root, 'data', 'overtimes', 'timesheets');
  fs.mkdirSync(monthDir, { recursive: true });
  for (const [key, period] of Object.entries(timesheets.periods ?? {})) {
    const [ys, ms] = String(key).split('-');
    const year = Number(ys);
    const month = Number(ms);
    if (!year || !month) continue;
    const agents = {};
    for (const [dateKey, dayMap] of Object.entries(period.days ?? {})) {
      for (const [mat, entry] of Object.entries(dayMap ?? {})) {
        const id = String(mat).trim();
        if (!id) continue;
        if (!agents[id]) agents[id] = { matricule: id, days: {} };
        agents[id].days[dateKey] = entry;
      }
    }
    const name = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}.json`;
    writeJson(`data/overtimes/timesheets/${name}`, { year, month, updatedAt: new Date().toISOString(), agents });
  }
  writeJson('data/overtimes/weekly-overtime.json', { periods: weekly.periods ?? {} });
}

// Travel history
{
  const historyXlsx = path.join(root, 'Excel', 'templates', 'travel', 'Historique mission.xlsx');
  const alt = path.join(root, 'data', 'travel', 'Historique mission.xlsx');
  const file = fs.existsSync(historyXlsx) ? historyXlsx : alt;
  const rowsRaw = readSheetRows(file, 'BASE VOYAGE', 1);
  const rows = [];
  let nextRowIndex = 1;
  for (let i = 0; i < rowsRaw.length; i += 1) {
    const row = rowsRaw[i];
    const ref = str(row[1]);
    if (!ref) continue;
    const rowIndex = 1 + i;
    nextRowIndex = Math.max(nextRowIndex, rowIndex + 1);
    const employeeName = str(row[3]);
    const matricule = str(row[2]);
    const department = str(row[5]);
    const position = str(row[4]);
    const departureDate = str(row[10]);
    const returnDate = str(row[11]);
    rows.push({
      rowIndex,
      date: str(row[0]),
      ref,
      employee: matricule ? `${employeeName} (${matricule})` : employeeName,
      department: department && position ? `${department} — ${position}` : department || position,
      travelDates: departureDate && returnDate ? `${departureDate} → ${returnDate}` : departureDate || returnDate,
      tripDays: num(row[12]) ?? 0,
      totalBudget: num(row[20]) ?? 0,
      recordId: '',
    });
  }
  writeJson('data/travel/history.json', { rows, nextRowIndex });
}

// Params.xlsx → settings + auth users (no export template)
{
  const paramsXlsx = path.join(root, 'Excel', 'Params.xlsx');
  function slugify(value) {
    return (
      String(value ?? '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'item'
    );
  }

  const sheet1 = readSheetRows(paramsXlsx, 'Sheet1', 1);
  const deptNames = new Set();
  const costCenters = [];
  for (const row of sheet1) {
    const department = str(row[0]);
    const costCenter = str(row[1]);
    if (department) deptNames.add(department);
    if (!costCenter) continue;
    costCenters.push({
      id: `cc-${slugify(costCenter)}`,
      code: costCenter,
      name: costCenter,
      departmentId: department ? `dept-${slugify(department)}` : undefined,
      active: true,
    });
  }
  const departments = [...deptNames]
    .sort((a, b) => a.localeCompare(b, 'fr'))
    .map((name) => ({
      id: `dept-${slugify(name)}`,
      name,
      code: name,
      active: true,
    }));
  writeJson('data/settings/departments.json', { departments });
  writeJson('data/settings/cost-centers.json', { costCenters });

  function parseStatus(value) {
    const status = str(value).toLowerCase();
    if (!status) return true;
    return status === 'actif' || status === 'active' || status === '1' || status === 'true' || status === 'oui';
  }

  function parsePermissions(value) {
    const raw = str(value);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.menus)) return parsed.menus;
    } catch {
      // ignore
    }
    return [];
  }

  function parseMatricule(value) {
    const raw = str(value);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.matricule) {
        return { matricule: str(parsed.matricule), linkedEmployee: parsed };
      }
    } catch {
      // plain matricule
    }
    return { matricule: raw };
  }

  const userRows = readSheetRows(paramsXlsx, 'users', 1);
  const users = [];
  for (const row of userRows) {
    const username = str(row[0]);
    if (!username) continue;
    const email = str(row[3]);
    const link = parseMatricule(row[7]);
    users.push({
      id: username,
      username,
      password: str(row[4]) || '123',
      displayName: str(row[1]) || username,
      initials: (str(row[2]) || 'US').toUpperCase().slice(0, 3),
      email: email && email !== '-' ? email : undefined,
      matricule: link.matricule,
      linkedEmployee: link.linkedEmployee,
      active: parseStatus(row[5]),
      createdAt: new Date().toISOString(),
      menus: parsePermissions(row[6]),
    });
  }
  if (users.length) {
    writeJson('data/auth/users.json', { users });
  } else {
    console.log('skip data/auth/users.json (no users sheet in Params.xlsx)');
  }
}

console.log('Seed complete.');
