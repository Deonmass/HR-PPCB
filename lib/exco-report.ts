import 'server-only';

import { listAuditHrActions } from './audit-hr-store';
import { buildAuditHrDashboard, computeStatus } from './audit-hr-compute';
import {
  computeAgeFromDisplayDate,
  computeSeniorityYears,
  displayDateSortKey,
  parseDisplayDateParts,
} from './employee-columns';
import { employeesPresentOnAsOf, isFemaleGender, isMaleGender } from './employees-hr-dashboard';
import { readEmployeesBundle } from './employees-json-store';
import { calcDocumentCompletion } from './documents';
import { getExcoOverlays, getExcoYearLeaveImports, getExcoYearOvertimeImports } from './exco-store';
import {
  mergeExcoLeaveImportsForYear,
  mergeExcoOtImportsForYear,
  normalizeExcoOtDepartment,
  excoLeaveCostUsdFromSnap,
} from './exco-ot-import';
import { applyWorkbookSnapshotToComputed } from './exco-workbook-apply';
import {
  EXCO_FY_START_YEAR,
  TEMPLATE_TREND_BASELINE_2026,
} from './exco-template-baseline';
import { listDepartments } from './settings-store';
import {
  formatExcoPeriodLabel,
  type ExcoAuditFinding,
  type ExcoComputedBlock,
  type ExcoCountRow,
  type ExcoCsrProject,
  type ExcoCsrSummary,
  type ExcoHireListRow,
  type ExcoMetricValue,
  type ExcoOtDeptRow,
  type ExcoOtEmployeeRow,
  type ExcoOverlays,
  type ExcoReportPayload,
  visibleManualKpis,
  type ExcoSource,
  type ExcoTrendMonth,
} from './exco-types';
import { listMouvements } from './mouvements-store';
import { listWeeklyOvertimeWeeks } from './overtimes-json-store';
import { getPostesBundle } from './postes-store';
import {
  formatPct,
  formatProjectStatus,
  formatUsd,
} from './projects';
import { readProjects } from './projects-store';
import type { ProjectRecord } from './project-types';
import type { Employee } from './types';
import type { AuditHrAction, AuditHrSeverity } from './audit-hr-types';

function prevPeriod(year: number, month: number): { year: number; month: number } {
  if (month <= 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function asOfEndOfMonth(year: number, month: number): Date {
  return new Date(year, month, 0, 23, 59, 59);
}

function resolveAge(employee: Employee, asOf: Date): number | null {
  const fromDob = computeAgeFromDisplayDate(employee.dateOfBirth);
  if (fromDob != null) {
    // approximate: recompute vs asOf if DOB parts available
    const parts = parseDisplayDateParts(employee.dateOfBirth);
    if (parts) {
      let age = asOf.getFullYear() - parts.y;
      const m = asOf.getMonth() + 1 - parts.m;
      if (m < 0 || (m === 0 && asOf.getDate() < parts.d)) age -= 1;
      return age >= 0 && age < 120 ? age : null;
    }
    return fromDob;
  }
  if (employee.age != null && employee.age > 0) return employee.age;
  return null;
}

function siteBucket(localisation: string): string {
  const loc = localisation.trim().toLowerCase();
  if (!loc) return 'Non renseigné';
  if (loc.includes('lubudi')) return 'Lubudi';
  if (
    loc.includes('plant')
    || loc.includes('zamba')
    || loc.includes('malanga')
    || loc.includes('usine')
  ) {
    return 'Plant';
  }
  if (loc.includes('graduate') || loc.includes('stagiaire')) return 'Graduates';
  return 'HQ and Regions';
}

function isHqSite(site: string): boolean {
  return site === 'HQ and Regions';
}

function sharePct(part: number, total: number): number | null {
  if (!total) return null;
  return Math.round((part / total) * 1000) / 10;
}

/** Ratio H/F : Sites (hors HQ) vs Head Office. */
function genderPctByScope(employees: Employee[]): {
  genderMalePctSites: number | null;
  genderFemalePctSites: number | null;
  genderMalePctHq: number | null;
  genderFemalePctHq: number | null;
} {
  const sites = employees.filter((e) => !isHqSite(siteBucket(e.localisation || '')));
  const hq = employees.filter((e) => isHqSite(siteBucket(e.localisation || '')));
  const sitesMale = sites.filter((e) => isMaleGender(e.gender)).length;
  const sitesFemale = sites.filter((e) => isFemaleGender(e.gender)).length;
  const hqMale = hq.filter((e) => isMaleGender(e.gender)).length;
  const hqFemale = hq.filter((e) => isFemaleGender(e.gender)).length;
  return {
    genderMalePctSites: sharePct(sitesMale, sites.length),
    genderFemalePctSites: sharePct(sitesFemale, sites.length),
    genderMalePctHq: sharePct(hqMale, hq.length),
    genderFemalePctHq: sharePct(hqFemale, hq.length),
  };
}

function hiredInMonth(employee: Employee, year: number, month: number): boolean {
  const parts = parseDisplayDateParts(employee.appointmentDate || '');
  if (!parts) return false;
  return parts.y === year && parts.m === month;
}

function employeeKey(employee: Employee): string {
  const matricule = (employee.matricule || '').trim().toLowerCase();
  if (matricule) return `m:${matricule}`;
  return `n:${(employee.nom || '').trim().toLowerCase()}`;
}

function toHireListRow(employee: Employee, reason = 'Embauche'): ExcoHireListRow {
  return {
    matricule: employee.matricule || '',
    nom: employee.nom || '',
    localisation: employee.localisation || '',
    departement: employee.departement || '',
    grade: employee.grade || '',
    genre: employee.gender || '',
    company: employee.company || '',
    appointmentDate: employee.appointmentDate || '',
    site: siteBucket(employee.localisation || ''),
    reason,
  };
}

function sortByAppointmentThenName(employees: Employee[]): Employee[] {
  return employees.slice().sort(
    (a, b) =>
      displayDateSortKey(b.appointmentDate || '') - displayDateSortKey(a.appointmentDate || '')
      || (a.nom || '').localeCompare(b.nom || '', 'fr'),
  );
}

function exitedInMonth(employee: Employee, year: number, month: number): boolean {
  const parts = parseDisplayDateParts(employee.dateFinContrat || '');
  if (!parts) return false;
  return parts.y === year && parts.m === month;
}

function presentEmployees(
  actives: Employee[],
  exits: Employee[],
  year: number,
  month: number,
): Employee[] {
  return employeesPresentOnAsOf(actives, exits, asOfEndOfMonth(year, month));
}

function avg(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

/**
 * Écart relatif vs mois précédent.
 * — valeur courante à 0 → 0 % (pas −100 %)
 * — précédent à 0 et courant > 0 → +100 %
 */
function deltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null;
  if (current === 0) return 0;
  if (previous === 0) return 1;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 1000;
}

function bandCount(values: number[], bands: Array<{ label: string; min: number; max: number }>): ExcoCountRow[] {
  return bands.map((band) => ({
    label: band.label,
    value: values.filter((v) => v >= band.min && v < band.max).length,
  }));
}

function metric(
  key: string,
  label: string,
  value: number | string | null,
  source: ExcoSource,
  opts?: {
    deltaPct?: number | null;
    prevValue?: number | string | null;
    unit?: string;
    hint?: string;
  },
): ExcoMetricValue {
  return {
    key,
    label,
    value,
    source,
    deltaPct: opts?.deltaPct ?? null,
    prevValue: opts?.prevValue ?? null,
    unit: opts?.unit,
    hint: opts?.hint,
  };
}

function manualOrEmpty(
  key: string,
  label: string,
  manual: number | null | undefined,
  unit?: string,
  hint?: string,
  prevValue?: number | string | null,
): ExcoMetricValue {
  if (manual != null && Number.isFinite(manual)) {
    return metric(key, label, manual, 'manual', { unit, hint, prevValue });
  }
  return metric(key, label, null, 'empty', { unit, hint, prevValue });
}

function buildCsrProgress(project: ProjectRecord): string {
  const parts = [
    formatProjectStatus(project.statut || ''),
    `budget ${formatPct(project.pctBudget)}`,
    `${formatUsd(project.budgetDepense, 0)} / ${formatUsd(project.budgetPrevu, 0)}`,
  ];
  if (project.lieu?.trim()) parts.push(`lieu: ${project.lieu.trim()}`);
  if (project.dateDebut || project.dateFin) {
    parts.push(`période: ${project.dateDebut || '—'} → ${project.dateFin || '—'}`);
  }
  if (project.responsable?.trim()) parts.push(`resp. ${project.responsable.trim()}`);
  return parts.filter(Boolean).join(' — ');
}

function buildCsrObjective(project: ProjectRecord): string {
  const bits = [
    project.sousActivite?.trim() && project.sousActivite.trim().toUpperCase() !== 'NA'
      ? project.sousActivite.trim()
      : '',
    project.secteur?.trim() ? `Secteur: ${project.secteur.trim()}` : '',
    project.typeProjet?.trim() ? `Type: ${project.typeProjet.trim()}` : '',
  ].filter(Boolean);
  return bits.join(' · ');
}

function statusBucket(statut: string): 'enCours' | 'termines' | 'nonDebutes' | null {
  const n = statut.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  if (n.includes('termin')) return 'termines';
  if (n.includes('cours')) return 'enCours';
  if (n.includes('non') || n.includes('debut')) return 'nonDebutes';
  return null;
}

function projectTypeBucket(typeProjet: string): 'csr' | 'cahier' | 'autre' {
  const t = typeProjet.trim().toLowerCase();
  if (t === 'csr') return 'csr';
  if (t.includes('cahier')) return 'cahier';
  return 'autre';
}

function buildCsrSummary(projects: ExcoCsrProject[]): ExcoCsrSummary {
  const byType = new Map<string, number>();
  const bySecteur = new Map<string, { csr: number; cahier: number; total: number }>();
  let enCours = 0;
  let termines = 0;
  let nonDebutes = 0;
  let budgetPrevu = 0;
  let budgetDepense = 0;

  for (const p of projects) {
    const type = p.typeProjet?.trim() || 'Autre';
    byType.set(type, (byType.get(type) ?? 0) + 1);
    const secteur = p.secteur?.trim() || 'Non renseigné';
    const row = bySecteur.get(secteur) || { csr: 0, cahier: 0, total: 0 };
    const bucket = projectTypeBucket(type);
    if (bucket === 'csr') row.csr += 1;
    else if (bucket === 'cahier') row.cahier += 1;
    row.total += 1;
    bySecteur.set(secteur, row);
    const status = statusBucket(p.statut || '');
    if (status === 'enCours') enCours += 1;
    else if (status === 'termines') termines += 1;
    else if (status === 'nonDebutes') nonDebutes += 1;
    budgetPrevu += Number(p.budgetPrevu) || 0;
    budgetDepense += Number(p.budgetDepense) || 0;
  }

  return {
    total: projects.length,
    enCours,
    termines,
    nonDebutes,
    budgetPrevu,
    budgetDepense,
    byType: [...byType.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value),
    bySecteur: [...bySecteur.entries()]
      .map(([label, counts]) => ({ label, ...counts }))
      .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label, 'fr')),
  };
}

