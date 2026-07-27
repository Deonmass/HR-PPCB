import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { DOCUMENT_FIELDS } from './documents';
import type { Employee } from './types';
import { emptyEmployeeHrProfile } from './types';

const EXCEL_PATH = process.env.EMPLOYEE_XLSX || path.join(process.cwd(), 'Excel', 'EMPLOYEE.xlsx');
const OUT_PATH = path.join(process.cwd(), 'data', 'employees.json');

function normalizeStatus(value: unknown): 'Y' | 'N' | 'NA' {
  const v = String(value || 'N').toUpperCase().trim();
  if (v === 'Y' || v === 'NA') return v;
  return 'N';
}

export function importEmployeesFromExcel(filePath = EXCEL_PATH): Employee[] {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets['CHECK DOCUMENTS BASE'];
  if (!ws) throw new Error('Feuille CHECK DOCUMENTS BASE introuvable');
  const masterWs = wb.Sheets['EMPLOYEE'];
  if (!masterWs) throw new Error('Feuille EMPLOYEE introuvable');

  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as unknown[][];
  const masterRows = XLSX.utils.sheet_to_json(masterWs, { header: 1, defval: '' }) as unknown[][];
  const masterByMatricule = new Map<string, { nom: string; departement: string; grade: string; jobTitle: string; localisation: string }>();

  for (let r = 2; r < masterRows.length; r++) {
    const row = masterRows[r];
    const matricule = String(row[0] || '').trim();
    const nom = String(row[2] || '').trim();
    if (!matricule || !nom || !/^\d/.test(matricule)) continue;
    masterByMatricule.set(matricule, {
      nom,
      departement: String(row[3] || '').trim(),
      grade: String(row[4] || '').trim(),
      jobTitle: String(row[5] || '').trim(),
      localisation: String(row[6] || '').trim(),
    });
  }

  const employees: Employee[] = [];

  for (let r = 3; r < rows.length; r++) {
    const row = rows[r];
    const matricule = String(row[0] || '').trim();
    const nom = String(row[1] || '').trim();
    if (!matricule || !nom || !/^\d/.test(matricule)) continue;

    const documents: Record<string, 'Y' | 'N' | 'NA'> = {};
    DOCUMENT_FIELDS.forEach((field, i) => {
      documents[field.key] = normalizeStatus(row[6 + i]);
    });

    const master = masterByMatricule.get(matricule);
    employees.push({
      ...emptyEmployeeHrProfile(),
      matricule,
      nom: master?.nom || nom,
      departement: master?.departement || String(row[2] || '').trim(),
      grade: master?.grade || String(row[3] || '').trim(),
      jobTitle: master?.jobTitle || String(row[4] || '').trim(),
      localisation: master?.localisation || String(row[5] || '').trim(),
      documents,
    });
  }

  return employees;
}

if (require.main === module) {
  const employees = importEmployeesFromExcel();
  fs.writeFileSync(OUT_PATH, JSON.stringify(employees, null, 2), 'utf-8');
  console.log(`Importé ${employees.length} employés → ${OUT_PATH}`);
}
