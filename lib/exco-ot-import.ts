import * as XLSX from 'xlsx';

export interface ExcoOtEmployeeImport {
  matricule: string;
  nom: string;
  /** Libellé EXCO court (ENG, Mining, …). */
  department: string;
  departmentRaw: string;
  hours: number;
  costFc: number;
  leaveBalance: number | null;
}

export interface ExcoOtDeptMonthRow {
  department: string;
  hours: number;
  costFc: number;
}

export interface ExcoOtMonthImport {
  year: number;
  month: number;
  /** Francs CFA pour 1 USD. */
  fxRateFcPerUsd: number | null;
  employees: ExcoOtEmployeeImport[];
  byDept: ExcoOtDeptMonthRow[];
  sourceFiles: string[];
  importedAt: string;
}

const LEGACY_EXCO_DEPT_TO_SYSTEM: Record<string, string> = {
  CEC: 'Administration',
  ENG: 'Engineering',
  Mining: 'Mining',
  Opt: 'Risk & Environment',
  Prod: 'Production',
  Log: 'Sales & Logistics',
  QA: 'Quality Assurance',
  Autre: 'Administration',
};

/** Ordre de secours = départements paramètres (si store indisponible). */
export const EXCO_SYSTEM_DEPT_FALLBACK = [
  'Administration',
  'Audit',
  'Engineering',
  'Finance',
  'Human Resources',
  'Legal',
  'Mining',
  'Packaging & Logistics',
  'Production',
  'Quality Assurance',
  'Risk & Environment',
  'Sales & Logistics',
  'Supply chain',
] as const;

/**
 * Mappe Org. Unit / Departments Excel / anciens codes EXCO (CEC, ENG…)
 * vers le libellé département du système (paramètres).
 */
export function mapExcoOtDepartment(raw: string): string {
  const s = (raw || '').trim();
  if (!s) return 'Administration';

  const legacy = LEGACY_EXCO_DEPT_TO_SYSTEM[s];
  if (legacy) return legacy;

  const lower = s.toLowerCase();
  const code = s.match(/^([A-Z]{2}\d{2})/i)?.[1]?.toUpperCase() || '';

  // Déjà un libellé système (ou proche)
  for (const name of EXCO_SYSTEM_DEPT_FALLBACK) {
    if (name.toLowerCase() === lower) return name;
  }

  if (/human resources|\bhr\b/i.test(lower)) return 'Human Resources';
  if (/audit/i.test(lower)) return 'Audit';
  if (/finance|compta|accounting/i.test(lower)) return 'Finance';
  if (/legal|juridique/i.test(lower)) return 'Legal';
  if (/supply/i.test(lower)) return 'Supply chain';
  if (/packaging/i.test(lower)) return 'Packaging & Logistics';
  if (/sales.*log|log.*sales|sales & logistics/i.test(lower)) return 'Sales & Logistics';
  if (/risk|environ|optim|opt\b|km58/i.test(lower) || code === 'KM58') {
    return 'Risk & Environment';
  }
  if (/eng|engineering|garage|estates|civil|km53/i.test(lower) || code === 'KM53') {
    return 'Engineering';
  }
  if (/mining|mine|quarry|kq19|kq10|drilling|hauling|blast/i.test(lower) || code.startsWith('KQ')) {
    return 'Mining';
  }
  if (
    /prod|production|burning|milling|bagging|raw|f m |fm general|km51|km43|km44|km45|km46/i.test(lower)
    || ['KM51', 'KM43', 'KM44', 'KM45', 'KM46'].includes(code)
  ) {
    return 'Production';
  }
  if (/log|logistic|warehouse|stores|km54/i.test(lower) || code === 'KM54' || code.startsWith('KC61')) {
    return 'Sales & Logistics';
  }
  if (/qa|quality|laboratory|labo|km55/i.test(lower) || code === 'KM55') {
    return 'Quality Assurance';
  }
  if (/cec|corporate|admin|kc87|kc86|kc85/i.test(lower) || code.startsWith('KC')) {
    return 'Administration';
  }

  return s.slice(0, 48);
}

export function excoOtDeptOrder(): string[] {
  return [...EXCO_SYSTEM_DEPT_FALLBACK];
}

