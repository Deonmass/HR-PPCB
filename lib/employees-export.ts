export async function downloadEmployeesHrExport(): Promise<void> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 25_000);

  let response: Response;
  try {
    response = await fetch('/api/employees/export', { signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Export trop long (timeout). Réessayez.');
    }
    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }

  if (!response.ok) {
    let message = 'Export impossible';
    try {
      const payload = await response.json();
      if (payload.error) message = payload.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  const filename = filenameMatch?.[1] ?? 'EMPLOYEES_HR.xlsx';

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
