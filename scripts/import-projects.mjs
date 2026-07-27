import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = process.env.PROJECTS_XLSX || path.join(__dirname, '..', 'Excel', 'PROJECTS.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'data', 'projects.json');

function num(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (value === '-') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function str(value) {
  return String(value ?? '').trim();
}

function parseDashboardCsr(rows) {
  const fiscalYear = str(rows[0]?.[3]) || 'FY2026';
  return {
    fiscalYear,
    title: 'DASHBOARD CSR',
    effectifs: {
      total: num(rows[6]?.[0]) ?? 0,
      termine: num(rows[6]?.[1]) ?? 0,
      encours: num(rows[6]?.[2]) ?? 0,
      nonDebute: num(rows[6]?.[3]) ?? 0,
    },
    budgetByStatus: [
      { categorie: 'Terminé', prevus: num(rows[6]?.[7]) ?? 0, depense: num(rows[6]?.[8]) ?? 0, ecart: num(rows[6]?.[9]) ?? 0 },
      { categorie: 'En cours', prevus: num(rows[7]?.[7]) ?? 0, depense: num(rows[7]?.[8]) ?? 0, ecart: num(rows[7]?.[9]) ?? 0 },
      { categorie: 'Non debuté', prevus: num(rows[8]?.[7]) ?? 0, depense: num(rows[8]?.[8]) ?? 0, ecart: num(rows[8]?.[9]) ?? 0 },
      { categorie: 'Total', prevus: num(rows[9]?.[7]) ?? 0, depense: num(rows[9]?.[8]) ?? 0, ecart: num(rows[9]?.[9]) ?? 0 },
    ],
    sectors: {
      effectifs: {
        total: num(rows[14]?.[0]) ?? 0,
        counts: {
          Santé: num(rows[14]?.[1]) ?? 0,
          Education: num(rows[14]?.[2]) ?? 0,
          Sociale: num(rows[14]?.[3]) ?? 0,
          Infrastructures: num(rows[14]?.[4]) ?? 0,
        },
      },
      budget: [
        { secteur: 'Santé', prevus: num(rows[14]?.[7]) ?? 0, depense: num(rows[14]?.[8]) ?? 0, ecart: num(rows[14]?.[9]) ?? 0 },
        { secteur: 'Education', prevus: num(rows[15]?.[7]) ?? 0, depense: num(rows[15]?.[8]) ?? 0, ecart: num(rows[15]?.[9]) ?? 0 },
        { secteur: 'Sociale', prevus: num(rows[16]?.[7]) ?? 0, depense: num(rows[16]?.[8]) ?? 0, ecart: num(rows[16]?.[9]) ?? 0 },
        { secteur: 'Infrastructures', prevus: num(rows[17]?.[7]) ?? 0, depense: num(rows[17]?.[8]) ?? 0, ecart: num(rows[17]?.[9]) ?? 0 },
        { secteur: 'TOTAL', prevus: num(rows[18]?.[7]) ?? 0, depense: num(rows[18]?.[8]) ?? 0, ecart: num(rows[18]?.[9]) ?? 0 },
      ],
    },
  };
}

function parseDashboardCc(rows) {
  const fiscalYear = str(rows[0]?.[4]) || 'FY2024';
  const sectorHeaders = rows[12]?.slice(1, 5).map(str).filter(Boolean);
  const sectorEffectif = {};
  sectorHeaders.forEach((name, i) => {
    sectorEffectif[name] = num(rows[13]?.[i + 1]) ?? 0;
  });

  const budgetBySector = [];
  for (let r = 13; r <= 19; r++) {
    const secteur = str(rows[r]?.[6]);
    if (!secteur) continue;
    budgetBySector.push({
      secteur,
      prevus: num(rows[r]?.[7]) ?? 0,
      depense: num(rows[r]?.[8]) ?? 0,
      ecart: num(rows[r]?.[9]) ?? 0,
    });
  }

  const byLocation = [];
  for (let r = 24; r < rows.length; r++) {
    const lieu = str(rows[r]?.[0]);
    if (!lieu) continue;
    byLocation.push({
      lieu,
      nombre: num(rows[r]?.[1]) ?? 0,
      prevus: num(rows[r]?.[2]) ?? 0,
      depense: num(rows[r]?.[3]) ?? 0,
      ecart: num(rows[r]?.[4]) ?? 0,
    });
  }

  return {
    fiscalYear,
    title: 'DASHBOARD CAHIER DES CHARGES',
    effectifs: {
      total: num(rows[5]?.[0]) ?? 0,
      termine: num(rows[5]?.[1]) ?? 0,
      encours: num(rows[5]?.[2]) ?? 0,
      nonDebute: num(rows[5]?.[3]) ?? 0,
    },
    budgetByStatus: [
      { categorie: 'Terminé', prevus: num(rows[5]?.[7]) ?? 0, depense: num(rows[5]?.[8]) ?? 0, ecart: num(rows[5]?.[9]) ?? 0 },
      { categorie: 'En cours', prevus: num(rows[6]?.[7]) ?? 0, depense: num(rows[6]?.[8]) ?? 0, ecart: num(rows[6]?.[9]) ?? 0 },
      { categorie: 'Non debuté', prevus: num(rows[7]?.[7]) ?? 0, depense: num(rows[7]?.[8]) ?? 0, ecart: num(rows[7]?.[9]) ?? 0 },
      { categorie: 'Total', prevus: num(rows[8]?.[7]) ?? 0, depense: num(rows[8]?.[8]) ?? 0, ecart: num(rows[8]?.[9]) ?? 0 },
    ],
    sectors: {
      effectifs: {
        total: num(rows[13]?.[0]) ?? 0,
        counts: sectorEffectif,
      },
      budget: budgetBySector,
    },
    byLocation,
  };
}

function parseProjects(rows) {
  const projects = [];
  for (let r = 4; r < rows.length; r++) {
    const row = rows[r];
    const name = str(row[1]);
    if (!name) continue;

    projects.push({
      id: `p-${r}`,
      numero: num(row[0]),
      name,
      lieu: str(row[2]),
      secteur: str(row[3]),
      typeProjet: str(row[4]),
      sousActivite: str(row[5]),
      annee: str(row[6]),
      dateDebut: str(row[7]),
      dateFin: str(row[8]),
      responsable: str(row[9]),
      budgetPrevu: num(row[10]),
      budgetDepense: num(row[11]) ?? 0,
      budgetPrevuVerifie: false,
      ecart: num(row[12]),
      pctBudget: num(row[13]),
      statut: str(row[15]) || 'Non debuté',
    });
  }
  return projects;
}

function parseExpenses(rows) {
  const expenses = [];
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const numero = num(row[0]);
    if (!numero) continue;
    expenses.push({
      id: `e-${r}`,
      numero,
      date: str(row[1]),
      projet: str(row[2]),
      motif: str(row[3]),
      montant: num(row[4]) ?? 0,
    });
  }
  return expenses;
}

const wb = XLSX.readFile(EXCEL_PATH);
const csrRows = XLSX.utils.sheet_to_json(wb.Sheets['DASHBOARD CSR'], { header: 1, defval: '' });
const ccRows = XLSX.utils.sheet_to_json(wb.Sheets['DASHBOARD CC'], { header: 1, defval: '' });
const projectRows = XLSX.utils.sheet_to_json(wb.Sheets['PROJECTS'], { header: 1, defval: '' });
const expenseRows = XLSX.utils.sheet_to_json(wb.Sheets['Budget expense Details'], { header: 1, defval: '' });

function computeSectorProjectCounts(projects, typeProjet) {
  const counts = {};
  for (const project of projects) {
    if (project.typeProjet !== typeProjet) continue;
    const secteur = String(project.secteur ?? '').trim();
    if (!secteur) continue;
    counts[secteur] = (counts[secteur] ?? 0) + 1;
  }
  return counts;
}

function syncSectorEffectifs(dashboard, projects, typeProjet) {
  dashboard.sectors.effectifs.counts = computeSectorProjectCounts(projects, typeProjet);
  dashboard.sectors.effectifs.total = projects.filter((p) => p.typeProjet === typeProjet).length;
  return dashboard;
}

const projects = parseProjects(projectRows);
const payload = {
  source: EXCEL_PATH,
  importedAt: new Date().toISOString(),
  dashboards: {
    csr: syncSectorEffectifs(parseDashboardCsr(csrRows), projects, 'CSR'),
    cc: syncSectorEffectifs(parseDashboardCc(ccRows), projects, 'Cahier de charges'),
  },
  projects,
  expenses: parseExpenses(expenseRows),
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2), 'utf8');

console.log(`Import OK: ${payload.projects.length} projets, ${payload.expenses.length} dépenses`);
console.log(`→ ${OUT_PATH}`);
