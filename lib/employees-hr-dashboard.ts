import {
  computeAgeFromDisplayDate,
  displayDateSortKey,
  parseDisplayDateParts,
  RAISON_EXITS,
  wasPresentOnAsOf,
} from '@/lib/employee-columns';
import {
  isCddEmployee,
  isInActiveTrialPeriod,
  isTrialEvalAlert,
  resolveEssaiStatutEval,
} from '@/lib/employees-trial';
import type { Employee } from '@/lib/types';

export interface HrDashCountRow {
  label: string;
  count: number;
}

/** Répartition PPC par localisation × genre (tableau dashboard). */
export interface HrLocalisationGenderRow {
  label: string;
  hommes: number;
  femmes: number;
  total: number;
}

export interface EmployeesExitMonthRow {
  label: string;
  /** Clé YYYY-MM pour tri. */
  key: string;
  demission: number;
  licenciement: number;
  retraite: number;
  finContrat: number;
  total: number;
}

export interface EmployeesLatestHireRow {
  matricule: string;
  nom: string;
  appointmentDate: string;
  departement: string;
  localisation: string;
  grade: string;
  company: string;
}

export interface EmployeesHrDashboardStats {
  total: number;
  hommes: number;
  femmes: number;
  ageMoyen: number | null;
  moyEnfants: number | null;
  maries: number;
  totalCdd: number;
  totalEssai: number;
  alertesEssai: number;
  essaiParStatut: HrDashCountRow[];
  cddParDepartement: HrDashCountRow[];
  parLocalisation: HrDashCountRow[];
  parCompany: HrDashCountRow[];
  parGenre: HrDashCountRow[];
  parMaritalStatus: HrDashCountRow[];
  parGrade: HrDashCountRow[];
  parDepartement: HrDashCountRow[];
  parTrancheAge: HrDashCountRow[];
  parNationalite: HrDashCountRow[];
  derniersArrives: EmployeesLatestHireRow[];
  totalExits: number;
  exitsParRaison: HrDashCountRow[];
  exitsParMois: EmployeesExitMonthRow[];
}

function resolveAge(employee: Employee): number | null {
  const fromDob = computeAgeFromDisplayDate(employee.dateOfBirth);
  if (fromDob != null) return fromDob;
  if (employee.age != null && employee.age > 0) return employee.age;
  return null;
}

export function isMaleGender(gender: string): boolean {
  const g = gender.trim().toLowerCase();
  return g === 'm' || g === 'male' || g.startsWith('homm');
}

export function isFemaleGender(gender: string): boolean {
  const g = gender.trim().toLowerCase();
  return g === 'f' || g === 'female' || g.startsWith('femm');
}

function isMale(gender: string): boolean {
  return isMaleGender(gender);
}

function isFemale(gender: string): boolean {
  return isFemaleGender(gender);
}

function localisationLabel(employee: Employee): string {
  return employee.localisation?.trim() || 'Non renseigné';
}

/** Tableau Localisation × Hommes / Femmes / Total pour l’effectif PPC. */
export function buildPpcLocalisationGenderRows(
  employees: Employee[],
): HrLocalisationGenderRow[] {
  const map = new Map<string, HrLocalisationGenderRow>();
  for (const e of Array.isArray(employees) ? employees : []) {
    const label = localisationLabel(e);
    let row = map.get(label);
    if (!row) {
      row = { label, hommes: 0, femmes: 0, total: 0 };
      map.set(label, row);
    }
    if (isMale(e.gender)) row.hommes += 1;
    else if (isFemale(e.gender)) row.femmes += 1;
    row.total += 1;
  }
  return [...map.values()].sort(
    (a, b) => b.total - a.total || a.label.localeCompare(b.label, 'fr'),
  );
}

function isMarried(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s.includes('married') || s.includes('marié') || s.includes('marie');
}

function countBy(
  employees: Employee[],
  pick: (e: Employee) => string,
  opts?: { emptyLabel?: string; limit?: number },
): HrDashCountRow[] {
  const map = new Map<string, number>();
  for (const e of employees) {
    const raw = pick(e).trim();
    const label = raw || (opts?.emptyLabel ?? '—');
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  const rows = [...map.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'fr'));
  if (opts?.limit && rows.length > opts.limit) {
    const head = rows.slice(0, opts.limit);
    const rest = rows.slice(opts.limit).reduce((s, r) => s + r.count, 0);
    if (rest > 0) head.push({ label: 'Autres', count: rest });
    return head;
  }
  return rows;
}

