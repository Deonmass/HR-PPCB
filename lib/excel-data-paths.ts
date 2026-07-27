import 'server-only';

import path from 'path';
import { canPersistProjectFiles, getWritableDataRoot, resolveWorkbookPath } from './runtime-mode';

/** Live HR workbook (employees, dependants, village sheets). */
export function getEmployeeWorkbookPath(): string {
  return resolveWorkbookPath('EMPLOYEE.xlsx', process.env.EMPLOYEE_XLSX);
}

/** Live projects workbook. */
export function getProjectsWorkbookPath(): string {
  return resolveWorkbookPath('PROJECTS.xlsx', process.env.PROJECTS_XLSX);
}

export function getEmployeesSnapshotPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees.json');
  }
  return path.join(getWritableDataRoot(), 'employees.json');
}

export function getProjectsSnapshotPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'projects.json');
  }
  return path.join(getWritableDataRoot(), 'projects.json');
}

/** True when reads may persist workbook repairs/backfills. */
export function shouldPersistOnRead(): boolean {
  return canPersistProjectFiles();
}