/** Normalise un libellé dept (données stockées CEC/ENG ou système). */
export function normalizeExcoOtDepartment(raw: string): string {
  return mapExcoOtDepartment(raw);
}

function isMatricule(value: unknown): string | null {
  const s = String(value ?? '').trim();
  if (/^\d{5,}$/.test(s)) return s;
  return null;
}

function toNum(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const n = Number(value.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isOtComponent(name: string): boolean {
  const s = name.toLowerCase();
  return s.includes('heure') && (s.includes('suppl') || s.includes('x 1') || s.includes('x 2'));
}

/** Parse Component Posted Units (toutes les feuilles / compagnies). */
export function parseComponentPostedUnits(
  buffer: ArrayBuffer,
): Array<{
  matricule: string;
  nom: string;
  orgUnit: string;
  hours: number;
  costFc: number;
}> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const byEmp = new Map<
    string,
    { matricule: string; nom: string; orgUnit: string; hours: number; costFc: number }
  >();

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];

    for (const row of rows) {
      if (!row || row.length < 7) continue;
      const matricule = isMatricule(row[2]);
      if (!matricule) continue;
      const component = String(row[4] ?? '').trim();
      if (!isOtComponent(component)) continue;
      const hours = toNum(row[5]);
      const costFc = toNum(row[6]);
      if (hours === 0 && costFc === 0) continue;

      const last = String(row[0] ?? '').trim();
      const init = String(row[1] ?? '').trim();
      const nom = [last, init].filter(Boolean).join(' ');
      const orgUnit = String(row[3] ?? '').trim();

      const prev = byEmp.get(matricule) || {
        matricule,
        nom,
        orgUnit,
        hours: 0,
        costFc: 0,
      };
      prev.hours += hours;
      prev.costFc += costFc;
      if (orgUnit) prev.orgUnit = orgUnit;
      if (nom) prev.nom = nom;
      byEmp.set(matricule, prev);
    }
  }

  return [...byEmp.values()].map((e) => ({
    ...e,
    hours: Math.round(e.hours * 100) / 100,
    costFc: Math.round(e.costFc * 100) / 100,
  }));
}

/**
 * Parse Leave Balances — solde Annual (Closing Balance).
 * Une ligne par type de congé ; on ne garde que Annual / congé annuel.
 */
export function parseLeaveBalances(buffer: ArrayBuffer): Map<string, number> {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const leaveByMatricule = new Map<string, number>();

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];

    for (const row of rows) {
      if (!row || row.length < 29) continue;
      const matricule = isMatricule(row[3]) || isMatricule(row[4]);
      if (!matricule) continue;
      const leaveType = String(row[19] ?? '').trim().toLowerCase();
      const leaveDesc = String(row[20] ?? '').trim().toLowerCase();
      const isAnnual =
        leaveType === 'annual'
        || leaveDesc.includes('annuel')
        || leaveDesc.includes('annual leave')
        || leaveDesc.includes('conge annuel')
        || leaveDesc.includes('congé annuel');
      if (!isAnnual) continue;
      const closing = toNum(row[28]);
      leaveByMatricule.set(matricule, Math.round(closing * 100) / 100);
    }
  }

  return leaveByMatricule;
}

export type ExcoLeaveBalanceRow = {
  leaveBalance: number;
  valueFc: number;
  nom: string;
  departmentRaw: string;
  costCentre: string;
};

/**
 * Leave Balances — Leave Type Annual only.
 * - byMatricule : Closing Balance / Value par employé (dernier vu).
 * - valueFcBySheet : Σ Value(AD) par feuille (Mco, Qco, …) — base du Leave COST.
 *
 * Leave COST (comme Excel) : pour chaque feuille round(Σ AD ÷ taux, 2), puis somme.
 * Ne pas reconstruire via provisionUsd000 (milliers) : perte de centimes.
 */
