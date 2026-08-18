async function downloadBlobFromResponse(response: Response, fallbackName: string): Promise<void> {
  if (!response.ok) {
    let message = 'Export impossible';
    try {
      const payload = await response.json() as { error?: string };
      if (payload.error) message = payload.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filenameMatch = disposition.match(/filename="([^"]+)"/i);
  const filename = filenameMatch?.[1] ?? fallbackName;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadVillageExport(): Promise<void> {
  const response = await fetch('/api/village/export');
  await downloadBlobFromResponse(response, 'VILLAGE_KIMPESE.xlsx');
}

export async function downloadVillagePptx(presentation?: unknown): Promise<void> {
  const response = await fetch('/api/village/export-pptx', {
    method: presentation ? 'POST' : 'GET',
    headers: presentation ? { 'Content-Type': 'application/json' } : undefined,
    body: presentation ? JSON.stringify(presentation) : undefined,
  });
  await downloadBlobFromResponse(response, 'VILLAGE_MAISONS.pptx');
}
