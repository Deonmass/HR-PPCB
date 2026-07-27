import type { EmployeeFilters } from './employee-filters';

function buildExportQuery(filters: EmployeeFilters): string {
  const params = new URLSearchParams();
  if (filters.dept) params.set('dept', filters.dept);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  const query = params.toString();
  return query ? `?${query}` : '';
}

async function downloadFromApi(url: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    let message = 'Export impossible';
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore JSON parse errors
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  const filename = filenameMatch?.[1] ?? fallbackFilename;

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

export async function downloadCheckDocumentsExport(filters: EmployeeFilters = { search: '', dept: '' }): Promise<void> {
  await downloadFromApi(
    `/api/check-documents/export${buildExportQuery(filters)}`,
    'CHECK_DOCUMENTS_BASE.xlsx',
  );
}

export async function downloadCheckDocumentsDashboardExport(
  filters: EmployeeFilters = { search: '', dept: '' },
): Promise<void> {
  await downloadFromApi(
    `/api/check-documents/dashboard-export${buildExportQuery(filters)}`,
    'DASHBOARD.xlsx',
  );
}
