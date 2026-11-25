import 'server-only';

import { capitalHrEffectifEmployees, findCapitalHrContractant } from './capital-hr-effectif';
import { listClassificationPostes } from './classification-store';
import { listContractants } from './contractants-store';
import type { ContractantEmployee } from './contractants-types';
import { endOfYearMonth } from './employee-columns';
import { employeesPresentOnAsOf } from './employees-hr-dashboard';
import { readEmployeesBundle } from './employees-json-store';
import { getExcoOverlays } from './exco-store';
import { buildStaffCostSheet, staffCostInputFromPartial } from './exco-staff-cost-model';
import { normalizeDepartmentName } from './exco-department-map';
import { readHrcoExcoMembers } from './hrco-exco-members.server';
import { readHrcoManualCells } from './hrco-note-cells.server';
import {
  applyHrcoManualCells,
  buildHrcoNote,
  HRCO_MONTHS,
  hrcoPeriodLabel,
  type HrcoNote,
  type HrcoOtLine,
  type HrcoOvertime,
  type HrcoPeriod,
  type HrcoStaffMonth,
  type HrcoSubcontractor,
} from './hrco-note';
import { listWeeklyOvertimeWeeks } from './overtimes-json-store';
import type { Employee } from './types';
import type { ExcoStaffCostYtdInput } from './exco-types';

function hoursOf(entry: { ot13?: number; ot16?: number; ot2?: number }): number {
  return Number(entry.ot13 || 0) + Number(entry.ot16 || 0) + Number(entry.ot2 || 0);
}

async function loadOvertime(period: HrcoPeriod, employees: Employee[]): Promise<HrcoOvertime> {
  const totals = { engineering: 0, production: 0, other: 0 };
  const byPerson = new Map<string, HrcoOtLine>();
  const byMatricule = new Map(employees.map((employee) => [employee.matricule, employee]));
  for (let month = period.fromMonth; month <= period.toMonth; month += 1) {
    let weeks: Awaited<ReturnType<typeof listWeeklyOvertimeWeeks>> = [];
    try {
      weeks = await listWeeklyOvertimeWeeks(period.year, month);
    } catch {
      weeks = [];
    }
    for (const week of weeks) {
      const department = normalizeDepartmentName(week.department || '');
      const bucket: HrcoOtLine['bucket'] = department === 'Engineering'
        ? 'engineering'
        : department === 'Production'
          ? 'production'
          : 'other';
      for (const entry of Object.values(week.entries || {})) {
        const hours = hoursOf(entry);
        if (!hours) continue;
        totals[bucket] += hours;
        const key = `${entry.matricule}::${bucket}`;
        const current = byPerson.get(key);
        if (current) {
          current.hours += hours;
          continue;
        }
        const employee = byMatricule.get(entry.matricule);
        byPerson.set(key, {
          matricule: entry.matricule,
          bucket,
          hours,
          nom: employee?.nom || '',
          fonction: employee?.jobTitle || '',
          departement: employee ? (normalizeDepartmentName(employee.departement) || employee.departement) : department,
          localisation: employee?.localisation || '',
          grade: employee?.grade || '',
        });
      }
    }
  }
  return { ...totals, periodLabel: hrcoPeriodLabel(period), lines: [...byPerson.values()] };
}

function toNoteEmployee(employee: Employee) {
  return {
    matricule: employee.matricule,
    nom: employee.nom,
    departement: employee.departement,
    grade: employee.grade,
    jobTitle: employee.jobTitle,
    localisation: employee.localisation,
    service: employee.service,
    typeContrat: employee.typeContrat,
    nationality: employee.nationality,
    statut: 'Active',
  };
}

