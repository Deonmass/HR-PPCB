import {
  computeAgeFromDisplayDate,
  displayDateSortKey,
  RAISON_EXITS,
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

function isMale(gender: string): boolean {
  const g = gender.trim().toLowerCase();
  return g === 'm' || g === 'male' || g.startsWith('homm');
}

function isFemale(gender: string): boolean {
  const g = gender.trim().toLowerCase();
  return g === 'f' || g === 'female' || g.startsWith('femm');
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

/** KPIs alignés sur la feuille Dashboard du template EMPLOYEES_HR_EXPORT. */
export function buildEmployeesHrDashboard(
  employees: Employee[],
  exits: Employee[] = [],
): EmployeesHrDashboardStats {
  const list = Array.isArray(employees) ? employees : [];
  const exitList = Array.isArray(exits) ? exits : [];
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

  const cddList = list.filter((e) => isCddEmployee(e));
  const essaiList = list.filter((e) => isInActiveTrialPeriod(e));
  const alertesList = list.filter((e) => isTrialEvalAlert(e));

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
    derniersArrives: buildDerniersArrives(list),
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
  | 'alertesEssai';

/** Liste derrière un KPI du dashboard RH (moyennes exclues). */
export function employeesForHrKpi(
  employees: Employee[],
  exits: Employee[],
  key: EmployeesHrKpiKey,
): Employee[] {
  const list = Array.isArray(employees) ? employees : [];
  const exitList = Array.isArray(exits) ? exits : [];
  switch (key) {
    case 'total':
      return list;
    case 'hommes':
      return list.filter((e) => isMale(e.gender));
    case 'femmes':
      return list.filter((e) => isFemale(e.gender));
    case 'totalExits':
      return exitList;
    case 'totalCdd':
      return list.filter((e) => isCddEmployee(e));
    case 'totalEssai':
      return list.filter((e) => isInActiveTrialPeriod(e));
    case 'alertesEssai':
      return list.filter((e) => isTrialEvalAlert(e));
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

