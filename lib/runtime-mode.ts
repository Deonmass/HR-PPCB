import 'server-only';

import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Dual-mode runtime:
 * - local/dev : fichiers Excel/data sous process.cwd() (tests)
 * - Vercel    : bundle en lecture seule ; copies mutables sous os.tmpdir()
 *
 * Override:
 * - DATA_BACKEND=file|tmp  (force le mode)
 * - DATA_DIR=/custom/path  (répertoire writable des copies)
 */

export type DataBackend = 'file' | 'tmp';

export function isVercelRuntime(): boolean {
  return Boolean(process.env.VERCEL) || process.env.VERCEL_ENV === 'production'
    || process.env.VERCEL_ENV === 'preview';
}

export function getDataBackend(): DataBackend {
  const forced = (process.env.DATA_BACKEND || '').trim().toLowerCase();
  if (forced === 'file' || forced === 'tmp') return forced;
  return isVercelRuntime() ? 'tmp' : 'file';
}

/** True when the app may write under process.cwd() (local tests). */
export function canPersistProjectFiles(): boolean {
  return getDataBackend() === 'file';
}

/** Writable root for auth/sessions/json and Excel working copies. */
export function getWritableDataRoot(): string {
  if (process.env.DATA_DIR?.trim()) {
    return path.resolve(process.env.DATA_DIR.trim());
  }
  if (getDataBackend() === 'tmp') {
    return path.join(os.tmpdir(), 'hr-rh-app');
  }
  return path.join(process.cwd(), 'data');
}

export function getWritableAuthDir(): string {
  if (process.env.AUTH_DATA_DIR?.trim()) {
    return path.resolve(process.env.AUTH_DATA_DIR.trim());
  }
  if (getDataBackend() === 'tmp') {
    return path.join(getWritableDataRoot(), 'auth');
  }
  return path.join(process.cwd(), 'data', 'auth');
}

export function getWritableExcelRoot(): string {
  if (getDataBackend() === 'tmp') {
    return path.join(getWritableDataRoot(), 'Excel');
  }
  return path.join(process.cwd(), 'Excel');
}

/**
 * Resolve a workbook path for read/write.
 * On Vercel (tmp mode), seed a writable copy from the bundled Excel file on first use.
 */
export function resolveWorkbookPath(
  relativeUnderExcel: string,
  envOverride?: string | undefined,
): string {
  if (envOverride?.trim()) return path.resolve(envOverride.trim());

  const bundled = path.join(process.cwd(), 'Excel', relativeUnderExcel);
  if (getDataBackend() === 'file') return bundled;

  const writable = path.join(getWritableExcelRoot(), relativeUnderExcel);
  ensureSeededCopy(bundled, writable);
  return writable;
}

function ensureSeededCopy(source: string, dest: string): void {
  try {
    if (fs.existsSync(dest)) return;
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, dest);
      return;
    }
    console.warn('[runtime-mode] workbook source missing, cannot seed', source, '->', dest);
  } catch (err) {
    // Leave dest missing; callers will surface a clear Excel/path error.
    console.warn('[runtime-mode] seed copy failed', source, '->', dest, err);
  }
}

/** Prefer a strong secret in production; never silently forge with a public default on Vercel. */
export function resolveSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET
    || process.env.AUTH_SECRET
    || process.env.NEXTAUTH_SECRET
    || '';
  if (secret.trim()) return secret.trim();
  if (isVercelRuntime()) {
    throw new Error(
      'AUTH_SESSION_SECRET manquant sur Vercel. Ajoutez-le dans Project Settings → Environment Variables.',
    );
  }
  return 'hr-rh-dev-insecure-secret';
}

export function useStatelessSessions(): boolean {
  if (process.env.AUTH_STATELESS === '1') return true;
  if (process.env.AUTH_STATELESS === '0') return false;
  return isVercelRuntime();
}
