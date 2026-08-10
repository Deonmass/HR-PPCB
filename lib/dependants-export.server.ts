import 'server-only';

import {
  buildDependantsExportBufferFromJson,
  buildFormattedDependantsWorkbookBuffer,
} from './dependants-export-xlsx.server';
import { employeeWorkbookExists, ensureEmployeeWorkbookPath } from './excel-data-paths';

export function buildDependantsExportFilename(): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `DEPENDANTS_RESUME_${stamp}.xlsx`;
}

export async function buildDependantsExportBuffer(): Promise<Buffer> {
  // Source de vérité = JSON. Le workbook live n’est qu’un fallback legacy.
  if (!employeeWorkbookExists()) {
    return buildDependantsExportBufferFromJson();
  }

  try {
    const livePath = await ensureEmployeeWorkbookPath();
    return buildFormattedDependantsWorkbookBuffer(livePath);
  } catch {
    return buildDependantsExportBufferFromJson();
  }
}