const AGE_BANDS: { label: string; match: (age: number) => boolean }[] = [
  { label: '< 25', match: (a) => a >= 0 && a < 25 },
  { label: '25-34', match: (a) => a >= 25 && a < 35 },
  { label: '35-44', match: (a) => a >= 35 && a < 45 },
  { label: '45-54', match: (a) => a >= 45 && a < 55 },
  { label: '55+', match: (a) => a >= 55 },
];

function normalizeLabelCase(raw: string): string {
  const n = raw.trim();
  if (!n) return '';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}

function normalizeMaritalStatus(raw: string): string {
  const n = raw.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (!n) return '';
  if (n.startsWith('marri') || n.startsWith('marie')) return 'Marié(e)';
  if (n.startsWith('sing') || n.startsWith('celib')) return 'Célibataire';
  if (n.startsWith('divor')) return 'Divorcé(e)';
  if (n.startsWith('widow') || n.startsWith('veuf') || n.startsWith('veuv')) return 'Veuf / Veuve';
  return normalizeLabelCase(raw);
}

const LATEST_HIRES_LIMIT = 12;

function employeePresenceKey(employee: Employee): string {
  return (employee.matricule || '').trim() || `nom:${employee.nom}`;
}

/** Fusionne deux listes d'employés sans doublon de matricule. */
export function mergeEmployeesWithExits(
  employees: Employee[],
  exits: Employee[] = [],
): Employee[] {
  const byMatricule = new Map<string, Employee>();
  for (const e of Array.isArray(employees) ? employees : []) {
    byMatricule.set(employeePresenceKey(e), e);
  }
  for (const e of Array.isArray(exits) ? exits : []) {
    const mapKey = employeePresenceKey(e);
    if (!byMatricule.has(mapKey)) byMatricule.set(mapKey, e);
  }
  return [...byMatricule.values()];
}

/** Effectif encore en poste à la date `asOf` (actifs + sorties postérieures). */
export function employeesPresentOnAsOf(
  actives: Employee[],
  exits: Employee[] = [],
  asOf: Date,
): Employee[] {
  const byKey = new Map<string, Employee>();
  const add = (employee: Employee, isExit = false) => {
    if (!wasPresentOnAsOf(employee, asOf, { isExit })) return;
    const key = employeePresenceKey(employee);
    if (!byKey.has(key)) byKey.set(key, employee);
  };
  for (const e of Array.isArray(actives) ? actives : []) add(e, false);
  for (const e of Array.isArray(exits) ? exits : []) add(e, true);
  return [...byKey.values()];
}

function buildDerniersArrives(employees: Employee[]): EmployeesLatestHireRow[] {
  return [...employees]
    .filter((e) => displayDateSortKey(e.appointmentDate) > 0)
    .sort((a, b) => {
      const diff = displayDateSortKey(b.appointmentDate) - displayDateSortKey(a.appointmentDate);
      if (diff !== 0) return diff;
      return (a.nom || '').localeCompare(b.nom || '', 'fr');
    })
    .slice(0, LATEST_HIRES_LIMIT)
    .map((e) => ({
      matricule: e.matricule || '—',
      nom: e.nom || '—',
      appointmentDate: e.appointmentDate || '—',
      departement: e.departement || '—',
      localisation: e.localisation || '—',
      grade: e.grade || '—',
      company: e.company || '—',
    }));
}

