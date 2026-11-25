import 'server-only';

import { normalizeDepartmentName } from './exco-department-map';
import { buildHrcoNote, type HrcoNote, type HrcoOtLine, type HrcoOvertime } from './hrco-note';
import { readEmployees } from './employees-json-store';
import { listWeeklyOvertimeWeeks } from './overtimes-json-store';

const MONTHS_FR = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
];

function hoursOf(entry: { ot13?: number; ot16?: number; ot2?: number }): number {
  return Number(entry.ot13 || 0) + Number(entry.ot16 || 0) + Number(entry.ot2 || 0);
}

async function loadOvertime(
  year: number,
  employees: Awaited<ReturnType<typeof readEmployees>>,
): Promise<HrcoOvertime> {
  const totals = { engineering: 0, production: 0, other: 0 };
  const months: number[] = [];
  const byPerson = new Map<string, HrcoOtLine>();
  const byMatricule = new Map(employees.map((employee) => [employee.matricule, employee]));
  for (let month = 1; month <= 12; month += 1) {
    let weeks: Awaited<ReturnType<typeof listWeeklyOvertimeWeeks>> = [];
    try {
      weeks = await listWeeklyOvertimeWeeks(year, month);
    } catch {
      weeks = [];
    }
    let monthHours = 0;
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
        monthHours += hours;
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
    if (monthHours > 0) months.push(month);
  }
  const periodLabel = months.length
    ? `${MONTHS_FR[months[0] - 1]} à ${MONTHS_FR[months[months.length - 1] - 1]} ${year}`
    : '';
  return { ...totals, periodLabel, lines: [...byPerson.values()] };
}

export async function loadHrcoNote(asOf = new Date()): Promise<HrcoNote> {
  const employees = await readEmployees();
  const overtime = await loadOvertime(asOf.getFullYear(), employees);
  return buildHrcoNote({
    employees: employees.map((employee) => ({
      matricule: employee.matricule,
      nom: employee.nom,
      departement: employee.departement,
      grade: employee.grade,
      jobTitle: employee.jobTitle,
      localisation: employee.localisation,
      service: employee.service,
      typeContrat: employee.typeContrat,
      nationality: employee.nationality,
      statut: employee.statut,
    })),
    overtime,
    asOf,
  });
}