function mergeCsrProjects(
  fromModule: ProjectRecord[],
  overlays: ExcoOverlays,
): ExcoCsrProject[] {
  const overlayById = new Map(
    overlays.csrProjects.map((row) => [row.id, row] as const),
  );
  const usedIds = new Set<string>();

  const fromProjects: ExcoCsrProject[] = fromModule.map((p) => {
    usedIds.add(p.id);
    const ov = overlayById.get(p.id);
    return {
      id: p.id,
      name: p.name,
      source: 'project',
      typeProjet: p.typeProjet,
      lieu: p.lieu,
      secteur: p.secteur,
      annee: p.annee,
      statut: p.statut,
      responsable: p.responsable,
      budgetPrevu: p.budgetPrevu,
      budgetDepense: p.budgetDepense,
      pctBudget: p.pctBudget,
      dateDebut: p.dateDebut,
      dateFin: p.dateFin,
      objective: ov?.objective?.trim() || buildCsrObjective(p),
      progress: ov?.progress?.trim() || buildCsrProgress(p),
      risks: ov?.risks || '',
      nextSteps: ov?.nextSteps || '',
    };
  });

  // Lignes purement manuelles (id hors module Projet)
  const manuals = overlays.csrProjects
    .filter((row) => !usedIds.has(row.id) && (row.source === 'manual' || !row.source))
    .map((row) => ({
      ...row,
      source: 'manual' as const,
      name: row.name || '',
      objective: row.objective || '',
      progress: row.progress || '',
      risks: row.risks || '',
      nextSteps: row.nextSteps || '',
    }));

  const statusOrder = (statut?: string) => {
    const b = statusBucket(statut || '');
    if (b === 'enCours') return 0;
    if (b === 'nonDebutes') return 1;
    if (b === 'termines') return 2;
    return 3;
  };

  return [...fromProjects, ...manuals].sort((a, b) => {
    const so = statusOrder(a.statut) - statusOrder(b.statut);
    if (so !== 0) return so;
    const typeCmp = (a.typeProjet || '').localeCompare(b.typeProjet || '', 'fr');
    if (typeCmp !== 0) return typeCmp;
    return (a.name || '').localeCompare(b.name || '', 'fr');
  });
}

function mapAuditSeverity(severity: AuditHrSeverity | string): ExcoAuditFinding['severity'] {
  if (severity === 'High' || severity === 'Medium' || severity === 'Low') return severity;
  return 'Medium';
}

/** Branche le module Audit points dans les findings EXCO (source de vérité). */
function mergeAuditFindings(
  fromModule: AuditHrAction[],
  overlays: ExcoOverlays,
  asOf: Date,
): ExcoAuditFinding[] {
  const overlayById = new Map(overlays.auditFindings.map((f) => [f.id, f] as const));
  const used = new Set<string>();

  const fromAudit: ExcoAuditFinding[] = fromModule.map((a, index) => {
    used.add(a.id);
    const ov = overlayById.get(a.id);
    const status = computeStatus(a, asOf);
    return {
      id: a.id,
      number: ov?.number || String(index + 1).padStart(2, '0'),
      finding: a.action,
      severity: mapAuditSeverity(a.severity),
      status,
      comments: (ov?.comments?.trim() ? ov.comments : a.commentaire) || '',
      dueDate: a.dueDate || '',
    };
  });

  const manuals = overlays.auditFindings
    .filter((f) => !used.has(f.id))
    .map((f) => ({
      ...f,
      finding: f.finding || '',
      comments: f.comments || '',
      dueDate: f.dueDate || '',
    }));

  return [...fromAudit, ...manuals];
}

