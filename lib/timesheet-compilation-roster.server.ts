import 'server-only';

import { isContractantTimesheetMatricule } from './timesheet-access-server';
import { isZambaLocalisation } from './timesheet-calc';
import { getCompilationExtraMatricules } from './timesheet-compilation-extras-store';
import { filterEmployeesForTimesheetScope, type TimesheetAccessContext } from './timesheet-permissions';
import type { Employee } from './types';

type RosterContext = {
  employees: Employee[];
  access: TimesheetAccessContext;
};

function byName(a: Employee, b: Employee): number {
  return a.nom.localeCompare(b.nom, 'fr');
}

function ppcNamed(employees: Employee[]): Employee[] {
  return employees.filter(
    (employee) => employee.nom.trim() && !isContractantTimesheetMatricule(employee.matricule),
  );
}

/** Agents du périmètre timesheet, sans le filtre Zamba de la compilation. */
export function compilationCandidatePool(context: RosterContext): Employee[] {
  return ppcNamed(filterEmployeesForTimesheetScope(context.employees, context.access)).sort(byName);
}

/** Agents Zamba du département (ou de tout le périmètre), plus ceux ajoutés à la main. */
export async function compilationRoster(
  context: RosterContext,
  year: number,
  month: number,
  label: string,
  department?: string,
): Promise<Employee[]> {
  const base = ppcNamed(
    filterEmployeesForTimesheetScope(context.employees, context.access, department).filter(
      (employee) => isZambaLocalisation(employee.localisation),
    ),
  );
  const extras = await getCompilationExtraMatricules(year, month, label);
  if (!extras.length) return base.sort(byName);

  const pool = new Map(compilationCandidatePool(context).map((employee) => [employee.matricule, employee]));
  const seen = new Set(base.map((employee) => employee.matricule));
  const added: Employee[] = [];
  for (const matricule of extras) {
    if (seen.has(matricule)) continue;
    const employee = pool.get(matricule);
    if (!employee) continue;
    seen.add(matricule);
    added.push(employee);
  }
  return [...base, ...added].sort(byName);
}
