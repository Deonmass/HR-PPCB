export async function downloadDependantsExport(options?: { localisation?: string }): Promise<void> {
  const params = new URLSearchParams();
  const localisation = options?.localisation?.trim();
  if (localisation) params.set('localisation', localisation);
  const query = params.toString();
  const response = await fetch(`/api/dependants/export${query ? `?${query}` : ''}`);

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
  const filename = filenameMatch?.[1] ?? 'DEPENDANTS_RESUME.xlsx';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