export function parseLeaveBalancesDetailed(buffer: ArrayBuffer): {
  byMatricule: Map<string, ExcoLeaveBalanceRow>;
  valueFcBySheet: number[];
  valueFcTotal: number;
} {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const map = new Map<string, ExcoLeaveBalanceRow>();
  const valueFcBySheet: number[] = [];
  let valueFcTotal = 0;

  for (const sheetName of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];

    let sheetFc = 0;
    let annualRows = 0;
    for (const row of rows) {
      // Col. AD = index 29 → besoin d’au moins 30 cellules
      if (!row || row.length < 30) continue;
      const matricule = isMatricule(row[3]) || isMatricule(row[4]);
      if (!matricule) continue;
      const leaveType = String(row[19] ?? '').trim().toLowerCase();
      const leaveDesc = String(row[20] ?? '').trim().toLowerCase();
      const isAnnual =
        leaveType === 'annual'
        || leaveDesc.includes('annuel')
        || leaveDesc.includes('annual leave')
        || leaveDesc.includes('conge annuel')
        || leaveDesc.includes('congé annuel');
      if (!isAnnual) continue;

      annualRows += 1;
      const valueFc = toNum(row[29]);
      sheetFc += valueFc;

      const first = String(row[5] ?? row[1] ?? '').trim();
      const last = String(row[6] ?? row[0] ?? '').trim();
      const nom = [first, last].filter(Boolean).join(' ') || [last, first].filter(Boolean).join(' ');
      const departmentRaw = String(row[18] ?? '').trim();
      const costCentre = String(row[17] ?? '').trim();
      map.set(matricule, {
        leaveBalance: Math.round(toNum(row[28]) * 100) / 100,
        valueFc: Math.round(valueFc * 100) / 100,
        nom,
        departmentRaw,
        costCentre,
      });
    }
    if (annualRows > 0) {
      valueFcBySheet.push(sheetFc);
      valueFcTotal += sheetFc;
    }
  }

  return { byMatricule: map, valueFcBySheet, valueFcTotal };
}

/** Leave COST USD : Σ_feuilles round(Σ Value(AD) ÷ taux, 2) — logique Excel Mco + Qco. */
export function leaveCostUsdFromSheets(valueFcBySheet: number[], fxRateFcPerUsd: number): number {
  const fx = fxRateFcPerUsd;
  let usd = 0;
  for (const sheetFc of valueFcBySheet) {
    if (!Number.isFinite(sheetFc) || sheetFc === 0) continue;
    usd += Math.round((sheetFc / fx) * 100) / 100;
  }
  return Math.round(usd * 100) / 100;
}

export type ExcoLeaveSiteBucket = 'Plant' | 'HQ and Region' | 'Lubudi';

/** Zamba → Plant, Lubudi → Lubudi, autres régions → HQ and Region. */
export function mapExcoLeaveSite(
  localisation: string,
  costCentre = '',
  department = '',
): ExcoLeaveSiteBucket {
  const loc = (localisation || '').trim().toLowerCase();
  const hint = `${costCentre} ${department}`.toLowerCase();

  if (loc.includes('lubudi') || hint.includes('lubudi') || /\bdl51/i.test(hint)) {
    return 'Lubudi';
  }
  if (
    loc.includes('zamba')
    || loc.includes('plant')
    || loc.includes('malanga')
    || loc.includes('usine')
  ) {
    return 'Plant';
  }
  if (loc) return 'HQ and Region';

  // Fallback Cost Centre si localisation employé absente
  if (hint.includes('lubudi') || /\bdl51/i.test(hint)) return 'Lubudi';
  if (/\bkm\d|\bkq\d|plant|zamba/i.test(hint)) return 'Plant';
  return 'HQ and Region';
}

export interface ExcoLeaveMonthImport {
  year: number;
  month: number;
  fxRateFcPerUsd: number | null;
  plantAvgDays: number | null;
  hqAvgDays: number | null;
  lubudiAvgDays: number | null;
  allAvgDays: number | null;
  /** Somme Value (col. AD) FC — Leave Type Annual, toutes feuilles. */
  valueFcTotal?: number | null;
  /** Σ Value(AD) FC par feuille (ordre SheetNames) — pour Leave COST type Excel. */
  valueFcBySheet?: number[] | null;
  /** Leave COST en USD : Σ_feuilles round(Σ AD ÷ taux, 2). */
  leaveCostUsd?: number | null;
  /** Provision leave not taken, en milliers USD (pour tableaux trends). */
  provisionUsd000: number | null;
  counts: { plant: number; hq: number; lubudi: number; all: number };
  /** Closing Balance Annual par matricule. */
  byMatricule: Record<string, number>;
  sourceFiles: string[];
  importedAt: string;
}

