/**
 * Résout le classeur New report pour un mois :
 * 1) data/exco/sources/YYYY-MM/New report.xlsx (BASE officielle du mois)
 * 2) New report bundlé (seed)
 * 3) upload legacy newReport
 */
import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import { readExcoUploadBuffer } from './exco-uploads';

const SOURCES_ROOT = path.join(process.cwd(), 'data', 'exco', 'sources');
const BUNDLED_NEW_REPORT = path.join(SOURCES_ROOT, 'New report.xlsx');

async function readWorkbookFile(
  filePath: string,
): Promise<{ buffer: ArrayBuffer; originalName: string } | null> {
  try {
    const buf = await fs.readFile(filePath);
    return {
      buffer: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      originalName: path.basename(filePath),
    };
  } catch {
    return null;
  }
}

export async function resolveExcoBaseWorkbook(
  year: number,
  month: number,
): Promise<{ buffer: ArrayBuffer; originalName: string } | null> {
  if (Number.isInteger(year) && year >= 2000 && Number.isInteger(month) && month >= 1 && month <= 12) {
    const monthKey = `${year}-${String(month).padStart(2, '0')}`;
    const monthFile = await readWorkbookFile(
      path.join(SOURCES_ROOT, monthKey, 'New report.xlsx'),
    );
    if (monthFile) return monthFile;
  }

  const bundled = await readWorkbookFile(BUNDLED_NEW_REPORT);
  if (bundled) return bundled;

  if (Number.isInteger(year) && Number.isInteger(month)) {
    return readExcoUploadBuffer(year, month, 'newReport');
  }
  return null;
}
