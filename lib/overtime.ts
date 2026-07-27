export const OT_POLICY = {
  maxWeeklyOtHours: 24,
  excludedGrades: ['C5', 'D1', 'D2', 'D3', 'D4', 'E1', 'E2', 'E3', 'E4'],
  excludedDepartments: ['CEC', 'Customer Excellence', 'Customer excellence'],
  excludedKeywords: ['driver', 'conducteur'],
};

export interface OtWeek {
  '1.3': number;
  '1.6': number;
  '2': number;
  N: number;
}

export interface OtRow {
  matricule: string;
  name: string;
  title: string;
  departement: string;
  localisation: string;
  grade: string;
  weeks: OtWeek[];
}

export interface ProcessedOtRow extends OtRow {
  totals: OtWeek;
  totalOt: number;
  weightedHours: number;
  warnings: string[];
  exclusion: { excluded: boolean; reason: string };
}

function parseGrade(grade: string) {
  const m = String(grade).trim().match(/^([A-E])(\d)$/i);
  if (!m) return { letter: String(grade).charAt(0).toUpperCase(), num: parseInt(grade.slice(1)) || 0 };
  return { letter: m[1].toUpperCase(), num: parseInt(m[2]) };
}

export function isExcludedFromOtPolicy(row: Pick<OtRow, 'grade' | 'departement' | 'title'>) {
  const grade = parseGrade(row.grade);
  const g = `${grade.letter}${grade.num}`;
  if (OT_POLICY.excludedGrades.includes(g)) return { excluded: true, reason: `Grade ${g} exclu` };
  if (g === 'C4') return { excluded: true, reason: 'Grade C4 exclu' };
  const dept = row.departement.toLowerCase();
  if (OT_POLICY.excludedDepartments.some((d) => dept.includes(d.toLowerCase()))) {
    return { excluded: true, reason: 'CEC exclu' };
  }
  const title = (row.title || '').toLowerCase();
  if (OT_POLICY.excludedKeywords.some((k) => title.includes(k) || dept.includes(k))) {
    return { excluded: true, reason: 'Conducteur exclu' };
  }
  return { excluded: false, reason: '' };
}

export function parseNum(val: unknown): number {
  if (val === null || val === undefined || val === '' || val === '#') return 0;
  const n = parseFloat(String(val).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export function processOvertimeRow(row: OtRow): ProcessedOtRow {
  const weeks = row.weeks.map((w) => ({
    '1.3': parseNum(w['1.3']),
    '1.6': parseNum(w['1.6']),
    '2': parseNum(w['2']),
    N: parseNum(w.N),
  }));

  const totals: OtWeek = { '1.3': 0, '1.6': 0, '2': 0, N: 0 };
  const warnings: string[] = [];
  const exclusion = isExcludedFromOtPolicy(row);

  weeks.forEach((w, i) => {
    totals['1.3'] += w['1.3'];
    totals['1.6'] += w['1.6'];
    totals['2'] += w['2'];
    totals.N += w.N;
    const otH = w['1.3'] + w['1.6'] + w['2'];
    if (otH > OT_POLICY.maxWeeklyOtHours) {
      warnings.push(`Semaine ${i + 1}: ${otH.toFixed(1)}h HS > max ${OT_POLICY.maxWeeklyOtHours}h`);
    }
  });

  const totalOt = totals['1.3'] + totals['1.6'] + totals['2'];
  const weightedHours = totals['1.3'] * 1.3 + totals['1.6'] * 1.6 + totals['2'] * 2 + totals.N;

  if (exclusion.excluded && totalOt > 0) {
    warnings.push(`Exclu (${exclusion.reason}) avec ${totalOt.toFixed(1)}h HS`);
  }

  return { ...row, weeks, totals, totalOt, weightedHours, warnings, exclusion };
}

export function parseOvertimeSheet(rows: unknown[][], sheetName: string): OtRow[] {
  let headerRow = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i] as unknown[];
    if (row.some((c) => String(c).toLowerCase().includes('new number'))) {
      headerRow = i;
      break;
    }
  }
  if (headerRow < 0) throw new Error(`Structure non reconnue: ${sheetName}`);

  const headers = (rows[headerRow] as unknown[]).map((h) => String(h).trim());
  const weekStarts: number[] = [];
  headers.forEach((h, idx) => {
    if (String(h).match(/^1\.3$|^1$/) && idx > 5) weekStarts.push(idx);
  });
  if (!weekStarts.length) {
    for (let c = 6; c < headers.length; c += 4) weekStarts.push(c);
  }

  const parsed: OtRow[] = [];
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r] as unknown[];
    const matricule = String(row[0] || '').trim();
    if (!matricule.match(/^\d/)) continue;
    const weeks = weekStarts.slice(0, 5).map((start) => ({
      '1.3': parseNum(row[start]),
      '1.6': parseNum(row[start + 1]),
      '2': parseNum(row[start + 2]),
      N: parseNum(row[start + 3]),
    }));
    parsed.push({
      matricule,
      name: String(row[1] || ''),
      title: String(row[2] || ''),
      departement: String(row[3] || ''),
      localisation: String(row[4] || ''),
      grade: String(row[5] || ''),
      weeks,
    });
  }
  return parsed;
}