/** USD Leave COST depuis un snapshot leave (précis à 2 décimales). */
export function excoLeaveCostUsdFromSnap(
  snap: Pick<
    ExcoLeaveMonthImport,
    'leaveCostUsd' | 'provisionUsd000' | 'valueFcTotal' | 'fxRateFcPerUsd' | 'valueFcBySheet'
  > | null | undefined,
): number | null {
  if (!snap) return null;
  if (snap.leaveCostUsd != null && Number.isFinite(snap.leaveCostUsd)) {
    return Math.round(snap.leaveCostUsd * 100) / 100;
  }
  if (
    Array.isArray(snap.valueFcBySheet)
    && snap.valueFcBySheet.length > 0
    && snap.fxRateFcPerUsd != null
    && snap.fxRateFcPerUsd > 0
  ) {
    return leaveCostUsdFromSheets(snap.valueFcBySheet, snap.fxRateFcPerUsd);
  }
  if (
    snap.valueFcTotal != null
    && snap.fxRateFcPerUsd != null
    && snap.fxRateFcPerUsd > 0
  ) {
    return Math.round((snap.valueFcTotal / snap.fxRateFcPerUsd) * 100) / 100;
  }
  // Dernier recours (baseline template) — imprécis (milliers USD)
  if (snap.provisionUsd000 != null && Number.isFinite(snap.provisionUsd000)) {
    return Math.round(snap.provisionUsd000 * 1000 * 100) / 100;
  }
  return null;
}

