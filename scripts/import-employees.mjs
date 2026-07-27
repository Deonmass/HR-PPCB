import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXCEL_PATH = process.env.EMPLOYEE_XLSX || path.join(__dirname, '..', 'Excel', 'EMPLOYEE.xlsx');
const OUT_PATH = path.join(__dirname, '..', 'data', 'employees.json');

const DOCUMENT_FIELDS = [
  { key: 'Copie carte electeur passeport' },
  { key: '2 Photos passeport' },
  { key: 'Acte de mariage' },
  { key: 'Acte certificat naissance enfants' },
  { key: 'Extrait casier judiciaire' },
  { key: 'Attestation fin service' },
  { key: 'Diplome releve notes' },
  { key: 'Certificat residence expat' },
  { key: 'Aptitude physique' },
  { key: 'Curriculum vitae' },
  { key: 'No CNSS' },
  { key: 'RRF' },
  { key: 'References recues' },
  { key: 'Fiche induction' },
  { key: 'Accuse reception code conduite' },
  { key: 'IT arrival form' },
  { key: 'SAP input form' },
  { key: 'Contrat travail Onem' },
  { key: 'Contrat Bail village PPC' },
];

function normalizeStatus(value) {
  const v = String(value || 'N').toUpperCase().trim();
  if (v === 'Y' || v === 'NA') return v;
  return 'N';
}

const wb = XLSX.readFile(EXCEL_PATH);
const ws = wb.Sheets['CHECK DOCUMENTS BASE'];
if (!ws) {
  console.error('Feuille CHECK DOCUMENTS BASE introuvable');
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
const employees = [];

for (let r = 3; r < rows.length; r++) {
  const row = rows[r];
  const matricule = String(row[0] || '').trim();
  const nom = String(row[1] || '').trim();
  if (!matricule || !nom || !/^\d/.test(matricule)) continue;

  const documents = {};
  DOCUMENT_FIELDS.forEach((field, i) => {
    documents[field.key] = normalizeStatus(row[6 + i]);
  });

  employees.push({
    matricule,
    nom,
    departement: String(row[2] || '').trim(),
    grade: String(row[3] || '').trim(),
    jobTitle: String(row[4] || '').trim(),
    documents,
  });
}

fs.writeFileSync(OUT_PATH, JSON.stringify(employees, null, 2), 'utf-8');

let sumY = 0;
let sumN = 0;
let sumNa = 0;
for (const emp of employees) {
  for (const field of DOCUMENT_FIELDS) {
    const val = emp.documents[field.key];
    if (val === 'Y') sumY++;
    else if (val === 'NA') sumNa++;
    else sumN++;
  }
}

const total = sumY + sumN + sumNa;
const conforme = Math.round(((sumY + sumNa) / total) * 100);

console.log(`Importé ${employees.length} employés → ${OUT_PATH}`);
console.log(`Σ Y=${sumY}  Σ NA=${sumNa}  Σ N=${sumN}  Total=${total}  Conformité=${conforme}%`);