const CALENDAR_MONTH_LABELS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

async function buildCalendarYearTrends(
  year: number,
  throughMonth: number,
  actives: Employee[],
  exits: Employee[],
  overlays: ExcoOverlays,
): Promise<ExcoTrendMonth[]> {
  const mouvements = await listMouvements();
  const allPeople = [...actives, ...exits];
  const trends: ExcoTrendMonth[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const label = CALENDAR_MONTH_LABELS[month - 1];
    if (month > throughMonth) {
      trends.push({
        month,
        label,
        headcount: 0,
        plant: 0,
        hq: 0,
        lubudi: 0,
        graduates: 0,
        genderMalePct: null,
        genderFemalePct: null,
        genderMalePctSites: null,
        genderFemalePctSites: null,
        genderMalePctHq: null,
        genderFemalePctHq: null,
        averageAge: null,
        averageAgeMale: null,
        averageAgeFemale: null,
        hires: 0,
        exits: 0,
        turnoverPct: null,
        attritionPct: null,
        promotions: 0,
        overtimeHours: 0,
        staffCost: null,
        volumePerEmp: null,
        revenuePerEmp: null,
        leaveBalanceAvgDays: null,
        leaveCost: null,
        overtimeCost: null,
        leavePlantAvgDays: null,
        leaveHqAvgDays: null,
        leaveLubudiAvgDays: null,
        leaveProvisionUsd000: null,
      });
      continue;
    }

    // Mar–Jun 2026 : démographie / coûts figés ; IN/OUT recalculés depuis le système.
    const locked = TEMPLATE_TREND_BASELINE_2026[month];
    if (year === EXCO_FY_START_YEAR && locked) {
      let overtimeHours = 0;
      const importedOt = overlays.overtimeImportsByMonth?.[String(month)];
      if (importedOt?.byDept?.length) {
        overtimeHours = importedOt.byDept.reduce((s, r) => s + (r.hours || 0), 0);
      }
      const lockedPresent = presentEmployees(actives, exits, year, month);
      const lockedGenderScope = genderPctByScope(lockedPresent);
      const sysHires = allPeople.filter((e) => hiredInMonth(e, year, month)).length;
      const sysExits = exits.filter((e) => exitedInMonth(e, year, month)).length;
      const hcForRate = locked.headcount > 0 ? locked.headcount : lockedPresent.length;
      trends.push({
        month,
        label,
        headcount: locked.headcount,
        plant: locked.plant,
        hq: locked.hq,
        lubudi: locked.lubudi,
        graduates: locked.graduates,
        genderMalePct: locked.genderMalePct,
        genderFemalePct: locked.genderFemalePct,
        ...lockedGenderScope,
        averageAge: locked.averageAge,
        averageAgeMale: locked.averageAgeMale,
        averageAgeFemale: locked.averageAgeFemale,
        hires: sysHires,
        exits: sysExits,
        turnoverPct:
          hcForRate > 0
            ? Math.round((((sysHires + sysExits) / 2) / hcForRate) * 1000) / 10
            : null,
        attritionPct:
          hcForRate > 0 ? Math.round((sysExits / hcForRate) * 1000) / 10 : null,
        promotions: locked.promotions,
        overtimeHours: Math.round(overtimeHours * 100) / 100,
        staffCost: locked.staffCost,
        volumePerEmp: locked.volumePerEmp,
        revenuePerEmp: locked.revenuePerEmp,
        leaveBalanceAvgDays: locked.leaveBalanceAvgDays,
        leaveCost: Math.round(locked.leaveProvisionUsd000 * 1000 * 100) / 100,
        overtimeCost: null,
        leavePlantAvgDays: locked.leavePlantAvgDays,
        leaveHqAvgDays: locked.leaveHqAvgDays,
        leaveLubudiAvgDays: locked.leaveLubudiAvgDays,
        leaveProvisionUsd000: locked.leaveProvisionUsd000,
      });
      continue;
    }

    const asOf = asOfEndOfMonth(year, month);
    const present = presentEmployees(actives, exits, year, month);
    const bySite = new Map<string, number>();
    for (const e of present) {
      const site = siteBucket(e.localisation || '');
      bySite.set(site, (bySite.get(site) ?? 0) + 1);
    }
    const males = present.filter((e) => isMaleGender(e.gender));
    const females = present.filter((e) => isFemaleGender(e.gender));
    const ages = present.map((e) => resolveAge(e, asOf)).filter((n): n is number => n != null);
    const agesMale = males.map((e) => resolveAge(e, asOf)).filter((n): n is number => n != null);
    const agesFemale = females.map((e) => resolveAge(e, asOf)).filter((n): n is number => n != null);
    const headcount = present.length;
    const hires = allPeople.filter((e) => hiredInMonth(e, year, month)).length;
    const exitsCount = exits.filter((e) => exitedInMonth(e, year, month)).length;
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const promotions = mouvements.filter(
      (m) => m.type === 'promotion' && m.date.slice(0, 7) === monthKey,
    ).length;

    let overtimeHours = 0;
    const importedOt = overlays.overtimeImportsByMonth?.[String(month)];
    if (importedOt?.byDept?.length) {
      overtimeHours = importedOt.byDept.reduce((s, r) => s + (r.hours || 0), 0);
    } else {
      try {
        const weeks = await listWeeklyOvertimeWeeks(year, month);
        for (const week of weeks) {
          for (const entry of Object.values(week.entries || {})) {
            overtimeHours +=
              (entry.ot13 || 0) + (entry.ot16 || 0) + (entry.ot2 || 0) + (entry.night || 0);
          }
        }
      } catch {
        overtimeHours = 0;
      }
    }

    const financeKey = String(month);
    const finance = visibleManualKpis({
      ...(overlays.financeByMonth?.[financeKey] || {}),
      ...(month === throughMonth ? overlays.manualKpis : {}),
    });

    const leaveSnap = overlays.leaveImportsByMonth?.[financeKey];
    const leaveAll =
      leaveSnap?.allAvgDays ?? finance.leaveBalanceAvgDays ?? null;
    const leaveCostUsd =
      excoLeaveCostUsdFromSnap(leaveSnap) ?? finance.leaveCost ?? null;

    trends.push({
      month,
      label,
      headcount,
      plant: bySite.get('Plant') ?? 0,
      hq: bySite.get('HQ and Regions') ?? 0,
      lubudi: bySite.get('Lubudi') ?? 0,
      graduates: bySite.get('Graduates') ?? 0,
      genderMalePct:
        headcount > 0 ? Math.round((males.length / headcount) * 1000) / 10 : null,
      genderFemalePct:
        headcount > 0 ? Math.round((females.length / headcount) * 1000) / 10 : null,
      ...genderPctByScope(present),
      averageAge: avg(ages),
      averageAgeMale: avg(agesMale),
      averageAgeFemale: avg(agesFemale),
      hires,
      exits: exitsCount,
      // Turnover = (IN + OUT) / 2 / effectif
      turnoverPct:
        headcount > 0
          ? Math.round((((hires + exitsCount) / 2) / headcount) * 1000) / 10
          : null,
      // Attrition = OUT / effectif
      attritionPct:
        headcount > 0 ? Math.round((exitsCount / headcount) * 1000) / 10 : null,
      promotions,
      overtimeHours: Math.round(overtimeHours * 100) / 100,
      staffCost: finance.staffCost ?? null,
      volumePerEmp: finance.volumePerEmp ?? null,
      revenuePerEmp: finance.revenuePerEmp ?? null,
      leaveBalanceAvgDays: leaveAll,
      leaveCost: leaveCostUsd,
      overtimeCost: finance.overtimeCost ?? null,
      leavePlantAvgDays: leaveSnap?.plantAvgDays ?? null,
      leaveHqAvgDays: leaveSnap?.hqAvgDays ?? null,
      leaveLubudiAvgDays: leaveSnap?.lubudiAvgDays ?? null,
      leaveProvisionUsd000: leaveSnap?.provisionUsd000 ?? null,
    });
  }

  return trends;
}