function parseExitMonthKey(dateDisplay: string): string | null {
  const raw = dateDisplay.trim();
  if (!raw) return null;
  const fr = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (fr) {
    const mm = fr[2].padStart(2, '0');
    return `${fr[3]}-${mm}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  return null;
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-');
  const monthNames = [
    'Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin',
    'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc',
  ];
  const idx = Number(m) - 1;
  return `${monthNames[idx] ?? m} ${y}`;
}

type RaisonKey = 'demission' | 'licenciement' | 'retraite' | 'finContrat';

function normalizeRaisonKey(raison: string): RaisonKey | null {
  const r = raison.trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (r.includes('demission')) return 'demission';
  if (r.includes('licenci')) return 'licenciement';
  if (r.includes('retra')) return 'retraite';
  if (r.includes('fin') && r.includes('contrat')) return 'finContrat';
  return null;
}

function buildExitsParMois(exits: Employee[]): EmployeesExitMonthRow[] {
  const map = new Map<string, EmployeesExitMonthRow>();
  for (const e of exits) {
    const key = parseExitMonthKey(e.dateFinContrat) ?? 'inconnu';
    if (!map.has(key)) {
      map.set(key, {
        key,
        label: key === 'inconnu' ? 'Non renseigné' : monthLabel(key),
        demission: 0,
        licenciement: 0,
        retraite: 0,
        finContrat: 0,
        total: 0,
      });
    }
    const row = map.get(key)!;
    const raisonKey = normalizeRaisonKey(e.raisonExit);
    if (raisonKey) row[raisonKey] += 1;
    row.total += 1;
  }

  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/** KPIs : `employees` = effectif au dernier jour, `exits` = sorties de la période. */
export function buildEmployeesHrDashboard(
  employees: Employee[],
  exits: Employee[] = [],
): EmployeesHrDashboardStats {
  const active = Array.isArray(employees) ? employees : [];
  const exitList = Array.isArray(exits) ? exits : [];
  const list = active;
  let hommes = 0;
  let femmes = 0;
  let maries = 0;
  let ageSum = 0;
  let ageN = 0;
  let enfantsSum = 0;
  let enfantsN = 0;
  const ages: number[] = [];

  for (const e of list) {
    if (isMale(e.gender)) hommes += 1;
    else if (isFemale(e.gender)) femmes += 1;
    if (isMarried(e.maritalStatus)) maries += 1;
    const age = resolveAge(e);
    if (age != null) {
      ageSum += age;
      ageN += 1;
      ages.push(age);
    }
    if (e.numberOfChildren != null && !Number.isNaN(e.numberOfChildren)) {
      enfantsSum += e.numberOfChildren;
      enfantsN += 1;
    }
  }

  const parTrancheAge = AGE_BANDS.map((band) => ({
    label: band.label,
    count: ages.filter((a) => band.match(a)).length,
  }));

  const exitsParRaison = RAISON_EXITS.filter((label) => label !== 'NA').map((label) => ({
    label,
    count: exitList.filter(
      (e) => normalizeRaisonKey(e.raisonExit) === normalizeRaisonKey(label),
    ).length,
  }));

  const cddList = active.filter((e) => isCddEmployee(e));
  const essaiList = active.filter((e) => isInActiveTrialPeriod(e));
  const alertesList = active.filter((e) => isTrialEvalAlert(e));

  return {
    total: list.length,
    hommes,
    femmes,
    ageMoyen: ageN ? Math.round((ageSum / ageN) * 10) / 10 : null,
    moyEnfants: enfantsN ? Math.round((enfantsSum / enfantsN) * 100) / 100 : null,
    maries,
    totalCdd: cddList.length,
    totalEssai: essaiList.length,
    alertesEssai: alertesList.length,
    essaiParStatut: countBy(essaiList, (e) => resolveEssaiStatutEval(e), {
      emptyLabel: 'Ongoing',
    }),
    cddParDepartement: countBy(cddList, (e) => e.departement || '', { emptyLabel: '—' }),
    parLocalisation: countBy(list, (e) => e.localisation || '', { emptyLabel: 'Non renseigné' }),
    parCompany: countBy(list, (e) => e.company || '', { emptyLabel: '—' }),
    parGenre: [
      { label: 'Hommes', count: hommes },
      { label: 'Femmes', count: femmes },
    ],
    parMaritalStatus: countBy(list, (e) => normalizeMaritalStatus(e.maritalStatus || ''), {
      emptyLabel: 'Non renseigné',
    }),
    parGrade: countBy(list, (e) => e.grade || '', { emptyLabel: '—' }),
    parDepartement: countBy(list, (e) => e.departement || '', { emptyLabel: '—' }),
    parTrancheAge,
    parNationalite: countBy(list, (e) => normalizeLabelCase(e.nationality || ''), { emptyLabel: '—' }),
    derniersArrives: buildDerniersArrives(active),
    totalExits: exitList.length,
    exitsParRaison,
    exitsParMois: buildExitsParMois(exitList),
  };
}

export type EmployeesHrKpiKey =
  | 'total'
  | 'hommes'
  | 'femmes'
  | 'totalExits'
  | 'totalCdd'
  | 'totalEssai'
  | 'alertesEssai'
  | 'ageMoyen'
  | 'entrees';

const MONTH_LABELS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

export function prevYearMonth(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

export function formatHrMonthLabel(year: number, month: number): string {
  return `${MONTH_LABELS_FR[month - 1] ?? month} ${year}`;
}

function asOfEndOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59);
}

function ageAt(employee: Employee, asOf: Date): number | null {
  const parts = parseDisplayDateParts(employee.dateOfBirth || '');
  if (parts) {
    let age = asOf.getFullYear() - parts.y;
    const m = asOf.getMonth() + 1 - parts.m;
    if (m < 0 || (m === 0 && asOf.getDate() < parts.d)) age -= 1;
    return age >= 0 && age < 120 ? age : null;
  }
  const fromDob = computeAgeFromDisplayDate(employee.dateOfBirth);
  if (fromDob != null) return fromDob;
  if (employee.age != null && employee.age > 0) return employee.age;
  return null;
}

export function hiredInYearMonth(employee: Employee, year: number, month: number): boolean {
  const parts = parseDisplayDateParts(employee.appointmentDate || '');
  if (!parts) return false;
  return parts.y === year && parts.m === month;
}

function presentInYearMonth(
  actives: Employee[],
  exits: Employee[],
  year: number,
  month: number,
): Employee[] {
  return employeesPresentOnAsOf(actives, exits, asOfEndOfMonth(year, month));
}

function avgRounded(nums: number[], digits = 1): number | null {
  if (!nums.length) return null;
  const f = 10 ** digits;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * f) / f;
}

/** Écart relatif vs mois précédent (ratio, ex. -0.036 = −3,6 %). */
export function momDeltaRatio(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (current === 0) return 0;
  if (previous === 0) return 1;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 1000;
}

export interface HrPeriodMomStats {
  year: number;
  month: number;
  periodLabel: string;
  prevPeriodLabel: string;
  ageMoyen: number | null;
  prevAgeMoyen: number | null;
  ageDeltaPct: number | null;
  ageHomme: number | null;
  ageFemme: number | null;
  entrees: number;
  prevEntrees: number;
  entreesDeltaPct: number | null;
  present: Employee[];
  hires: Employee[];
}

/** Âge moyen et embauches du mois, comparés au mois précédent (même logique que le rapport EXCO). */
export function buildHrPeriodMomStats(
  actives: Employee[],
  exits: Employee[],
  year: number,
  month: number,
): HrPeriodMomStats {
  const prev = prevYearMonth(year, month);
  const asOf = asOfEndOfMonth(year, month);
  const asOfPrev = asOfEndOfMonth(prev.year, prev.month);
  const present = presentInYearMonth(actives, exits, year, month);
  const presentPrev = presentInYearMonth(actives, exits, prev.year, prev.month);
  const pool = [...(Array.isArray(actives) ? actives : []), ...(Array.isArray(exits) ? exits : [])];
  const hires = pool.filter((e) => hiredInYearMonth(e, year, month));
  const prevHires = pool.filter((e) => hiredInYearMonth(e, prev.year, prev.month));

  const ages = present.map((e) => ageAt(e, asOf)).filter((n): n is number => n != null);
  const prevAges = presentPrev.map((e) => ageAt(e, asOfPrev)).filter((n): n is number => n != null);
  const agesMale = present
    .filter((e) => isMale(e.gender))
    .map((e) => ageAt(e, asOf))
    .filter((n): n is number => n != null);
  const agesFemale = present
    .filter((e) => isFemale(e.gender))
    .map((e) => ageAt(e, asOf))
    .filter((n): n is number => n != null);

  const ageMoyen = avgRounded(ages, 1);
  const prevAgeMoyen = avgRounded(prevAges, 1);
  const entrees = hires.length;
  const prevEntrees = prevHires.length;

  return {
    year,
    month,
    periodLabel: formatHrMonthLabel(year, month),
    prevPeriodLabel: formatHrMonthLabel(prev.year, prev.month),
    ageMoyen,
    prevAgeMoyen,
    ageDeltaPct: momDeltaRatio(ageMoyen, prevAgeMoyen),
    ageHomme: avgRounded(agesMale, 1),
    ageFemme: avgRounded(agesFemale, 1),
    entrees,
    prevEntrees,
    entreesDeltaPct: momDeltaRatio(entrees, prevEntrees),
    present,
    hires: [...hires].sort(
      (a, b) =>
        displayDateSortKey(b.appointmentDate) - displayDateSortKey(a.appointmentDate)
        || (a.nom || '').localeCompare(b.nom || '', 'fr'),
    ),
  };
}

/** Liste derrière un KPI du dashboard RH (moyennes exclues). */
export function employeesForHrKpi(
  employees: Employee[],
  exits: Employee[],
  key: EmployeesHrKpiKey,
): Employee[] {
  const active = Array.isArray(employees) ? employees : [];
  const exitList = Array.isArray(exits) ? exits : [];
  switch (key) {
    case 'total':
      return active;
    case 'hommes':
      return active.filter((e) => isMale(e.gender));
    case 'femmes':
      return active.filter((e) => isFemale(e.gender));
    case 'totalExits':
      return exitList;
    case 'totalCdd':
      return active.filter((e) => isCddEmployee(e));
    case 'totalEssai':
      return active.filter((e) => isInActiveTrialPeriod(e));
    case 'alertesEssai':
      return active.filter((e) => isTrialEvalAlert(e));
    default:
      return [];
  }
}

export function employeeToDashboardListRow(employee: Employee) {
  return {
    id: employee.matricule || employee.nom,
    cells: {
      matricule: employee.matricule || '—',
      nom: employee.nom || '—',
      localisation: employee.localisation || '—',
      departement: employee.departement || '—',
      grade: employee.grade || '—',
      genre: employee.gender || '—',
      company: employee.company || '—',
      embauche: employee.appointmentDate || '—',
      age: (() => {
        const age = resolveAge(employee);
        return age != null ? String(age) : '—';
      })(),
      nationalite: employee.nationality || '—',
      raison: employee.raisonExit || '—',
      typeContrat: employee.typeContrat || '—',
      finEssai: employee.dateFinPeriodeEssai || '—',
      statutEval: resolveEssaiStatutEval(employee),
      finContrat: employee.dateFinContrat || '—',
    },
  };
}

export type HrChartSegmentKind =
  | 'company'
  | 'localisation'
  | 'maritalStatus'
  | 'genre'
  | 'grade'
  | 'ageBand'
  | 'departement'
  | 'nationalite'
  | 'essaiStatut'
  | 'cddDepartement'
  | 'exitRaison'
  | 'exitMonth';

/** Employés correspondant à un segment de graphique (barre / part). */
export function employeesMatchingHrSegment(
  employees: Employee[],
  kind: HrChartSegmentKind,
  label: string,
): Employee[] {
  const list = Array.isArray(employees) ? employees : [];
  const target = label.trim();
  if (!target) return list;

  switch (kind) {
    case 'company':
      return list.filter((e) => (e.company?.trim() || '—') === target);
    case 'localisation':
      return list.filter((e) => (e.localisation?.trim() || 'Non renseigné') === target);
    case 'maritalStatus':
      return list.filter((e) => {
        const status = normalizeMaritalStatus(e.maritalStatus || '') || 'Non renseigné';
        return status === target;
      });
    case 'genre':
      if (target === 'Hommes') return list.filter((e) => isMale(e.gender));
      if (target === 'Femmes') return list.filter((e) => isFemale(e.gender));
      return list;
    case 'grade':
      return list.filter((e) => (e.grade?.trim() || '—') === target);
    case 'ageBand': {
      const band = AGE_BANDS.find((b) => b.label === target);
      if (!band) return [];
      return list.filter((e) => {
        const age = resolveAge(e);
        return age != null && band.match(age);
      });
    }
    case 'departement':
      return list.filter((e) => (e.departement?.trim() || '—') === target);
    case 'nationalite':
      return list.filter((e) => {
        const nat = normalizeLabelCase(e.nationality || '') || '—';
        return nat === target;
      });
    case 'essaiStatut':
      return list.filter((e) => {
        if (!isInActiveTrialPeriod(e)) return false;
        return resolveEssaiStatutEval(e) === target;
      });
    case 'cddDepartement':
      return list.filter(
        (e) => isCddEmployee(e) && (e.departement?.trim() || '—') === target,
      );
    case 'exitRaison':
      return list.filter(
        (e) => normalizeRaisonKey(e.raisonExit) === normalizeRaisonKey(target),
      );
    case 'exitMonth': {
      return list.filter((e) => {
        const key = parseExitMonthKey(e.dateFinContrat) ?? 'inconnu';
        const rowLabel = key === 'inconnu' ? 'Non renseigné' : monthLabel(key);
        return rowLabel === target || key === target;
      });
    }
    default:
      return [];
  }
}

