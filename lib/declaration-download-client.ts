import { readResponseError } from './http-error';

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function downloadDeclarationResponse(
  url: string,
  body: object,
  fallbackName: string,
): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readResponseError(res, 'Génération impossible'));
  const blob = await res.blob();
  const headerName = res.headers.get('X-File-Name');
  const fileName = headerName ? decodeURIComponent(headerName) : fallbackName;
  triggerDownload(blob, fileName);
}
