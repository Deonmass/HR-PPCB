import 'server-only';

import fs from 'fs';
import path from 'path';

const EXCEL_DIR = path.join(process.cwd(), 'Excel');
const OVERTIMES_TEMPLATES_DIR = path.join(EXCEL_DIR, 'templates', 'overtimes');

export const OVERTIMES_FILES = {
  data: 'OVERTIMES_DATA.xlsx',
  exportLegacy: 'OVERTIMES.xlsx',
  timesheetTemplate: 'Timesheet template.xlsx',
} as const;

export function getOvertimesDirectory(): string {
  if (process.env.OVERTIMES_DIR?.trim()) {
    return path.resolve(process.env.OVERTIMES_DIR.trim());
  }
  return OVERTIMES_TEMPLATES_DIR;
}

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

/** Optional seed only — live OVERTIMES_DATA.xlsx deleted. */
export const OVERTIMES_DATA_XLSX_PATH = process.env.OVERTIMES_DATA_XLSX?.trim()
  ? path.resolve(process.env.OVERTIMES_DATA_XLSX.trim())
  : path.join(EXCEL_DIR, 'overtimes', OVERTIMES_FILES.data);

export const OVERTIMES_EXPORT_XLSX_PATH = resolveOvertimesFile(
  OVERTIMES_FILES.exportLegacy,
  process.env.OVERTIMES_EXPORT_XLSX,
);

export const OVERTIMES_TIMESHEET_TEMPLATE_PATH = resolveOvertimesFile(
  OVERTIMES_FILES.timesheetTemplate,
  process.env.TIMESHEET_TEMPLATE_XLSX,
);
