import 'server-only';

import { buildExportDateStamp, buildExportSuffix, type EmployeeFilters } from './employee-filters';
import { buildFormattedCheckDocumentsWorkbookBuffer } from './check-documents-export-xlsx.server';
import { getEmployeeWorkbookPath } from './excel-data-paths';

const EXCEL_PATH = getEmployeeWorkbookPath();

export function buildCheckDocumentsExportFilename(filters: EmployeeFilters = { search: '', dept: '' }): string {
  const suffix = buildExportSuffix(filters);
  return `CHECK_DOCUMENTS_BASE${suffix}_${buildExportDateStamp()}.xlsx`;
}

export async function buildCheckDocumentsExportBuffer(
  filters: EmployeeFilters = { search: '', dept: '' },
): Promise<Buffer> {
  return buildFormattedCheckDocumentsWorkbookBuffer(EXCEL_PATH, filters);
}
