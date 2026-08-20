import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';

const SOURCE =
  'C:/Users/Gedeon.Massadi/Downloads/Numeros de serie des ordre de Mission 2026.xlsx';
const OUT = path.join(process.cwd(), 'data', 'travel', 'mission-orders.json');

const SHEETS = [
  { sheetName: 'Kinshasa', site: 'kinshasa' },
  { sheetName: 'Zamba PPC Team', site: 'zamba' },
  { sheetName: 'Zamba Consultant', site: 'zamba-consultant' },
  { sheetName: 'Lubudi', site: 'lubudi' },
];

function excelToIso(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 20000) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const parsed = XLSX.SSF.parse_date_code(
      (value.getTime() - Date.UTC(1899, 11, 30)) / 86400000,
    );
    if (parsed) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }
  const text = String(value ?? '').trim();
  if (!text || text === '-') return '';
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return '';
}

function amountOf(value) {
  if (value === '' || value === '-' || value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

const wb = XLSX.readFile(SOURCE, { cellDates: false });
const rows = [];
let seq = 1;

for (const { sheetName, site } of SHEETS) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Feuille introuvable : ${sheetName}`);
  const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  for (const raw of aoa.slice(2)) {
    const missionRef = String(raw[2] ?? '').trim();
    const employeeName = String(raw[4] ?? '').trim();
    if (!missionRef && !employeeName) continue;
    if (!missionRef) continue;
    const departureDate = excelToIso(raw[10]);
    const returnDate = excelToIso(raw[11]);
    const daysRaw = Number(raw[12]);
    rows.push({
      id: `mo-imp-${String(seq).padStart(4, '0')}`,
      site,
      sr: String(raw[0] ?? '').trim(),
      registerDate: excelToIso(raw[1]),
      missionRef,
      matricule: String(raw[3] ?? '').trim(),
      employeeName,
      category: String(raw[5] ?? '').trim(),
      title: String(raw[6] ?? '').trim(),
      purpose: String(raw[7] ?? '').trim(),
      destination: String(raw[8] ?? '').trim(),
      transportMeans: String(raw[9] ?? '').trim(),
      departureDate,
      returnDate,
      days: Number.isFinite(daysRaw) ? daysRaw : 0,
      type: String(raw[13] ?? '').trim(),
      amount: amountOf(raw[14]),
      observation: String(raw[15] ?? '').trim(),
      recordId: '',
      source: 'import',
      createdAt: excelToIso(raw[1])
        ? `${excelToIso(raw[1])}T00:00:00.000Z`
        : '2026-01-01T00:00:00.000Z',
    });
    seq += 1;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ rows }, null, 2)}\n`, 'utf8');

const bySite = {};
for (const row of rows) {
  bySite[row.site] = (bySite[row.site] || 0) + 1;
}
console.log('Imported', rows.length, 'rows', bySite);
console.log('Wrote', OUT);