async function computeBlock(
  year: number,
  month: number,
  overlays: ExcoOverlays,
): Promise<ExcoComputedBlock> {
  const asOf = asOfEndOfMonth(year, month);
  const { employees: actives, exits } = await readEmployeesBundle();
  const present = presentEmployees(actives, exits, year, month);
  const prev = prevPeriod(year, month);
  const presentPrev = presentEmployees(actives, exits, prev.year, prev.month);

  const hiredThisMonth = [...actives, ...exits].filter((e) => hiredInMonth(e, year, month));
  const hiredPrevMonth = [...actives, ...exits].filter((e) => hiredInMonth(e, prev.year, prev.month));
  const hiresList = sortByAppointmentThenName(hiredThisMonth).map((e) => toHireListRow(e, 'Embauche'));
  const periodHireList = sortByAppointmentThenName([...hiredPrevMonth, ...hiredThisMonth]).map((e) =>
    toHireListRow(e, 'Embauche'),
  );
  const presentList = sortByAppointmentThenName(present).map((e) => toHireListRow(e, 'Présent'));
  const prevKeys = new Set(presentPrev.map(employeeKey));
  const currKeys = new Set(present.map(employeeKey));
  const hiredKeys = new Set(hiredThisMonth.map(employeeKey));
  const joinersList = sortByAppointmentThenName(present.filter((e) => !prevKeys.has(employeeKey(e)))).map((e) =>
    toHireListRow(e, hiredKeys.has(employeeKey(e)) ? 'Embauche' : 'Arrivée'),
  );
  const leaversList = sortByAppointmentThenName(presentPrev.filter((e) => !currKeys.has(employeeKey(e)))).map((e) =>
    toHireListRow(e, 'Sortie'),
  );
  const hires = hiredThisMonth.length;
  const prevHires = hiredPrevMonth.length;
  const exitsCount = exits.filter((e) => exitedInMonth(e, year, month)).length;
  const prevExits = exits.filter((e) => exitedInMonth(e, prev.year, prev.month)).length;

  const headcount = present.length;
  const prevHeadcount = presentPrev.length;
  // Turnover = (IN + OUT) / 2 / effectif
  const turnoverPct =
    headcount > 0
      ? Math.round((((hires + exitsCount) / 2) / headcount) * 1000) / 10
      : null;
  const prevTurnoverPct =
    prevHeadcount > 0
      ? Math.round((((prevHires + prevExits) / 2) / prevHeadcount) * 1000) / 10
      : null;

  // Attrition = OUT / effectif
  const attritionPct =
    headcount > 0 ? Math.round((exitsCount / headcount) * 1000) / 10 : null;
  const prevAttritionPct =
    prevHeadcount > 0 ? Math.round((prevExits / prevHeadcount) * 1000) / 10 : null;

  const males = present.filter((e) => isMaleGender(e.gender));
  const females = present.filter((e) => isFemaleGender(e.gender));
  const genderMale = males.length;
  const genderFemale = females.length;
  const genderMalePct =
    headcount > 0 ? Math.round((genderMale / headcount) * 1000) / 10 : null;
  const genderFemalePct =
    headcount > 0 ? Math.round((genderFemale / headcount) * 1000) / 10 : null;

  const prevMales = presentPrev.filter((e) => isMaleGender(e.gender));
  const prevFemales = presentPrev.filter((e) => isFemaleGender(e.gender));
  const prevGenderMalePct =
    prevHeadcount > 0
      ? Math.round((prevMales.length / prevHeadcount) * 1000) / 10
      : null;
  const prevGenderFemalePct =
    prevHeadcount > 0
      ? Math.round((prevFemales.length / prevHeadcount) * 1000) / 10
      : null;

  const ages = present
    .map((e) => resolveAge(e, asOf))
    .filter((n): n is number => n != null);
  const agesMale = males
    .map((e) => resolveAge(e, asOf))
    .filter((n): n is number => n != null);
  const agesFemale = females
    .map((e) => resolveAge(e, asOf))
    .filter((n): n is number => n != null);

  const asOfPrev = asOfEndOfMonth(prev.year, prev.month);
  const prevAges = presentPrev
    .map((e) => resolveAge(e, asOfPrev))
    .filter((n): n is number => n != null);

  const seniorities = present
    .map((e) => computeSeniorityYears(e.appointmentDate || '', asOf))
    .filter((n): n is number => n != null);
  const prevSeniorities = presentPrev
    .map((e) => computeSeniorityYears(e.appointmentDate || '', asOfPrev))
    .filter((n): n is number => n != null);

  const ageBands = bandCount(ages, [
    { label: '<25', min: 0, max: 25 },
    { label: '25-34', min: 25, max: 35 },
    { label: '35-44', min: 35, max: 45 },
    { label: '45-54', min: 45, max: 55 },
    { label: '55+', min: 55, max: 120 },
  ]);

  const seniorityBands = bandCount(seniorities, [
    { label: '<1 yr', min: 0, max: 1 },
    { label: '1-2 yrs', min: 1, max: 2 },
    { label: '2-5 yrs', min: 2, max: 5 },
    { label: '5-10 yrs', min: 5, max: 10 },
    { label: '10+ yrs', min: 10, max: 80 },
  ]);

  const siteMap = new Map<string, number>();
  for (const e of present) {
    const site = siteBucket(e.localisation || '');
    siteMap.set(site, (siteMap.get(site) ?? 0) + 1);
  }
  const siteOrder = ['Plant', 'HQ and Regions', 'Lubudi', 'Graduates', 'Non renseigné'];
  const headcountBySite = siteOrder
    .filter((s) => siteMap.has(s) || s !== 'Non renseigné')
    .map((site) => ({
      site,
      headcount: siteMap.get(site) ?? 0,
      delta: null as number | null,
    }));
  for (const [site, count] of siteMap) {
    if (!siteOrder.includes(site)) {
      headcountBySite.push({ site, headcount: count, delta: null });
    }
  }

  const exitsThisMonth = exits.filter((e) => exitedInMonth(e, year, month));
  const exitsByReasonMap = new Map<string, number>();
  for (const e of exitsThisMonth) {
    const label = (e.raisonExit || '').trim() || 'Non renseigné';
    exitsByReasonMap.set(label, (exitsByReasonMap.get(label) ?? 0) + 1);
  }
  const exitsByReason = [...exitsByReasonMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
  const exitsList = sortByAppointmentThenName(exitsThisMonth).map((e) => ({
    ...toHireListRow(e, (e.raisonExit || '').trim() || 'Sortie'),
    appointmentDate: e.dateFinContrat || e.appointmentDate || '',
  }));

  const hiresByMonth: Record<number, ExcoHireListRow[]> = {};
  const exitsByMonth: Record<number, ExcoHireListRow[]> = {};
  const exitsByReasonYtdMap = new Map<string, number>();
  for (let m = 1; m <= month; m += 1) {
    const monthHires = [...actives, ...exits].filter((e) => hiredInMonth(e, year, m));
    const monthExits = exits.filter((e) => exitedInMonth(e, year, m));
    hiresByMonth[m] = sortByAppointmentThenName(monthHires).map((e) => toHireListRow(e, 'Embauche'));
    exitsByMonth[m] = sortByAppointmentThenName(monthExits).map((e) => ({
      ...toHireListRow(e, (e.raisonExit || '').trim() || 'Sortie'),
      appointmentDate: e.dateFinContrat || e.appointmentDate || '',
    }));
    for (const e of monthExits) {
      const label = (e.raisonExit || '').trim() || 'Non renseigné';
      exitsByReasonYtdMap.set(label, (exitsByReasonYtdMap.get(label) ?? 0) + 1);
    }
  }
  const exitsByReasonYtd = [...exitsByReasonYtdMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const exitsPrevMonth = exits.filter((e) => exitedInMonth(e, prev.year, prev.month));
  const prevExitsByReasonMap = new Map<string, number>();
  for (const e of exitsPrevMonth) {
    const label = (e.raisonExit || '').trim() || 'Non renseigné';
    prevExitsByReasonMap.set(label, (prevExitsByReasonMap.get(label) ?? 0) + 1);
  }
  const prevExitsByReason = [...prevExitsByReasonMap.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const mouvements = await listMouvements();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  const fyStartMonth = 4; // FY PPC approx. Avr → Mar (ajustable)
  const fyStartYear = month >= fyStartMonth ? year : year - 1;
  const promotionsThisMonth = mouvements.filter(
    (m) => m.type === 'promotion' && m.date.slice(0, 7) === monthKey,
  ).length;
  const promotionsYtd = mouvements.filter((m) => {
    if (m.type !== 'promotion') return false;
    const y = Number(m.date.slice(0, 4));
    const mo = Number(m.date.slice(5, 7));
    if (!y || !mo) return false;
    const afterStart =
      y > fyStartYear || (y === fyStartYear && mo >= fyStartMonth);
    const beforeEnd =
      y < year || (y === year && mo <= month);
    return afterStart && beforeEnd;
  }).length;

  // Overtime hours — priorité à l’import Excel EXCO, sinon timesheet app
  const importedMonth = overlays.overtimeImportsByMonth?.[String(month)];
  const hoursByMatricule = new Map<string, { hours: number; department: string; costFc: number }>();
  const hoursByDept = new Map<string, number>();
  const costFcByDept = new Map<string, number>();
  const empByMatricule = new Map<string, Employee>();
  for (const e of [...actives, ...exits]) {
    empByMatricule.set(e.matricule, e);
  }

  const resolveOtDept = (raw: string, matricule?: string) => {
    const emp = matricule ? empByMatricule.get(matricule) : undefined;
    const fromMaster = (emp?.departement || emp?.departmentHr || '').trim();
    if (fromMaster) return normalizeExcoOtDepartment(fromMaster);
    return normalizeExcoOtDepartment(raw);
  };

  if (importedMonth?.employees?.length) {
    for (const e of importedMonth.employees) {
      const department = resolveOtDept(e.departmentRaw || e.department, e.matricule);
      hoursByMatricule.set(e.matricule, {
        hours: e.hours,
        department,
        costFc: e.costFc,
      });
      hoursByDept.set(department, (hoursByDept.get(department) ?? 0) + e.hours);
      costFcByDept.set(department, (costFcByDept.get(department) ?? 0) + e.costFc);
    }
  } else {
    const weeks = await listWeeklyOvertimeWeeks(year, month);
    for (const week of weeks) {
      const deptRaw = week.department?.trim() || '';
      for (const entry of Object.values(week.entries || {})) {
        const hours = (entry.ot13 || 0) + (entry.ot16 || 0) + (entry.ot2 || 0) + (entry.night || 0);
        if (hours <= 0) continue;
        const dept = resolveOtDept(deptRaw, entry.matricule);
        hoursByDept.set(dept, (hoursByDept.get(dept) ?? 0) + hours);
        const prevRow = hoursByMatricule.get(entry.matricule) || {
          hours: 0,
          department: dept,
          costFc: 0,
        };
        prevRow.hours += hours;
        if (!prevRow.department || prevRow.department === '—') prevRow.department = dept;
        hoursByMatricule.set(entry.matricule, prevRow);
      }
    }
  }

  const nameByMatricule = new Map<string, string>();
  for (const e of [...actives, ...exits]) {
    nameByMatricule.set(e.matricule, e.nom);
  }

  const fx = importedMonth?.fxRateFcPerUsd ?? null;
  const systemDeptNames = (await listDepartments())
    .filter((d) => d.active)
    .map((d) => d.name);
  const deptOrder = systemDeptNames.length
    ? systemDeptNames
    : [...new Set([...hoursByDept.keys()])];

  const findSnapDeptHours = (
    snap: NonNullable<ExcoOverlays['overtimeImportsByMonth']>[string] | undefined,
    department: string,
  ): number | null => {
    if (!snap?.byDept?.length) return null;
    const row = snap.byDept.find(
      (d) => normalizeExcoOtDepartment(d.department) === department,
    );
    return row ? row.hours : null;
  };

  const extraDeptKeys = [
    ...hoursByDept.keys(),
    ...Object.keys(overlays.overtimeImportsByMonth || {}).flatMap((k) =>
      (overlays.overtimeImportsByMonth?.[k]?.byDept || []).map((d) =>
        normalizeExcoOtDepartment(d.department),
      ),
    ),
  ].filter((d) => !deptOrder.includes(d));

  const allDeptKeys = [...deptOrder, ...[...new Set(extraDeptKeys)].sort((a, b) => a.localeCompare(b))];

  const overtimeByDept: ExcoOtDeptRow[] = allDeptKeys
    .map((department) => {
      const hours = hoursByDept.get(department) ?? 0;
      const manualCost = overlays.overtimeCostByDept[department]
        ?? overlays.overtimeCostByDept[
          Object.keys(overlays.overtimeCostByDept || {}).find(
            (k) => normalizeExcoOtDepartment(k) === department,
          ) || ''
        ];
      const importedCostFc = costFcByDept.get(department);
      const importedUsd =
        importedCostFc != null && fx != null && fx > 0
          ? Math.round((importedCostFc / fx) * 100) / 100
          : null;
      const cost =
        manualCost != null && Number.isFinite(manualCost)
          ? manualCost
          : importedUsd;
      const hoursByMonth: Array<number | null> = Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        if (m === 1 || m === 2) return null;
        if (m > month) return null;
        const snap = overlays.overtimeImportsByMonth?.[String(m)];
        if (!snap) return m === month ? hours || null : null;
        const h = findSnapDeptHours(snap, department);
        if (h != null) return h;
        // Import réel sans cette dept = 0h ; baseline sans la dept = vide
        if ((snap.employees?.length || 0) > 0) return 0;
        return null;
      });
      return {
        department,
        hours: Math.round(hours * 100) / 100,
        cost: cost != null && Number.isFinite(cost) ? cost : null,
        costSource:
          cost != null && Number.isFinite(cost)
            ? manualCost != null
              ? ('manual' as const)
              : ('computed' as const)
            : ('empty' as const),
        hoursByMonth,
      };
    })
    .filter(
      (r) =>
        deptOrder.includes(r.department)
        || r.hours > 0
        || (r.hoursByMonth || []).some((h) => h != null && h > 0),
    );

  const overtimeHoursTotal =
    Math.round(
      overtimeByDept.reduce((sum, row) => sum + row.hours, 0) * 100,
    ) / 100;

  const overtimeTopEmployees: ExcoOtEmployeeRow[] = [...hoursByMatricule.entries()]
    .map(([matricule, row]) => {
      const imported = importedMonth?.employees.find((e) => e.matricule === matricule);
      const leave =
        overlays.leaveBalanceByMatricule[matricule] != null
          ? overlays.leaveBalanceByMatricule[matricule]
          : imported?.leaveBalance ?? null;
      const costFc = imported?.costFc ?? row.costFc ?? null;
      const costUsd =
        costFc != null && fx != null && fx > 0
          ? Math.round((costFc / fx) * 100) / 100
          : null;
      return {
        matricule,
        nom: imported?.nom || nameByMatricule.get(matricule) || matricule,
        department: row.department,
        hours: Math.round(row.hours * 100) / 100,
        costFc,
        costUsd,
        leaveBalance: leave,
      };
    })
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 50);

  const postes = await getPostesBundle();
  const vacantPostes = (postes.vacants || []).map((v) => ({
    id: v.id,
    title: v.title,
    department: v.department,
    location: v.location,
    grade: v.grade,
    headcount: v.headcount,
    notes: v.notes,
  }));

  const docRates = actives.map((e) => calcDocumentCompletion(e).pct);
  const docsCompliancePct =
    docRates.length > 0
      ? Math.round((docRates.reduce((a, b) => a + b, 0) / docRates.length) * 10) / 10
      : null;

  const projectsData = await readProjects();
  const moduleProjects = (projectsData.projects || []).filter((p) => {
    const t = (p.typeProjet || '').trim().toLowerCase();
    return t === 'csr' || t.includes('cahier');
  });
  const csrProjects = mergeCsrProjects(moduleProjects, overlays);
  const csrSummary = buildCsrSummary(csrProjects);
  const trends = await buildCalendarYearTrends(
    year,
    month,
    actives,
    exits,
    overlays,
  );

  return {
    headcount,
    prevHeadcount,
    hires,
    prevHires,
    hiresList,
    periodHireList,
    presentList,
    joinersList,
    leaversList,
    exits: exitsCount,
    prevExits,
    turnoverPct,
    prevTurnoverPct,
    attritionPct,
    prevAttritionPct,
    genderMalePct,
    genderFemalePct,
    prevGenderMalePct,
    prevGenderFemalePct,
    genderMale,
    genderFemale,
    averageAge: avg(ages),
    prevAverageAge: avg(prevAges),
    averageAgeMale: avg(agesMale),
    averageAgeFemale: avg(agesFemale),
    averageSeniorityYears: avg(seniorities),
    prevAverageSeniorityYears: avg(prevSeniorities),
    ageBands,
    seniorityBands,
    headcountBySite,
    exitsByReason,
    prevExitsByReason,
    exitsList,
    hiresByMonth,
    exitsByMonth,
    exitsByReasonYtd,
    promotionsYtd,
    promotionsThisMonth,
    overtimeHoursTotal,
    overtimeByDept,
    overtimeTopEmployees,
    employeesWithOt: hoursByMatricule.size,
    vacantPostes,
    docsCompliancePct,
    csrProjects,
    csrSummary,
    trends,
    auditProgression: [],
    auditTotal: 0,
    auditClosed: 0,
    auditClosedPct: 0,
  };
}

