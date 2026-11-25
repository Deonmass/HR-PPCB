import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_HRCO_CELLS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

type CellsFile = { values: Record<string, string> };

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) return path.join(process.cwd(), relativePath);
  const writable = path.join(getWritableDataRoot(), relativePath.replace(/^data[\\/]/, ''));
  const bundled = path.join(process.cwd(), relativePath);
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

async function readFile(): Promise<CellsFile> {
  const filePath = resolveStorePath(DURABLE_HRCO_CELLS_KEY);
  await hydrateDurableFile(DURABLE_HRCO_CELLS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const json = JSON.parse(raw) as CellsFile;
    return { values: json.values && typeof json.values === 'object' ? json.values : {} };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { values: {} };
    throw err;
  }
}

async function writeFile(data: CellsFile): Promise<void> {
  const filePath = resolveStorePath(DURABLE_HRCO_CELLS_KEY);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_HRCO_CELLS_KEY, filePath);
}

export async function readHrcoManualCells(): Promise<Record<string, string>> {
  const file = await readFile();
  return file.values;
}

export async function writeHrcoManualCells(
  entries: Array<{ key: string; value: string }>,
): Promise<Record<string, string>> {
  const file = await readFile();
  for (const entry of entries) {
    const text = entry.value.trim().slice(0, 500);
    if (text) file.values[entry.key] = text;
    else delete file.values[entry.key];
  }
  await writeFile(file);
  return file.values;
}

export async function writeHrcoManualCell(key: string, value: string): Promise<Record<string, string>> {
  return writeHrcoManualCells([{ key, value }]);
}
