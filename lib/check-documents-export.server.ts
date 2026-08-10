import 'server-only';

import { buildExportDateStamp, buildExportSuffix, type EmployeeFilters } from './employee-filters';
import { buildFormattedCheckDocumentsWorkbookBuffer } from './check-documents-export-xlsx.server';
import { employeeWorkbookExists, ensureEmployeeWorkbookPath } from './excel-data-paths';

export function buildCheckDocumentsExportFilename(filters: EmployeeFilters = { search: '', dept: '' }): string {
  const suffix = buildExportSuffix(filters);
  return `CHECK_DOCUMENTS_BASE${suffix}_${buildExportDateStamp()}.xlsx`;
}

export async function buildCheckDocumentsExportBuffer(
  filters: EmployeeFilters = { search: '', dept: '' },
): Promise<Buffer> {
  if (!employeeWorkbookExists()) {
    return buildFormattedCheckDocumentsWorkbookBuffer(null, filters);
  }

  try {
    const livePath = await ensureEmployeeWorkbookPath();
    return buildFormattedCheckDocumentsWorkbookBuffer(livePath, filters);
  } catch {
    return buildFormattedCheckDocumentsWorkbookBuffer(null, filters);
  }
}
