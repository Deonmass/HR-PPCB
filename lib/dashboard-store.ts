import 'server-only';

import { buildDashboardFromEmployees } from './documents';
import { readEmployees } from './employees-store';
import type { DashboardData } from './types';

/** Dashboard Check documents — recalculé à chaque lecture depuis EMPLOYEE.xlsx. */
export async function readDashboard(): Promise<DashboardData> {
  const employees = await readEmployees();
  return buildDashboardFromEmployees(employees);
}