function buildKpiSummary(
  computed: ExcoComputedBlock,
  overlays: ExcoOverlays,
  month: number,
): ExcoMetricValue[] {
  const mk = visibleManualKpis(overlays.manualKpis);
  const leaveSnap = overlays.leaveImportsByMonth?.[String(month)];
  const otSnap = overlays.overtimeImportsByMonth?.[String(month)];
  const otImported = Boolean(otSnap && (otSnap.employees?.length || 0) > 0);
  const leaveImported = Boolean(leaveSnap && (leaveSnap.counts?.all || 0) > 0);

  const prevMonth = month > 1 ? month - 1 : null;
  const tPrev =
    prevMonth != null
      ? computed.trends.find((t) => t.month === prevMonth)
      : undefined;
  const prevFinance =
    prevMonth != null
      ? {
          ...(overlays.financeByMonth?.[String(prevMonth)] || {}),
        }
      : {};
  const prevLeaveSnap =
    prevMonth != null ? overlays.leaveImportsByMonth?.[String(prevMonth)] : undefined;
  const prevOtSnap =
    prevMonth != null ? overlays.overtimeImportsByMonth?.[String(prevMonth)] : undefined;
  const prevLeaveCost =
    excoLeaveCostUsdFromSnap(prevLeaveSnap) ??
    tPrev?.leaveCost ??
    prevFinance.leaveCost ??
    null;
  const prevLeaveBal =
    prevLeaveSnap?.allAvgDays ??
    tPrev?.leaveBalanceAvgDays ??
    prevFinance.leaveBalanceAvgDays ??
    null;
  const prevOtFx =
    prevOtSnap?.fxRateFcPerUsd ?? overlays.generationMeta?.fxRateFcPerUsd ?? null;
  const prevOtCostAuto =
    prevOtSnap &&
    (prevOtSnap.employees?.length || 0) > 0 &&
    prevOtFx != null &&
    prevOtFx > 0
      ? Math.round(
          ((prevOtSnap.employees.reduce((s, e) => s + (e.costFc || 0), 0) / prevOtFx) *
            100),
        ) / 100
      : null;
  const prevOtCost =
    prevOtCostAuto ?? tPrev?.overtimeCost ?? prevFinance.overtimeCost ?? null;
  const prevOtHours =
    tPrev?.overtimeHours ??
    (prevOtSnap?.byDept?.length
      ? Math.round(
          prevOtSnap.byDept.reduce((s, r) => s + (r.hours || 0), 0) * 100,
        ) / 100
      : null);
  const prevGender =
    computed.prevGenderMalePct != null && computed.prevGenderFemalePct != null
      ? `${computed.prevGenderMalePct}% H / ${computed.prevGenderFemalePct}% F`
      : tPrev?.genderMalePct != null && tPrev?.genderFemalePct != null
        ? `${tPrev.genderMalePct}% H / ${tPrev.genderFemalePct}% F`
        : null;

  const leaveFiles = (leaveSnap?.sourceFiles || [])
    .filter((f) => f && f !== 'template-baseline')
    .join(', ');
  const leaveFx = leaveSnap?.fxRateFcPerUsd ?? overlays.generationMeta?.fxRateFcPerUsd ?? null;
  const leaveCostAuto = excoLeaveCostUsdFromSnap(leaveSnap);
  const leaveBalAuto = leaveSnap?.allAvgDays ?? null;

  const leaveCostHint = leaveImported && leaveCostAuto != null
    ? [
        'AUTO — calculé à la génération du rapport.',
        `Fichier : ${leaveFiles || 'Leave Balances_….xlsx'}.`,
        'Feuilles : toutes (ex. leavebalances Mco + Qco).',
        'Filtre : Leave Type (colonne T) = « Annual ».',
        'Montant : somme de Value / Val (colonne AD) en FC, feuille par feuille.',
        `Conversion : pour chaque feuille (ex. Mco, Qco) : round(Σ AD ÷ taux, 2), puis somme des USD.`,
        `Taux FC/USD : ${leaveFx != null ? leaveFx.toLocaleString('fr-FR') : '—'}.`,
        `Résultat : ${leaveCostAuto.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`,
      ].join(' ')
    : 'Pas d’import Leave Balances pour ce mois — saisie manuelle possible (section KPIs manuels).';

  const leaveBalHint = leaveImported && leaveBalAuto != null
    ? [
        'AUTO — calculé à la génération.',
        `Fichier : ${leaveFiles || 'Leave Balances_….xlsx'}.`,
        'Feuilles : toutes les feuilles.',
        'Filtre : Leave Type (colonne T) = « Annual ».',
        'Mesure : moyenne de Closing Balance (colonne AC) — All Company.',
      ].join(' ')
    : 'Pas d’import Leave Balances — saisie manuelle possible.';

  const otFx = otSnap?.fxRateFcPerUsd ?? overlays.generationMeta?.fxRateFcPerUsd ?? null;
  const otFiles = (otSnap?.sourceFiles || [])
    .filter((f) => f && f !== 'template-baseline')
    .join(', ');
  const otCostAuto =
    otImported && otFx != null && otFx > 0
      ? Math.round(
          ((otSnap!.employees.reduce((s, e) => s + (e.costFc || 0), 0) / otFx) * 100),
        ) / 100
      : null;
  const otCostHint = otCostAuto != null
    ? [
        'AUTO — calculé à la génération.',
        `Fichier : ${otFiles || 'Component Posted Units_….xlsx'}.`,
        'Feuilles : toutes (ex. Mco / Qco).',
        'Filtre : composants « Heures supplémentaires ».',
        'Montant : somme Component Value (FC) ÷ taux FC/USD.',
      ].join(' ')
    : 'Pas d’import Component Posted Units — saisie manuelle possible.';

  return [
    metric('headcount', 'Headcount', computed.headcount, 'computed', {
      deltaPct: deltaPct(computed.headcount, computed.prevHeadcount),
      prevValue: computed.prevHeadcount ?? tPrev?.headcount ?? null,
      hint: 'Effectif présent au dernier jour du mois — module Employés (sans les sorties du mois).',
    }),
    metric('hires', 'Hires', computed.hires, 'computed', {
      deltaPct: deltaPct(computed.hires, computed.prevHires),
      prevValue: computed.prevHires ?? tPrev?.hires ?? null,
      hint: 'IN du mois — employés dont la date d’engagement (appointmentDate) tombe dans le mois du rapport.',
    }),
    metric('exits', 'Exits', computed.exits, 'computed', {
      deltaPct: deltaPct(computed.exits, computed.prevExits),
      prevValue: computed.prevExits ?? tPrev?.exits ?? null,
      hint: 'OUT du mois — employés sortis dont la date de fin de contrat tombe dans le mois du rapport.',
    }),
    metric('turnover', 'Turnover %', computed.turnoverPct, 'computed', {
      deltaPct: deltaPct(computed.turnoverPct, computed.prevTurnoverPct),
      prevValue: computed.prevTurnoverPct ?? tPrev?.turnoverPct ?? null,
      unit: '%',
      hint: 'Formule : (IN + OUT) ÷ 2 ÷ Headcount × 100. IN/OUT et effectif du mois courant.',
    }),
    metric('attrition', 'Attrition rate %', computed.attritionPct, 'computed', {
      deltaPct: deltaPct(computed.attritionPct, computed.prevAttritionPct),
      prevValue: computed.prevAttritionPct ?? tPrev?.attritionPct ?? null,
      unit: '%',
      hint: 'Formule : OUT ÷ Headcount × 100. OUT = sorties du mois ; Headcount = effectif fin de mois.',
    }),
    manualOrEmpty(
      'absenteeism',
      'Absenteeism %',
      mk.absenteeismPct,
      '%',
      'Saisie manuelle (KPI Summary / finance) — non calculé automatiquement.',
      prevFinance.absenteeismPct ?? null,
    ),
    leaveCostAuto != null
      ? metric('leaveCost', 'Leave COST', leaveCostAuto, 'computed', {
          unit: 'USD',
          prevValue: prevLeaveCost,
          deltaPct: deltaPct(leaveCostAuto, prevLeaveCost),
          hint: leaveCostHint,
        })
      : manualOrEmpty(
          'leaveCost',
          'Leave COST',
          mk.leaveCost,
          'USD',
          leaveCostHint,
          prevLeaveCost,
        ),
    manualOrEmpty(
      'staffCost',
      'Staff cost',
      mk.staffCost,
      'USD',
      'Saisie manuelle (KPI Summary / finance du mois).',
      tPrev?.staffCost ?? prevFinance.staffCost ?? null,
    ),
    manualOrEmpty(
      'volumePerEmp',
      'Volume / emp',
      mk.volumePerEmp,
      undefined,
      'Saisie manuelle (KPI Summary / finance du mois).',
      tPrev?.volumePerEmp ?? prevFinance.volumePerEmp ?? null,
    ),
    leaveBalAuto != null
      ? metric('leaveBalance', 'Leave Balance (avg days)', leaveBalAuto, 'computed', {
          unit: 'jours',
          prevValue: prevLeaveBal,
          deltaPct: deltaPct(leaveBalAuto, prevLeaveBal),
          hint: leaveBalHint,
        })
      : manualOrEmpty(
          'leaveBalance',
          'Leave Balance (avg days)',
          mk.leaveBalanceAvgDays,
          'jours',
          leaveBalHint,
          prevLeaveBal,
        ),
    metric('seniority', 'Length of Service (years)', computed.averageSeniorityYears, 'computed', {
      prevValue: computed.prevAverageSeniorityYears,
      deltaPct: deltaPct(computed.averageSeniorityYears, computed.prevAverageSeniorityYears),
      hint: 'Moyenne d’ancienneté des employés présents — calculée depuis la date d’engagement (module Employés).',
    }),
    manualOrEmpty(
      'onboardingSurvey',
      'Onboarding Survey',
      mk.onboardingSurvey,
      '%',
      'Saisie manuelle — résultat d’enquête onboarding.',
      prevFinance.onboardingSurvey ?? null,
    ),
    manualOrEmpty(
      'competencyGap',
      'Competencies Gap Coverage',
      mk.competencyGapCoverage,
      '%',
      'Saisie manuelle — couverture des écarts de compétences.',
      prevFinance.competencyGapCoverage ?? null,
    ),
    manualOrEmpty(
      'revenuePerEmp',
      'Revenue / emp',
      mk.revenuePerEmp,
      'USD',
      'Saisie manuelle (KPI Summary / finance du mois).',
      tPrev?.revenuePerEmp ?? prevFinance.revenuePerEmp ?? null,
    ),
    metric('overtimeHours', 'Overtime hours', computed.overtimeHoursTotal, 'computed', {
      unit: 'hrs',
      prevValue: prevOtHours,
      deltaPct: deltaPct(computed.overtimeHoursTotal, prevOtHours),
      hint: otImported
        ? `AUTO — Fichier : ${otFiles || 'Component Posted Units_….xlsx'} · feuilles Mco/Qco · cumul Units des composants « Heures supplémentaires ».`
        : 'Heures OT du mois — import Component Posted Units, sinon timesheets OT de l’app.',
    }),
    otCostAuto != null
      ? metric('overtimeCost', 'Overtime cost', otCostAuto, 'computed', {
          unit: 'USD',
          prevValue: prevOtCost,
          deltaPct: deltaPct(otCostAuto, prevOtCost),
          hint: otCostHint,
        })
      : manualOrEmpty(
          'overtimeCost',
          'Overtime cost',
          mk.overtimeCost,
          'USD',
          otCostHint,
          prevOtCost,
        ),
    manualOrEmpty(
      'trainingCost',
      'Training Cost',
      mk.trainingCost,
      'USD',
      'Saisie manuelle — coût formation du mois.',
      prevFinance.trainingCost ?? null,
    ),
    manualOrEmpty(
      'climateSurvey',
      'Employee Engagement',
      mk.climateSurvey,
      undefined,
      'Saisie manuelle — score engagement / climate survey.',
      prevFinance.climateSurvey ?? null,
    ),
    metric(
      'genderRatio',
      'Gender Ratio',
      computed.genderMalePct != null && computed.genderFemalePct != null
        ? `${computed.genderMalePct}% H / ${computed.genderFemalePct}% F`
        : null,
      'computed',
      {
        prevValue: prevGender,
        hint: 'Répartition Hommes/Femmes parmi les employés présents fin de mois (champ genre, module Employés).',
      },
    ),
    metric('averageAge', 'Average Age', computed.averageAge, 'computed', {
      unit: 'ans',
      prevValue: computed.prevAverageAge ?? tPrev?.averageAge ?? null,
      deltaPct: deltaPct(computed.averageAge, computed.prevAverageAge ?? tPrev?.averageAge ?? null),
      hint: 'Âge moyen des employés présents — calculé à partir de la date de naissance / âge (module Employés).',
    }),
    manualOrEmpty(
      'trainingHours',
      'Training Hours',
      mk.trainingHours,
      'hrs',
      'Saisie manuelle — heures de formation du mois.',
      prevFinance.trainingHours ?? null,
    ),
    manualOrEmpty(
      'succession',
      'Succession Coverage',
      mk.successionCoverage,
      '%',
      'Saisie manuelle — couverture succession.',
      prevFinance.successionCoverage ?? null,
    ),
    metric('docsCompliance', 'Docs compliance', computed.docsCompliancePct, 'computed', {
      unit: '%',
      hint: 'Moyenne du % de complétude documentaire des employés actifs (module Documents / Employés).',
    }),
  ];
}

