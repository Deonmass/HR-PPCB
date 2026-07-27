import 'server-only';

import path from 'path';
import { buildExportDateStamp, buildExportSuffix, type EmployeeFilters } from './employee-filters';
import { buildFormattedCheckDocumentsWorkbookBuffer } from './check-documents-export-xlsx.server';

const EXCEL_PATH = process.env.EMPLOYEE_XLSX || path.join(process.cwd(), 'Excel', 'EMPLOYEE.xlsx');

export function buildCheckDocumentsExportFilename(filters: EmployeeFilters = { search: '', dept: '' }): string {
  const suffix = buildExportSuffix(filters);
  return `CHECK_DOCUMENTS_BASE${suffix}_${buildExportDateStamp()}.xlsx`;
}

export async function buildCheckDocumentsExportBuffer(
  filters: EmployeeFilters = { search: '', dept: '' },
): Promise<Buffer> {
  return buildFormattedCheckDocumentsWorkbookBuffer(EXCEL_PATH, filters);
}
