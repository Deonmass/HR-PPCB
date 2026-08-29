import type { DocumentField, Employee, CompletionStats, DashboardData } from './types';
import { formatRate, ratioToRate, roundRate } from './format-rate';

/** 19 critères — libellés exacts feuille CHECK DOCUMENTS BASE */
export const DOCUMENT_FIELDS: DocumentField[] = [
  { key: 'Copie carte electeur passeport', label: 'Copie carte d\u2019électeur, passeport etc…', short: '1' },
  { key: '2 Photos passeport', label: '2 Photos passeport', short: '2' },
  { key: 'Acte de mariage', label: 'Acte de mariage', short: '3' },
  { key: 'Acte certificat naissance enfants', label: 'Acte/Certificat de naissance enfants', short: '4' },
  { key: 'Extrait casier judiciaire', label: 'Extrait de casier Judiciaire ou déclaration sur l\u2019honneur ou certificat de bonne vie et mœurs', short: '5' },
  { key: 'Attestation fin service', label: 'Attestation de fin service antérieur rendu ', short: '6' },
  { key: 'Diplome releve notes', label: 'Diplôme ou relevé de notes ou certificats professionnels', short: '7' },
  { key: 'Certificat residence expat', label: 'Certificat de résidence (expat)', short: '8' },
  { key: 'Aptitude physique', label: 'Aptitude physique', short: '9' },
  { key: 'Curriculum vitae', label: 'Curriculum vitae', short: '10' },
  { key: 'No CNSS', label: 'N° CNSS ou copie carte cnss ', short: '11' },
  { key: 'RRF', label: 'RRF', short: '12' },
  { key: 'References recues', label: 'Références reçues', short: '13' },
  { key: 'Fiche induction', label: 'Fiche d\u2019induction', short: '14' },
  { key: 'Accuse reception code conduite', label: 'Accusé de réception de/du code de conduite, ROI, Ethique, harcèlement, IT…', short: '15' },
  { key: 'IT arrival form', label: 'IT arrival form', short: '16' },
  { key: 'SAP input form', label: 'SAP input form', short: '17' },
  { key: 'Contrat travail Onem', label: 'Contrat de travail signé et visé par l\u2019Onem', short: '18' },
  { key: 'Contrat Bail village PPC', label: 'Contrat de Bail (village  PPC)', short: '19' },
];

export function normalizeDocStatus(value: string | undefined): 'Y' | 'N' | 'NA' {
  const v = (value || 'N').toUpperCase().trim();
  if (v === 'Y' || v === 'NA') return v;
  return 'N';
}

export function calcDocumentCompletion(employee: Employee): CompletionStats {
  const docs = employee.documents || {};
  let applicable = 0;
  let complete = 0;

  for (const field of DOCUMENT_FIELDS) {
    const val = normalizeDocStatus(String(docs[field.key] || ''));
    if (val === 'NA') continue;
    applicable++;
    if (val === 'Y') complete++;
  }

  const pct = applicable === 0 ? 100 : ratioToRate(complete, applicable);
  return { applicable, complete, pct, missing: applicable - complete };
}

export function calcRowCellStats(employee: Employee) {
  let y = 0;
  let n = 0;
  let na = 0;

  for (const field of DOCUMENT_FIELDS) {
    const val = normalizeDocStatus(String(employee.documents?.[field.key] || ''));
    if (val === 'Y') y++;
    else if (val === 'NA') na++;
    else n++;
  }

  const total = y + n + na;
  const rate = total ? ratioToRate(y + na, total) : 100;

  return { y, n, na, total, rate };
}

export interface CellAggregateStats {
  sumY: number;
  sumN: number;
  sumNa: number;
  totalCells: number;
  yPct: number;
  naPct: number;
  nPct: number;
  conformeRate: number;
  nonConformeRate: number;
}

/** Formule Excel CHECK DOCUMENTS BASE : Σ Y/NA/N puis taux conformité = %Y + %NA */
export function calcCellAggregateStats(employees: Employee[]): CellAggregateStats {
  let sumY = 0;
  let sumN = 0;
  let sumNa = 0;

  for (const emp of employees) {
    const row = calcRowCellStats(emp);
    sumY += row.y;
    sumN += row.n;
    sumNa += row.na;
  }

  const totalCells = sumY + sumN + sumNa || 1;
  const yPct = ratioToRate(sumY, totalCells);
  const naPct = ratioToRate(sumNa, totalCells);
  const nPct = ratioToRate(sumN, totalCells);
  const conformeRate = ratioToRate(sumY + sumNa, totalCells);

  return {
    sumY,
    sumN,
    sumNa,
    totalCells,
    yPct,
    naPct,
    nPct,
    conformeRate,
    nonConformeRate: nPct,
  };
}