function listMissing(payload: {
  kpiSummary: ExcoMetricValue[];
  overlays: ExcoOverlays;
  computed: ExcoComputedBlock;
}): string[] {
  const missing: string[] = [];
  for (const kpi of payload.kpiSummary) {
    if (kpi.source === 'empty') missing.push(kpi.label);
  }
  const n = payload.overlays.narrative;
  if (!n.highlights?.trim()) missing.push('Highlights');
  if (!n.lowlights?.trim()) missing.push('Lowlights');
  if (!n.focus?.trim()) missing.push('Focus');
  if (!payload.overlays.recruitment.length) missing.push('Recrutement (lignes)');
  if (!payload.overlays.auditFindings.length) missing.push('Audit interne (findings)');
  if (!payload.computed.csrProjects.length) missing.push('Projets CSR');
  if (!payload.overlays.trainingTopics.length) missing.push('Formations couvertes');
  return missing;
}

export async function buildExcoReport(
  year: number,
  month: number,
): Promise<ExcoReportPayload> {
  const { overlays, updatedAt, updatedBy } = await getExcoOverlays(year, month);
  const yearOtImports = await getExcoYearOvertimeImports(year);
  const yearLeaveImports = await getExcoYearLeaveImports(year);
  const auditActions = await listAuditHrActions();
  const asOf = asOfEndOfMonth(year, month);
  const mergedOverlays: ExcoOverlays = {
    ...overlays,
    overtimeImportsByMonth: mergeExcoOtImportsForYear(year, month, {
      ...yearOtImports,
      ...(overlays.overtimeImportsByMonth || {}),
    }),
    leaveImportsByMonth: mergeExcoLeaveImportsForYear(year, month, {
      ...yearLeaveImports,
      ...(overlays.leaveImportsByMonth || {}),
    }),
    auditFindings:
      overlays.workbookSnapshot && (overlays.auditFindings || []).length > 0
        ? overlays.auditFindings
        : mergeAuditFindings(auditActions, overlays, asOf),
  };
  const computedRaw = await computeBlock(year, month, mergedOverlays);
  const computed = mergedOverlays.workbookSnapshot
    ? applyWorkbookSnapshotToComputed(computedRaw, mergedOverlays.workbookSnapshot)
    : computedRaw;
  const asOfIso = `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`;
  const auditDash = buildAuditHrDashboard(auditActions, asOfIso);
  computed.auditProgression = auditDash.progression;
  computed.auditTotal = auditDash.total;
  computed.auditClosed = auditDash.closed;
  computed.auditClosedPct = auditDash.closedPct;
  const kpiSummary = buildKpiSummary(computed, mergedOverlays, month);
  const prev = prevPeriod(year, month);
  const payload: ExcoReportPayload = {
    year,
    month,
    periodLabel: formatExcoPeriodLabel(year, month),
    prevPeriodLabel: formatExcoPeriodLabel(prev.year, prev.month),
    computed,
    overlays: mergedOverlays,
    kpiSummary,
    updatedAt,
    updatedBy,
    missingFields: [],
  };
  payload.missingFields = listMissing(payload);
  return payload;
}
