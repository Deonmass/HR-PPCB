async function downloadFromApi(url: string, fallbackFilename: string): Promise<void> {
  const response = await fetch(url);

  if (!response.ok) {
    let message = 'Export impossible';
    try {
      const payload = (await response.json()) as { error?: string };
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

export async function downloadTravelHistoryExport(): Promise<void> {
  await downloadFromApi('/api/travel/history/export', 'HISTORIQUE_MISSION.xlsx');
}