async function loadStaffCost(period: HrcoPeriod): Promise<HrcoStaffMonth[]> {
  const october = await getExcoOverlays(period.year, 10);
  const selected = await getExcoOverlays(period.year, period.toMonth);
  const octoberMap = october.overlays.staffCostYtdByMonth || {};
  const selectedMap = selected.overlays.staffCostYtdByMonth || {};
  const map = octoberMap['10']?.salariesActualYtd != null ? octoberMap : selectedMap;
  const ytdByCalendarMonth: Record<number, ExcoStaffCostYtdInput> = {};
  for (const [key, value] of Object.entries(map)) {
    const month = Number(key);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !value) continue;
    ytdByCalendarMonth[month] = staffCostInputFromPartial(value);
  }
  if (!Object.keys(ytdByCalendarMonth).length) return [];
  return buildStaffCostSheet({ ytdByCalendarMonth })
    .filter((month) => month.calendarMonth >= period.fromMonth && month.calendarMonth <= period.toMonth)
    .filter((month) => ytdByCalendarMonth[month.calendarMonth]?.salariesActualYtd != null)
    .filter((month) => month.staffCostMonth.value == null || month.staffCostMonth.value >= 0)
    .sort((a, b) => a.calendarMonth - b.calendarMonth)
    .map((month) => ({
      month: month.calendarMonth,
      label: HRCO_MONTHS[month.calendarMonth - 1].replace(/^./, (letter) => letter.toUpperCase()),
      headcount: month.actualHeadcount.value,
      staffCost: month.staffCostMonth.value,
      staffCumul: month.staffCumul.value,
      volume: month.volumeMonth.value,
      volumeCumul: month.volumeCumul.value,
      revenue: month.revenueMonth.value,
      revenueCumul: month.revenueCumul.value,
      tonPerEmp: month.tonPerEmp.value,
      tonPerEmpYtd: month.tonPerEmpYtd.value,
      revenuePerEmp: month.revenuePerEmp.value,
      revenuePerEmpYtd: month.revenuePerEmpYtd.value,
      budgetStaffCost: month.budgetStaffCostMonth.value,
      budgetStaffCumul: month.budgetStaffCumul.value,
      budgetVolume: month.budgetVolumeMonth.value,
      budgetVolumeCumul: month.budgetVolumeCumul.value,
      budgetRevenue: month.budgetRevenueMonth.value,
      budgetRevenueCumul: month.budgetRevenueCumul.value,
      budgetHeadcount: month.budgetHeadcount.value,
    }));
}

function subMatricule(employee: ContractantEmployee): string {
  const ppc = String(employee.matriculePpc || '').trim();
  return ppc || `chr:${employee.id}`;
}

async function loadSubcontractors(): Promise<HrcoSubcontractor[]> {
  const contractants = await listContractants();
  const capital = findCapitalHrContractant(contractants);
  return capitalHrEffectifEmployees(capital).map((employee) => ({
    matricule: subMatricule(employee),
    nom: employee.nom,
    fonction: employee.fonction,
    departement: employee.departement,
    localisation: employee.lieuAffectation,
    prestataire: capital?.denomination || 'Capital HR',
  }));
}

export async function loadHrcoNote(period: HrcoPeriod): Promise<HrcoNote> {
  const asOf = endOfYearMonth(period.year, period.toMonth);
  const { employees, exits } = await readEmployeesBundle();
  const present = employeesPresentOnAsOf(employees, exits, asOf);
  const [overtime, staffCost, subcontractors, excoMatricules, classification, manualCells] = await Promise.all([
    loadOvertime(period, [...employees, ...exits]),
    loadStaffCost(period),
    loadSubcontractors(),
    readHrcoExcoMembers(),
    listClassificationPostes(),
    readHrcoManualCells(),
  ]);
  const note = buildHrcoNote({
    employees: present.map(toNoteEmployee),
    overtime,
    asOf,
    periodLabel: hrcoPeriodLabel(period),
    period,
    staffCost,
    subcontractors,
    excoMatricules,
    classification,
  });
  return applyHrcoManualCells(note, manualCells);
}
