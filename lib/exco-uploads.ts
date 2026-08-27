/**
 * Persistance des fichiers uploadés EXCO par période (YYYY-MM).
 */
import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import type { ExcoSourceFileId } from './exco-source-files';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

function uploadsRoot(): string {
  const base = canPersistProjectFiles()
    ? path.join(process.cwd(), 'data', 'exco', 'uploads')
    : path.join(getWritableDataRoot(), 'exco', 'uploads');
  return base;
}

export function excoUploadDir(year: number, month: number): string {
  return path.join(uploadsRoot(), `${year}-${String(month).padStart(2, '0')}`);
}

export function excoUploadPath(
  year: number,
  month: number,
  sourceId: ExcoSourceFileId,
  originalName: string,
): string {
  const ext = path.extname(originalName) || '.xlsx';
  return path.join(excoUploadDir(year, month), `${sourceId}${ext}`);
}

export async function saveExcoUpload(input: {
  year: number;
  month: number;
  sourceId: ExcoSourceFileId;
  originalName: string;
  buffer: Buffer;
}): Promise<{ savedAs: string; originalName: string }> {
  const dir = excoUploadDir(input.year, input.month);
  await fsPromises.mkdir(dir, { recursive: true });
  const target = excoUploadPath(input.year, input.month, input.sourceId, input.originalName);
  // Nettoyer anciennes extensions pour ce sourceId
  const existing = await fsPromises.readdir(dir).catch(() => [] as string[]);
  for (const f of existing) {
    if (f.startsWith(`${input.sourceId}.`) || f === input.sourceId) {
      await fsPromises.unlink(path.join(dir, f)).catch(() => undefined);
    }
  }
  await fsPromises.writeFile(target, input.buffer);
  const metaPath = path.join(dir, 'manifest.json');
  let manifest: Record<string, { file: string; originalName: string; uploadedAt: string }> = {};
  try {
    manifest = JSON.parse(await fsPromises.readFile(metaPath, 'utf8'));
  } catch {
    manifest = {};
  }
  manifest[input.sourceId] = {
    file: path.basename(target),
    originalName: input.originalName,
    uploadedAt: new Date().toISOString(),
  };
  await fsPromises.writeFile(metaPath, JSON.stringify(manifest, null, 2), 'utf8');
  return { savedAs: path.basename(target), originalName: input.originalName };
}

/** Supprime le fichier xlsx d’une source après import JSON (garde le JSON overlays). */
export async function deleteExcoUpload(
  year: number,
  month: number,
  sourceId: ExcoSourceFileId,
): Promise<void> {
  const dir = excoUploadDir(year, month);
  const metaPath = path.join(dir, 'manifest.json');
  let manifest: Record<string, { file: string; originalName: string; uploadedAt: string }> = {};
  try {
    manifest = JSON.parse(await fsPromises.readFile(metaPath, 'utf8'));
  } catch {
    manifest = {};
  }
  const meta = manifest[sourceId];
  if (meta?.file) {
    await fsPromises.unlink(path.join(dir, meta.file)).catch(() => undefined);
  }
  const existing = await fsPromises.readdir(dir).catch(() => [] as string[]);
  for (const f of existing) {
    if (f.startsWith(`${sourceId}.`) || f === sourceId) {
      await fsPromises.unlink(path.join(dir, f)).catch(() => undefined);
    }
  }
  delete manifest[sourceId];
  await fsPromises.mkdir(dir, { recursive: true });
  await fsPromises.writeFile(metaPath, JSON.stringify(manifest, null, 2), 'utf8');
}

export async function listExcoUploads(
  year: number,
  month: number,
): Promise<
  Partial<
    Record<
      ExcoSourceFileId,
      { file: string; originalName: string; uploadedAt: string; exists: boolean }
    >
  >
> {
  const dir = excoUploadDir(year, month);
  const metaPath = path.join(dir, 'manifest.json');
  let manifest: Record<string, { file: string; originalName: string; uploadedAt: string }> = {};
  try {
    manifest = JSON.parse(await fsPromises.readFile(metaPath, 'utf8'));
  } catch {
    return {};
  }
  const out: Partial<
    Record<
      ExcoSourceFileId,
      { file: string; originalName: string; uploadedAt: string; exists: boolean }
    >
  > = {};
  for (const [id, meta] of Object.entries(manifest)) {
    const full = path.join(dir, meta.file);
    out[id as ExcoSourceFileId] = {
      ...meta,
      exists: fs.existsSync(full),
    };
  }
  return out;
}

export async function readExcoUploadBuffer(
  year: number,
  month: number,
  sourceId: ExcoSourceFileId,
): Promise<{ buffer: ArrayBuffer; originalName: string } | null> {
  const uploads = await listExcoUploads(year, month);
  const meta = uploads[sourceId];
  if (!meta?.exists) return null;
  const full = path.join(excoUploadDir(year, month), meta.file);
  const buf = await fsPromises.readFile(full);
  return {
    buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
    originalName: meta.originalName,
  };
}
