/**
 * Parse New Engagements and Terminations (feuilles Manico + Quarico).
 */
import * as XLSX from 'xlsx';

export type ExcoCompanySheet = 'manico' | 'quarico' | 'unknown';

export interface ExcoEngagementRow {
  matricule: string;
  lastName: string;
  initials: string;
  firstName: string;
  orgUnit: string;
  employmentDate: string;
  terminationDate: string;
  terminationReason: string;
  position: string;
  grade: string;
  gender: string;
  nationality: string;
  birthDate: string;
  company: ExcoCompanySheet;
  sheetName: string;
  kind: 'engagement' | 'termination' | 'both';
}

function detectCompany(sheetName: string, companyCell: string): ExcoCompanySheet {
  const s = `${sheetName} ${companyCell}`.toLowerCase();
  if (s.includes('qco') || s.includes('quarry') || s.includes('quarico')) return 'quarico';
  if (s.includes('mco') || s.includes('manuco') || s.includes('manufactur') || s.includes('manico')) {
    return 'manico';
  }
  return 'unknown';
}

function isMatricule(value: unknown): string | null {
  const s = String(value ?? '').trim();
  return /^\d{5,}$/.test(s) ? s : null;
}

function fmtDate(value: unknown): string {
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

function inMonth(dateStr: string, year: number, month: number): boolean {
  const m = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return false;
  return Number(m[3]) === year && Number(m[2]) === month;
}

export function parseEngagementsTerminations(buffer: ArrayBuffer): ExcoEngagementRow[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const out: ExcoEngagementRow[] = [];

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    if (!rows.length) continue;

    let headerRow = -1;
    for (let r = 0; r < Math.min(rows.length, 20); r += 1) {
      const a = String(rows[r]?.[0] ?? '').toLowerCase();
      if (a.includes('emp number') || a === 'emp number') {
        headerRow = r;
        break;
      }
    }
    if (headerRow < 0) continue;

    const companyCell = String(rows[1]?.[0] ?? '');
    const company = detectCompany(sheetName, companyCell);

    for (let r = headerRow + 1; r < rows.length; r += 1) {
      const row = rows[r];
      if (!row) continue;
      const matricule = isMatricule(row[0]);
      if (!matricule) continue;
      const lastName = String(row[1] ?? '').trim();
      const initials = String(row[2] ?? '').trim();
      const orgUnit = String(row[3] ?? '').trim();
      const employmentDate = fmtDate(row[5]);
      const terminationDate = fmtDate(row[6]);
      const terminationReason = String(row[7] ?? '').trim();
      const firstName = String(row[10] ?? '').trim();
      const position = String(row[16] ?? '').trim();
      const grade = String(row[17] ?? '').trim();
      const gender = String(row[13] ?? '').trim();
      const nationality = String(row[14] ?? '').trim();
      const birthDate = fmtDate(row[12]);

      let kind: ExcoEngagementRow['kind'] = 'engagement';
      if (terminationDate && employmentDate) kind = 'both';
      else if (terminationDate) kind = 'termination';
      else kind = 'engagement';

      out.push({
        matricule,
        lastName,
        initials,
        firstName,
        orgUnit,
        employmentDate,
        terminationDate,
        terminationReason,
        position,
        grade,
        gender,
        nationality,
        birthDate,
        company,
        sheetName,
        kind,
      });
    }
  }

  return out;
}

export function splitEngagementsForPeriod(
  rows: ExcoEngagementRow[],
  year: number,
  month: number,
): {
  engagementsInMonth: ExcoEngagementRow[];
  terminationsInMonth: ExcoEngagementRow[];
  historicalTerminations: ExcoEngagementRow[];
  all: ExcoEngagementRow[];
} {
  const engagementsInMonth: ExcoEngagementRow[] = [];
  const terminationsInMonth: ExcoEngagementRow[] = [];
  const historicalTerminations: ExcoEngagementRow[] = [];

  for (const row of rows) {
    if (row.employmentDate && inMonth(row.employmentDate, year, month) && !row.terminationDate) {
      engagementsInMonth.push(row);
    } else if (row.employmentDate && inMonth(row.employmentDate, year, month)) {
      engagementsInMonth.push(row);
    }
    if (row.terminationDate && inMonth(row.terminationDate, year, month)) {
      terminationsInMonth.push(row);
    } else if (row.terminationDate) {
      historicalTerminations.push(row);
    }
  }

  return { engagementsInMonth, terminationsInMonth, historicalTerminations, all: rows };
}

export function displayEngagementName(row: ExcoEngagementRow): string {
  if (row.firstName && row.lastName) return `${row.firstName} ${row.lastName}`.trim();
  return [row.lastName, row.initials].filter(Boolean).join(' ').trim();
}
