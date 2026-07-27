import 'server-only';

import { get, put } from '@vercel/blob';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { getDataBackend } from './runtime-mode';

/** Remote keys for durable auth/config files (shared across Vercel instances). */
export const DURABLE_PARAMS_KEY = 'durable/Params.xlsx';
export const DURABLE_PERMISSIONS_KEY = 'durable/permissions.json';

export function isDurableRemoteEnabled(): boolean {
  return getDataBackend() === 'tmp' && Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function needsDurableRemote(): boolean {
  return getDataBackend() === 'tmp';
}

/**
 * On Vercel/tmp, user & permission writes require Blob storage.
 * Without it, /tmp changes vanish on cold start / another instance.
 */
export function assertDurableRemoteConfigured(action = 'sauvegarder'): void {
  if (!needsDurableRemote()) return;
  if (isDurableRemoteEnabled()) return;
  throw new Error(
    `Impossible de ${action} sur Vercel sans stockage durable. `
      + 'Créez un Blob Store (Vercel → Storage → Blob) et ajoutez '
      + 'BLOB_READ_WRITE_TOKEN dans les variables d’environnement du projet, puis redéployez.',
  );
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const response = new Response(stream);
  return Buffer.from(await response.arrayBuffer());
}

/** Pull remote durable file into local path (source of truth on Vercel). */
export async function hydrateDurableFile(remoteKey: string, localPath: string): Promise<void> {
  if (!isDurableRemoteEnabled()) return;

  try {
    const result = await get(remoteKey, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200 || !result.stream) return;

    const buffer = await streamToBuffer(result.stream);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    fs.writeFileSync(localPath, buffer);
  } catch (err) {
    // No remote file yet → keep local seed copy.
    const message = err instanceof Error ? err.message : String(err);
    if (!/not found|404/i.test(message)) {
      console.warn('[durable-fs] hydrate failed', remoteKey, message);
    }
  }
}

/** Push local file to remote durable storage after a successful write. */
export async function persistDurableFile(remoteKey: string, localPath: string): Promise<void> {
  if (!needsDurableRemote()) return;
  assertDurableRemoteConfigured('persister');

  const body = await fsPromises.readFile(localPath);
  const contentType = remoteKey.endsWith('.json')
    ? 'application/json; charset=utf-8'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  await put(remoteKey, body, {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType,
  });
}