export function calcGlobalStats(employees: Employee[]) {
  const total = employees.length;
  let sumPct = 0;
  const byDept: Record<string, { count: number; sumPct: number }> = {};

  for (const emp of employees) {
    const { pct } = calcDocumentCompletion(emp);
    sumPct += pct;
    const dept = emp.departement || 'Non assigné';
    if (!byDept[dept]) byDept[dept] = { count: 0, sumPct: 0 };
    byDept[dept].count++;
    byDept[dept].sumPct += pct;
  }

  const avgPct = total ? roundRate(sumPct / total) : 0;
  const departments = Object.entries(byDept)
    .map(([name, d]) => ({
      name,
      total: d.count,
      rate: roundRate(d.sumPct / d.count),
    }))
    .sort((a, b) => b.rate - a.rate);

  return { total, conformeRate: avgPct, noConformeRate: 100 - avgPct, departments };
}

export function getConformiteRates(
  employees: Employee[],
  _dashboard: DashboardData | null,
  _filtered: boolean,
) {
  const agg = calcCellAggregateStats(employees);
  const stats = calcGlobalStats(employees);

  return {
    conformeRate: agg.conformeRate,
    nonConformeRate: agg.nonConformeRate,
    conformeLabel: formatRate(agg.conformeRate),
    nonConformeLabel: formatRate(agg.nonConformeRate),
    liveAvg: stats.conformeRate,
    aggregate: agg,
  };
}

export function calcInspectionFromEmployees(employees: Employee[]) {
  return DOCUMENT_FIELDS.map((field) => {
    let y = 0;
    let n = 0;
    let na = 0;
    for (const emp of employees) {
      const val = normalizeDocStatus(String(emp.documents?.[field.key] || ''));
      if (val === 'Y') y++;
      else if (val === 'NA') na++;
      else n++;
    }
    return {
      critere: field.label,
      total: employees.length,
      y,
      n,
      na,
    };
  });
}

export function calcDepartmentDashboardStats(employees: Employee[]) {
  const byDept: Record<string, { y: number; n: number; na: number; count: number; sumPct: number }> = {};

  for (const emp of employees) {
    const dept = emp.departement || 'Non assigné';
    if (!byDept[dept]) byDept[dept] = { y: 0, n: 0, na: 0, count: 0, sumPct: 0 };
    byDept[dept].count++;
    byDept[dept].sumPct += calcDocumentCompletion(emp).pct;

    for (const field of DOCUMENT_FIELDS) {
      const val = normalizeDocStatus(String(emp.documents?.[field.key] || ''));
      if (val === 'Y') byDept[dept].y++;
      else if (val === 'NA') byDept[dept].na++;
      else byDept[dept].n++;
    }
  }

  return Object.entries(byDept)
    .map(([name, d]) => {
      const totalCells = d.y + d.n + d.na || 1;
      const rate = roundRate(d.sumPct / d.count);
      return {
        name,
        total: d.count,
        y: formatRate(ratioToRate(d.y, totalCells)),
        na: formatRate(ratioToRate(d.na, totalCells)),
        n: formatRate(ratioToRate(d.n, totalCells)),
        rate: formatRate(rate),
      };
    })
    .sort((a, b) => parseRate(b.rate) - parseRate(a.rate));
}

/** Dashboard Check documents — calculé live depuis la base employés Excel. */
export function buildDashboardFromEmployees(employees: Employee[]): DashboardData {
  const agg = calcCellAggregateStats(employees);
  return {
    dashboard: {
      totalEmployee: employees.length,
      conformeRate: formatRate(agg.conformeRate),
      noConformeRate: formatRate(agg.nonConformeRate),
      departments: calcDepartmentDashboardStats(employees),
    },
    inspections: calcInspectionFromEmployees(employees),
  };
}

export function parseRate(value: string | number): number {
  if (typeof value === 'number') return value;
  return parseFloat(String(value).replace('%', '').replace(',', '.')) || 0;
}

export { getDepartments } from './employee-utils';

export type { DashboardData };
