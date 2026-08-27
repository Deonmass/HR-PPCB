/**
 * Résout le classeur BASE (New report) : source bundlée (affichage onglet BASE).
 * Upload legacy éventuel en secours.
 */
import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { readExcoUploadBuffer } from './exco-uploads';

const BUNDLED_NEW_REPORT = path.join(
  process.cwd(),
  'data',
  'exco',
  'sources',
  'New report.xlsx',
);

export async function resolveExcoBaseWorkbook(
  year: number,
  month: number,
): Promise<{ buffer: ArrayBuffer; originalName: string } | null> {
  // Priorité au New report bundlé (feuille BASE)
  try {
    const buf = await fs.readFile(BUNDLED_NEW_REPORT);
    return {
      buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      originalName: path.basename(BUNDLED_NEW_REPORT),
    };
  } catch {
    // fallback upload période
  }

  return readExcoUploadBuffer(year, month, 'newReport');
}
