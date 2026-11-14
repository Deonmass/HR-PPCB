import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { hydrateDurableFile, persistDurableFile } from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

export interface AdminJsonFileInfo {
  path: string;
  bytes: number;
  mtime: string | null;
  sensitive: boolean;
}

const SENSITIVE = new Set([
  'auth/sessions.json',
  'auth/users.json',
  'auth/permissions.json',
]);

function bundledDataRoot(): string {
  return path.join(process.cwd(), 'data');
}

function writableDataRoot(): string {
  return getWritableDataRoot();
}

export function assertSafeJsonRelPath(raw: string): string {
  const normalized = String(raw || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();
  if (!normalized || normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new Error('Chemin invalide');
  }
  if (!normalized.toLowerCase().endsWith('.json')) {
    throw new Error('Fichier JSON uniquement');
  }
  const parts = normalized.split('/').filter(Boolean);
  if (parts.some((part) => part === '_backups' || part === '.' || part === '..')) {
    throw new Error('Chemin invalide');
  }
  return parts.join('/');
}

function resolveLocalPath(rel: string): string {
  const parts = rel.split('/');
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', ...parts);
  }
  const writable = path.join(writableDataRoot(), ...parts);
  const bundled = path.join(bundledDataRoot(), ...parts);
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore
  }
  return writable;
}

function repoPath(rel: string): string {
  return `data/${rel}`;
}

function isSensitive(rel: string): boolean {
  return SENSITIVE.has(rel) || rel.startsWith('auth/');
}

async function walkJson(
  dir: string,
  prefix: string,
  out: Map<string, AdminJsonFileInfo>,
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fsPromises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name === '_backups' || entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await walkJson(abs, rel, out);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.json')) continue;
    try {
      const st = await fsPromises.stat(abs);
      out.set(rel.replace(/\\/g, '/'), {
        path: rel.replace(/\\/g, '/'),
        bytes: st.size,
        mtime: st.mtime.toISOString(),
        sensitive: isSensitive(rel.replace(/\\/g, '/')),
      });
    } catch {
      // skip
    }
  }
}

export async function listAdminJsonFiles(): Promise<AdminJsonFileInfo[]> {
  const out = new Map<string, AdminJsonFileInfo>();
  await walkJson(bundledDataRoot(), '', out);
  const writable = writableDataRoot();
  if (path.resolve(writable) !== path.resolve(bundledDataRoot())) {
    await walkJson(writable, '', out);
  }
  return [...out.values()]
    .filter((file) => !isBlockedAdminPath(file.path))
    .sort((a, b) => a.path.localeCompare(b.path, 'fr'));
}

function isBlockedAdminPath(rel: string): boolean {
  const normalized = rel.replace(/\\/g, '/').toLowerCase();
  return normalized === 'auth/sessions.json' || normalized.endsWith('/sessions.json');
}

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const folded = key.toLowerCase();
    if (folded === 'password' || folded === 'token' || folded.endsWith('secret')) {
      out[key] = '';
    } else {
      out[key] = redactSecrets(child);
    }
  }
  return out;
}

function restoreSecrets(incoming: unknown, previous: unknown): unknown {
  if (Array.isArray(incoming)) {
    const prevList = Array.isArray(previous) ? previous : [];
    return incoming.map((item) => {
      const id = item && typeof item === 'object' && 'id' in (item as object)
        ? String((item as { id?: unknown }).id ?? '')
        : '';
      const prev = id
        ? prevList.find((row) => (
          row && typeof row === 'object' && 'id' in (row as object)
          && String((row as { id?: unknown }).id ?? '') === id
        ))
        : undefined;
      return restoreSecrets(item, prev);
    });
  }
  if (!incoming || typeof incoming !== 'object') return incoming;
  const prevObj = previous && typeof previous === 'object' && !Array.isArray(previous)
    ? previous as Record<string, unknown>
    : {};
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(incoming as Record<string, unknown>)) {
    const folded = key.toLowerCase();
    const secret = folded === 'password' || folded === 'token' || folded.endsWith('secret');
    if (secret && (child === '' || child == null) && prevObj[key]) {
      out[key] = prevObj[key];
    } else {
      out[key] = restoreSecrets(child, prevObj[key]);
    }
  }
  return out;
}

export async function readAdminJsonFile(relRaw: string): Promise<{
  path: string;
  text: string;
  valid: boolean;
  parseError: string | null;
  sensitive: boolean;
}> {
  const rel = assertSafeJsonRelPath(relRaw);
  if (isBlockedAdminPath(rel)) throw new Error('Fichier protégé');
  const local = resolveLocalPath(rel);
  await hydrateDurableFile(repoPath(rel), local);
  const raw = await fsPromises.readFile(local, 'utf8');
  try {
    const parsed = redactSecrets(JSON.parse(raw) as unknown);
    return {
      path: rel,
      text: JSON.stringify(parsed, null, 2),
      valid: true,
      parseError: null,
      sensitive: isSensitive(rel),
    };
  } catch (err) {
    return {
      path: rel,
      text: raw,
      valid: false,
      parseError: err instanceof Error ? err.message : 'JSON invalide',
      sensitive: isSensitive(rel),
    };
  }
}

export async function writeAdminJsonFile(relRaw: string, text: string): Promise<{
  path: string;
  bytes: number;
}> {
  const rel = assertSafeJsonRelPath(relRaw);
  if (isBlockedAdminPath(rel)) throw new Error('Fichier protégé');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON invalide — corrections requises avant enregistrement');
  }
  try {
    const previousRaw = await fsPromises.readFile(resolveLocalPath(rel), 'utf8');
    parsed = restoreSecrets(parsed, JSON.parse(previousRaw) as unknown);
  } catch {
    // nouveau fichier
  }
  const local = resolveLocalPath(rel);
  fs.mkdirSync(path.dirname(local), { recursive: true });
  const pretty = `${JSON.stringify(parsed, null, 2)}\n`;
  await fsPromises.writeFile(local, pretty, 'utf8');
  try {
    await persistDurableFile(repoPath(rel), local);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn('[admin-json] persist remote failed', rel, message);
  }
  const st = await fsPromises.stat(local);
  return { path: rel, bytes: st.size };
}