function avgOrNull(values: number[]): number | null {
  if (!values.length) return null;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export function buildExcoLeaveMonthImport(input: {
  year: number;
  month: number;
  leaveBuffer: ArrayBuffer;
  fxRateFcPerUsd: number | null;
  localisationByMatricule: Record<string, string>;
  sourceFiles: string[];
}): ExcoLeaveMonthImport {
  const parsed = parseLeaveBalancesDetailed(input.leaveBuffer);
  const leaveDetailed = parsed.byMatricule;
  const plant: number[] = [];
  const hq: number[] = [];
  const lubudi: number[] = [];
  const all: number[] = [];
  const byMatricule: Record<string, number> = {};

  for (const [matricule, row] of leaveDetailed.entries()) {
    byMatricule[matricule] = row.leaveBalance;
    all.push(row.leaveBalance);
    const site = mapExcoLeaveSite(
      input.localisationByMatricule[matricule] || '',
      row.costCentre,
      row.departmentRaw,
    );
    if (site === 'Plant') plant.push(row.leaveBalance);
    else if (site === 'Lubudi') lubudi.push(row.leaveBalance);
    else hq.push(row.leaveBalance);
  }

  const fx =
    input.fxRateFcPerUsd != null && Number.isFinite(input.fxRateFcPerUsd) && input.fxRateFcPerUsd > 0
      ? input.fxRateFcPerUsd
      : null;

  const leaveCostUsd =
    fx != null ? leaveCostUsdFromSheets(parsed.valueFcBySheet, fx) : null;

  return {
    year: input.year,
    month: input.month,
    fxRateFcPerUsd: fx,
    plantAvgDays: avgOrNull(plant),
    hqAvgDays: avgOrNull(hq),
    lubudiAvgDays: avgOrNull(lubudi),
    allAvgDays: avgOrNull(all),
    valueFcTotal: Math.round(parsed.valueFcTotal * 100) / 100,
    valueFcBySheet: parsed.valueFcBySheet.map((v) => Math.round(v * 100) / 100),
    leaveCostUsd,
    provisionUsd000:
      leaveCostUsd != null ? Math.round((leaveCostUsd / 1000) * 100) / 100 : null,
    counts: {
      plant: plant.length,
      hq: hq.length,
      lubudi: lubudi.length,
      all: all.length,
    },
    byMatricule,
    sourceFiles: input.sourceFiles,
    importedAt: new Date().toISOString(),
  };
}

const TEMPLATE_LEAVE_BASELINE_2026: Record<
  number,
  Pick<
    ExcoLeaveMonthImport,
    'plantAvgDays' | 'hqAvgDays' | 'lubudiAvgDays' | 'allAvgDays' | 'provisionUsd000'
  >
> = {
  3: {
    plantAvgDays: 16,
    hqAvgDays: 22,
    lubudiAvgDays: 6,
    allAvgDays: 18,
    provisionUsd000: 377.88,
  },
  4: {
    plantAvgDays: 17,
    hqAvgDays: 21,
    lubudiAvgDays: 7,
    allAvgDays: 18,
    provisionUsd000: 391.7,
  },
  5: {
    plantAvgDays: 17,
    hqAvgDays: 22,
    lubudiAvgDays: 9,
    allAvgDays: 18,
    provisionUsd000: 390.47,
  },
  6: {
    plantAvgDays: 17,
    hqAvgDays: 23,
    lubudiAvgDays: 7,
    allAvgDays: 19,
    provisionUsd000: 435.85,
  },
};

export function mergeExcoLeaveImportsForYear(
  year: number,
  throughMonth: number,
  imported: Record<string, ExcoLeaveMonthImport | undefined>,
): Record<string, ExcoLeaveMonthImport> {
  const out: Record<string, ExcoLeaveMonthImport> = {};
  for (const [k, snap] of Object.entries(imported || {})) {
    if (!snap) continue;
    const m = Number(k);
    if (!Number.isInteger(m) || m < 1 || m > 12 || m > throughMonth) continue;
    out[k] = snap;
  }
  if (year === 2026) {
    for (const [mStr, vals] of Object.entries(TEMPLATE_LEAVE_BASELINE_2026)) {
      const m = Number(mStr);
      if (m > throughMonth) continue;
      const key = String(m);
      const existing = out[key];
      if (existing && existing.sourceFiles?.[0] !== 'template-baseline' && existing.counts?.all > 0) {
        continue;
      }
      out[key] = {
        year,
        month: m,
        fxRateFcPerUsd: null,
        ...vals,
        leaveCostUsd:
          vals.provisionUsd000 != null
            ? Math.round(vals.provisionUsd000 * 1000 * 100) / 100
            : null,
        counts: { plant: 0, hq: 0, lubudi: 0, all: 0 },
        byMatricule: {},
        sourceFiles: ['template-baseline'],
        importedAt: 'template-baseline',
      };
    }
  }
  return out;
}

export function buildExcoOtMonthImport(input: {
  year: number;
  month: number;
  componentBuffer: ArrayBuffer;
  leaveBuffer?: ArrayBuffer | null;
  fxRateFcPerUsd: number | null;
  sourceFiles: string[];
}): ExcoOtMonthImport {
  const parsed = parseComponentPostedUnits(input.componentBuffer);
  const leaveDetailed = input.leaveBuffer
    ? parseLeaveBalancesDetailed(input.leaveBuffer).byMatricule
    : new Map<string, ExcoLeaveBalanceRow>();

  const employees: ExcoOtEmployeeImport[] = parsed
    .map((e) => {
      const leave = leaveDetailed.get(e.matricule);
      return {
        matricule: e.matricule,
        nom: leave?.nom || e.nom,
        departmentRaw: e.orgUnit || leave?.departmentRaw || '',
        department: mapExcoOtDepartment(e.orgUnit || leave?.departmentRaw || ''),
        hours: e.hours,
        costFc: e.costFc,
        leaveBalance: leave ? leave.leaveBalance : null,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  const deptMap = new Map<string, { hours: number; costFc: number }>();
  for (const e of employees) {
    const prev = deptMap.get(e.department) || { hours: 0, costFc: 0 };
    prev.hours += e.hours;
    prev.costFc += e.costFc;
    deptMap.set(e.department, prev);
  }

  const ordered = excoOtDeptOrder();
  const byDept: ExcoOtDeptMonthRow[] = [
    ...ordered
      .filter((d) => deptMap.has(d))
      .map((d) => {
        const v = deptMap.get(d)!;
        return {
          department: d,
          hours: Math.round(v.hours * 100) / 100,
          costFc: Math.round(v.costFc * 100) / 100,
        };
      }),
    ...[...deptMap.entries()]
      .filter(([d]) => !ordered.includes(d))
      .map(([department, v]) => ({
        department,
        hours: Math.round(v.hours * 100) / 100,
        costFc: Math.round(v.costFc * 100) / 100,
      })),
  ];

  return {
    year: input.year,
    month: input.month,
    fxRateFcPerUsd:
      input.fxRateFcPerUsd != null && Number.isFinite(input.fxRateFcPerUsd) && input.fxRateFcPerUsd > 0
        ? input.fxRateFcPerUsd
        : null,
    employees,
    byDept,
    sourceFiles: input.sourceFiles,
    importedAt: new Date().toISOString(),
  };
}

export function fcToUsd(costFc: number, fxRateFcPerUsd: number | null): number | null {
  if (fxRateFcPerUsd == null || fxRateFcPerUsd <= 0) return null;
  return Math.round((costFc / fxRateFcPerUsd) * 100) / 100;
}

/**
 * Mois antérieurs figés depuis le template EXCO (capt.1) — conservés tant qu’aucun
 * import source ne les remplace. Clés = mois calendaire (3=MAR … 6=JUN).
 */
const TEMPLATE_OT_BASELINE_2026: Record<number, ExcoOtDeptMonthRow[]> = {
  3: [
    { department: 'Administration', hours: 0, costFc: 0 },
    { department: 'Engineering', hours: 356.34, costFc: 0 },
    { department: 'Mining', hours: 0, costFc: 0 },
    { department: 'Risk & Environment', hours: 0, costFc: 0 },
    { department: 'Production', hours: 53.06, costFc: 0 },
    { department: 'Sales & Logistics', hours: 57.99, costFc: 0 },
    { department: 'Quality Assurance', hours: 68.58, costFc: 0 },
  ],
  4: [
    { department: 'Administration', hours: 0, costFc: 0 },
    { department: 'Engineering', hours: 356.34, costFc: 0 },
    { department: 'Mining', hours: 64, costFc: 0 },
    { department: 'Risk & Environment', hours: 0, costFc: 0 },
    { department: 'Production', hours: 53.06, costFc: 0 },
    { department: 'Sales & Logistics', hours: 57.99, costFc: 0 },
    { department: 'Quality Assurance', hours: 68.58, costFc: 0 },
  ],
  5: [
    { department: 'Administration', hours: 16, costFc: 0 },
    { department: 'Engineering', hours: 538.73, costFc: 0 },
    { department: 'Mining', hours: 52.3, costFc: 0 },
    { department: 'Risk & Environment', hours: 6.3, costFc: 0 },
    { department: 'Production', hours: 241.41, costFc: 0 },
    { department: 'Sales & Logistics', hours: 128.91, costFc: 0 },
    { department: 'Quality Assurance', hours: 53.97, costFc: 0 },
  ],
  6: [
    { department: 'Administration', hours: 0, costFc: 0 },
    { department: 'Engineering', hours: 784.18, costFc: 0 },
    { department: 'Mining', hours: 60, costFc: 0 },
    { department: 'Risk & Environment', hours: 0, costFc: 0 },
    { department: 'Production', hours: 163.52, costFc: 0 },
    { department: 'Sales & Logistics', hours: 82.24, costFc: 0 },
    { department: 'Quality Assurance', hours: 101.13, costFc: 0 },
  ],
};

function baselineSnapshot(
  year: number,
  month: number,
  byDept: ExcoOtDeptMonthRow[],
): ExcoOtMonthImport {
  return {
    year,
    month,
    fxRateFcPerUsd: null,
    employees: [],
    byDept,
    sourceFiles: ['template-baseline'],
    importedAt: 'template-baseline',
  };
}

/** Fusionne imports année + baseline template (sans écraser un vrai import). */
export function mergeExcoOtImportsForYear(
  year: number,
  throughMonth: number,
  imported: Record<string, ExcoOtMonthImport | undefined>,
): Record<string, ExcoOtMonthImport> {
  const out: Record<string, ExcoOtMonthImport> = {};
  for (const [k, snap] of Object.entries(imported || {})) {
    if (!snap) continue;
    const m = Number(k);
    if (!Number.isInteger(m) || m < 1 || m > 12 || m > throughMonth) continue;
    out[k] = snap;
  }
  if (year === 2026) {
    for (const [mStr, rows] of Object.entries(TEMPLATE_OT_BASELINE_2026)) {
      const m = Number(mStr);
      if (m > throughMonth) continue;
      const key = String(m);
      const existing = out[key];
      // Ne remplace pas un import réel (avec employés)
      if (existing?.employees?.length) continue;
      if (existing && existing.sourceFiles?.[0] !== 'template-baseline') continue;
      out[key] = baselineSnapshot(year, m, rows);
    }
  }
  return out;
}
