const CHUNK_ERROR_PATTERNS = [
  'Cannot find module',
  'Loading chunk',
  'ChunkLoadError',
  'Failed to fetch dynamically imported module',
  'Failed to load chunk',
  '__webpack_modules__',
  'webpack-runtime',
  'originalFactory',
  "reading 'call'",
  'Cannot read properties of undefined',
  'module factory is not available',
];

export function isChunkLoadError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return CHUNK_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return `${error.message}\n${error.stack ?? ''}`;
  if (typeof error === 'string') return error;
  return String(error ?? '');
}

export function reloadAfterChunkError(): void {
  if (typeof window === 'undefined') return;

  const path = window.location.pathname;
  const countKey = `chunk-reload-count:${path}`;
  const count = Number(sessionStorage.getItem(countKey) ?? '0');

  if (count >= 2) {
    sessionStorage.removeItem(countKey);
    sessionStorage.removeItem('chunk-reload-path');
    window.location.reload();
    return;
  }

  sessionStorage.setItem(countKey, String(count + 1));
  sessionStorage.setItem('chunk-reload-path', path);

  const separator = window.location.search ? '&' : '?';
  window.location.replace(`${path}${window.location.search}${separator}_cb=${Date.now()}`);
}

export function clearChunkReloadState(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  sessionStorage.removeItem('chunk-reload-path');
  sessionStorage.removeItem(`chunk-reload-count:${path}`);
}
