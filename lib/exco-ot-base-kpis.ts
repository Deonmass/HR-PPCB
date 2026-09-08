/**
 * Panneau KPI overtime_base colonnes N (libellé) / O (formule).
 * À conserver tels quels quand Component Posted Units (et autres fichiers)
 * reconstruisent overtime_base les mois suivants.
 *
 * Excel (New report — Aout 26) :
 *   O1  = Headacount!$C$2
 *   O2  = COUNTA(UNIQUE(C:C))-1          → salariés distincts (Employee Number)
 *   O3  = O2/$O$1                        → % de l’effectif
 *   O4  = GETPIVOTDATA("Sum of Units")   → SUM(Units) col F
 *   O5  = O4/O2
 *   O6  = GETPIVOTDATA("Sum of Component Value")/Params!$B$2  → SUM(G)/FX
 *   O7  = O6/O2
 *   O8  = O6/Staff_Cost_KPI!$N$43
 *   O9  = OVT!P39/Staff_Cost_KPI!F5
 */
export type ExcoOtBasePanelKpis = {
  headcount: number | null;
  employeesWithHours: number;
  pctOfWorkforce: number | null;
  totalHours: number;
  averageHours: number | null;
  totalCostUsd: number | null;
  averageCostUsd: number | null;
  otShareOfStaffCost: number | null;
  otShareOfStaffCostYtd: number | null;
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Équivalent O2…O7 à partir des lignes Component (matricule, Units, Component Value). */
export function computeOtBasePanelKpis(input: {
  headcount: number | null;
  fxRateFcPerUsd: number | null;
  staffCostUsd: number | null;
  staffCostYtdUsd: number | null;
  otCostYtdUsd: number | null;
  employees: Array<{ matricule: string; hours: number; costFc: number }>;
}): ExcoOtBasePanelKpis {
  const mats = new Set(
    input.employees.map((e) => String(e.matricule || '').trim()).filter(Boolean),
  );
  const employeesWithHours = mats.size;
  const totalHours = round2(input.employees.reduce((s, e) => s + (e.hours || 0), 0));
  const totalCostFc = input.employees.reduce((s, e) => s + (e.costFc || 0), 0);
  const fx = input.fxRateFcPerUsd != null && input.fxRateFcPerUsd > 0 ? input.fxRateFcPerUsd : null;
  const totalCostUsd = fx != null ? round2(totalCostFc / fx) : null;
  const pctOfWorkforce =
    input.headcount != null && input.headcount > 0
      ? round2((employeesWithHours / input.headcount) * 100)
      : null;
  const averageHours = employeesWithHours > 0 ? round2(totalHours / employeesWithHours) : null;
  const averageCostUsd =
    totalCostUsd != null && employeesWithHours > 0
      ? round2(totalCostUsd / employeesWithHours)
      : null;
  const otShareOfStaffCost =
    totalCostUsd != null && input.staffCostUsd != null && input.staffCostUsd > 0
      ? round4(totalCostUsd / input.staffCostUsd)
      : null;
  const otShareOfStaffCostYtd =
    input.otCostYtdUsd != null && input.staffCostYtdUsd != null && input.staffCostYtdUsd > 0
      ? round4(input.otCostYtdUsd / input.staffCostYtdUsd)
      : null;

  return {
    headcount: input.headcount,
    employeesWithHours,
    pctOfWorkforce,
    totalHours,
    averageHours,
    totalCostUsd,
    averageCostUsd,
    otShareOfStaffCost,
    otShareOfStaffCostYtd,
  };
}

function asNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'result' in value) {
    const r = (value as { result?: unknown }).result;
    if (typeof r === 'number' && Number.isFinite(r)) return r;
  }
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function asLabel(value: unknown): string {
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

/**
 * Lit le panneau N/O d’une matrice overtime_base (ligne 0 = en-têtes).
 * Col 13 = N, col 14 = O.
 */
export function readOtBasePanelFromSheet(rows: unknown[][]): Partial<ExcoOtBasePanelKpis> {
  const out: Partial<ExcoOtBasePanelKpis> = {};
  const shares: number[] = [];
  for (let r = 0; r < Math.min(rows.length, 16); r += 1) {
    const row = rows[r];
    if (!row) continue;
    const label = asLabel(row[13]);
    const val = asNum(row[14]);
    if (val == null || !label) continue;
    if (label === 'employee' || label === 'employee ') {
      out.headcount = Math.round(val);
    } else if (label.includes('recorded hours')) {
      out.employeesWithHours = Math.round(val);
    } else if (label.includes('%') || label.includes('nombre des')) {
      out.pctOfWorkforce = round2(val <= 1 ? val * 100 : val);
    } else if (label.includes('total overtime')) {
      out.totalHours = round2(val);
    } else if (label.includes('average hours')) {
      out.averageHours = round2(val);
    } else if (label.includes('total cost')) {
      out.totalCostUsd = round2(val);
    } else if (label.includes('average cost')) {
      out.averageCostUsd = round2(val);
    } else if (label.includes('represents') || label.includes('salaire')) {
      shares.push(val <= 1 ? val : val / 100);
    }
  }
  if (shares[0] != null) out.otShareOfStaffCost = round4(shares[0]);
  if (shares[1] != null) out.otShareOfStaffCostYtd = round4(shares[1]);
  return out;
}

function fmtHours(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}

function fmtPctPoints(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const pct = n <= 1 ? n * 100 : n;
  return `${pct.toFixed(2)}%`;
}

export function buildOtVsLeaveNarrative(input: {
  periodLabel: string;
  panel: Partial<ExcoOtBasePanelKpis>;
  avgLeaveDays: number | null;
  topDepts: Array<{ department: string; hours: number }>;
}): string {
  const p = input.panel;
  const hc = p.headcount;
  const emp = p.employeesWithHours;
  const pct = p.pctOfWorkforce;
  const hours = p.totalHours;
  const avgH = p.averageHours;
  const cost = p.totalCostUsd;
  const avgC = p.averageCostUsd;
  const share = p.otShareOfStaffCost;
  const shareYtd = p.otShareOfStaffCostYtd;
  const leave = input.avgLeaveDays;

  const empBit =
    emp != null && hc != null
      ? `${emp} of ${hc} employees${pct != null ? ` (${Math.round(pct)}%)` : ''} recorded overtime`
      : emp != null
        ? `${emp} employees recorded overtime`
        : null;

  const parts: string[] = [];
  if (empBit) {
    parts.push(
      `In ${input.periodLabel}, ${empBit}.`,
    );
  }
  if (hours != null) {
    parts.push(
      `Total overtime: ${fmtHours(hours)} hours${avgH != null ? ` (average ${fmtHours(avgH)} h)` : ''}.`,
    );
  }
  if (cost != null) {
    parts.push(
      `Total cost: ${fmtUsd(cost)}${avgC != null ? ` (${fmtUsd(avgC)} per employee with OT)` : ''}.`,
    );
  }
  if (share != null || shareYtd != null) {
    const bits = [
      share != null ? `${fmtPctPoints(share)} of staff cost` : null,
      shareYtd != null ? `${fmtPctPoints(shareYtd)} on the YTD basis` : null,
    ].filter(Boolean);
    if (bits.length) parts.push(`Overtime represents ${bits.join(' and ')}.`);
  }
  if (leave != null) {
    parts.push(
      `Average remaining leave among employees with OT: ${fmtHours(leave)} days.`,
    );
  }
  const depts = input.topDepts.filter((d) => d.hours > 0).slice(0, 3);
  if (depts.length) {
    parts.push(
      `Hours are concentrated in ${depts
        .map((d) => `${d.department} (${fmtHours(d.hours)} h)`)
        .join(', ')}.`,
    );
  }
  return parts.join(' ');
}
