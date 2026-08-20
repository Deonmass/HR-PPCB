import 'server-only';

import {
  buildDependantsExportBufferFromJson,
  buildFormattedDependantsWorkbookBuffer,
} from './dependants-export-xlsx.server';
import { employeeWorkbookExists, ensureEmployeeWorkbookPath } from './excel-data-paths';

const EMPTY_LOCALISATION_EXPORT = '__empty__';

export function buildDependantsExportFilename(localisation = ''): string {
  const d = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const loc = localisation.trim();
  if (!loc) return `DEPENDANTS_RESUME_${stamp}.xlsx`;
  const slug = loc === EMPTY_LOCALISATION_EXPORT
    ? 'sans-localisation'
    : loc.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
  return `DEPENDANTS_RESUME_${slug || 'filtre'}_${stamp}.xlsx`;
}

export async function buildDependantsExportBuffer(options?: {
  localisation?: string;
}): Promise<Buffer> {
  const localisation = options?.localisation?.trim() ?? '';
  // Source de vérité = JSON. Le workbook live n’est qu’un fallback legacy.
  if (localisation || !employeeWorkbookExists()) {
    return buildDependantsExportBufferFromJson({ localisation });
  }

  try {
    const livePath = await ensureEmployeeWorkbookPath();
    return buildFormattedDependantsWorkbookBuffer(livePath);
  } catch {
    return buildDependantsExportBufferFromJson({ localisation });
  }
}
