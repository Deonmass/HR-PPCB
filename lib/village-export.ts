import { humanizeErrorMessage } from '@/lib/api-client-error';

async function errorMessageFromResponse(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const text = (await response.text()).trim();
    if (text) {
      try {
        const payload = JSON.parse(text) as { error?: string };
        if (payload.error) {
          return humanizeErrorMessage(payload.error, fallback);
        }
      } catch {
        // corps non-JSON (HTML / texte serveur)
      }
      if (/Internal Server Error/i.test(text)) {
        return 'Erreur serveur pendant l’export. Réessayez dans un moment.';
      }
    }
  } catch {
    // ignore
  }
  if (response.status === 403) return 'Vous n’avez pas la permission d’exporter.';
  if (response.status === 401) return 'Votre session a expiré. Reconnectez-vous.';
  if (response.status >= 500) {
    return 'Erreur serveur pendant l’export. Réessayez dans un moment.';
  }
  return fallback;
}

async function downloadBlobFromResponse(
  response: Response,
  fallbackName: string,
): Promise<void> {
  if (!response.ok) {
    throw new Error(
      await errorMessageFromResponse(response, 'Export impossible. Réessayez.'),
    );
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

export async function downloadVillageEligibiliteExport(
  options?: { signal?: AbortSignal },
): Promise<void> {
  const response = await fetch('/api/village/eligibilite/export', {
    signal: options?.signal,
  });
  await downloadBlobFromResponse(response, 'VILLAGE_ELIGIBILITE_KIMPESE.xlsx');
}

export async function fetchVillagePreviewHtml(presentation?: unknown): Promise<string> {
  const response = await fetch('/api/village/preview', {
    method: presentation ? 'POST' : 'GET',
    headers: presentation ? { 'Content-Type': 'application/json' } : undefined,
    body: presentation ? JSON.stringify(presentation) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      await errorMessageFromResponse(response, 'Aperçu impossible. Réessayez.'),
    );
  }
  const type = response.headers.get('content-type') || '';
  if (!type.includes('text/html')) {
    throw new Error('Aperçu indisponible');
  }
  return response.text();
}
