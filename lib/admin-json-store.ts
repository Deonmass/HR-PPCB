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
  return [...out.values()].sort((a, b) => a.path.localeCompare(b.path, 'fr'));
}

export async function readAdminJsonFile(relRaw: string): Promise<{
  path: string;
  text: string;
  valid: boolean;
  parseError: string | null;
  sensitive: boolean;
}> {
  const rel = assertSafeJsonRelPath(relRaw);
  const local = resolveLocalPath(rel);
  await hydrateDurableFile(repoPath(rel), local);
  const raw = await fsPromises.readFile(local, 'utf8');
  try {
    const parsed = JSON.parse(raw) as unknown;
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('JSON invalide — corrections requises avant enregistrement');
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
