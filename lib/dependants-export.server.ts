import 'server-only';

import { buildFormattedDependantsWorkbookBuffer } from './dependants-export-xlsx.server';
import { getEmployeeWorkbookPath } from './excel-data-paths';

const EXCEL_PATH = getEmployeeWorkbookPath();

export function buildDependantsExportFilename(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `DEPENDANTS_RESUME_${stamp}.xlsx`;
}

export async function buildDependantsExportBuffer(): Promise<Buffer> {
  return buildFormattedDependantsWorkbookBuffer(EXCEL_PATH);
}
