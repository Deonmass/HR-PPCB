import 'server-only';

import fs from 'fs';
import path from 'path';
import { canPersistProjectFiles, getWritableDataRoot, resolveWorkbookPath } from './runtime-mode';

const EMPLOYEE_WORKBOOK_REPO_PATH = 'Excel/EMPLOYEE.xlsx';

/** Live HR workbook (employees, dependants, village sheets). */
export function getEmployeeWorkbookPath(): string {
  return resolveWorkbookPath('EMPLOYEE.xlsx', process.env.EMPLOYEE_XLSX);
}

/**
 * Résout EMPLOYEE.xlsx et tente de le récupérer (seed local + hydrate GitHub)
 * avant d’échouer. Préférer cette API dans les exports / écritures Excel.
 */
export async function ensureEmployeeWorkbookPath(): Promise<string> {
  const resolved = getEmployeeWorkbookPath();
  if (fs.existsSync(resolved)) return resolved;

  try {
    const { hydrateDurableFile } = await import('./durable-fs');
    await hydrateDurableFile(EMPLOYEE_WORKBOOK_REPO_PATH, resolved);
  } catch (err) {
    console.warn('[excel-data-paths] hydrate EMPLOYEE.xlsx failed', err);
  }

  if (fs.existsSync(resolved)) return resolved;

  throw new Error(
    `EMPLOYEE.xlsx introuvable (${resolved}). `
      + 'Placez le fichier dans Excel/, définissez EMPLOYEE_XLSX, '
      + 'ou configurez HR_GITHUB_TOKEN pour le récupérer depuis le dépôt GitHub.',
  );
}

/** True si le workbook live est disponible (après seed éventuel). */
export function employeeWorkbookExists(): boolean {
  return fs.existsSync(getEmployeeWorkbookPath());
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
