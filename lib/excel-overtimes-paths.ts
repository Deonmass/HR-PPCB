import 'server-only';

import fs from 'fs';
import path from 'path';
import { getDataBackend, resolveWorkbookPath } from './runtime-mode';

const EXCEL_DIR = path.join(process.cwd(), 'Excel');
const OVERTIMES_DIR = path.join(EXCEL_DIR, 'overtimes');

export const OVERTIMES_FILES = {
  data: 'OVERTIMES_DATA.xlsx',
  exportLegacy: 'OVERTIMES.xlsx',
  timesheetTemplate: 'Timesheet template.xlsx',
} as const;

export function getOvertimesDirectory(): string {
  if (process.env.OVERTIMES_DIR?.trim()) {
    return path.resolve(process.env.OVERTIMES_DIR.trim());
  }
  if (getDataBackend() === 'tmp') {
    return path.dirname(resolveWorkbookPath(`overtimes/${OVERTIMES_FILES.data}`));
  }
  return OVERTIMES_DIR;
}

/**
 * Résout un fichier overtime :
 * 1. override env
 * 2. Excel/overtimes/<file>
 * 3. fallbacks legacy (Excel/, Excel/export-templates/)
 */
export function resolveOvertimesFile(
  fileName: string,
  envOverride?: string,
  legacyFallbacks: string[] = [],
): string {
  if (envOverride?.trim()) return path.resolve(envOverride.trim());

  const preferred = path.join(getOvertimesDirectory(), fileName);
  if (fs.existsSync(preferred)) return preferred;

  for (const legacy of legacyFallbacks) {
    if (fs.existsSync(legacy)) return legacy;
  }

  return preferred;
}

/** Workbook mutable (saisies OT) — copie /tmp sur Vercel. */
export const OVERTIMES_DATA_XLSX_PATH = process.env.OVERTIMES_DATA_XLSX?.trim()
  ? path.resolve(process.env.OVERTIMES_DATA_XLSX.trim())
  : resolveWorkbookPath(`overtimes/${OVERTIMES_FILES.data}`);

export const OVERTIMES_EXPORT_XLSX_PATH = resolveOvertimesFile(
  OVERTIMES_FILES.exportLegacy,
  process.env.OVERTIMES_EXPORT_XLSX,
  [path.join(EXCEL_DIR, OVERTIMES_FILES.exportLegacy)],
);

export const OVERTIMES_TIMESHEET_TEMPLATE_PATH = resolveOvertimesFile(
  OVERTIMES_FILES.timesheetTemplate,
  process.env.TIMESHEET_TEMPLATE_XLSX,
  [
    path.join(EXCEL_DIR, 'export-templates', OVERTIMES_FILES.timesheetTemplate),
    path.join(EXCEL_DIR, OVERTIMES_FILES.timesheetTemplate),
  ],
);
