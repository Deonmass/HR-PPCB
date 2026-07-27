import 'server-only';

import path from 'path';
import { buildFormattedDependantsWorkbookBuffer } from './dependants-export-xlsx.server';

const EXCEL_PATH = process.env.EMPLOYEE_XLSX || path.join(process.cwd(), 'Excel', 'EMPLOYEE.xlsx');

export function buildDependantsExportFilename(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `DEPENDANTS_RESUME_${stamp}.xlsx`;
}

export async function buildDependantsExportBuffer(): Promise<Buffer> {
  return buildFormattedDependantsWorkbookBuffer(EXCEL_PATH);
}
