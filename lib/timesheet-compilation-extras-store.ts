import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_COMPILATION_EXTRAS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

type ExtrasFile = {
  entries: Record<string, string[]>;
};

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

function extrasPath(): string {
  return resolveStorePath(DURABLE_COMPILATION_EXTRAS_KEY);
}

export function compilationExtrasKey(year: number, month: number, department: string): string {
  return `${Math.trunc(year)}-${Math.trunc(month)}::${department.trim() || '__ALL__'}`;
}

async function readExtrasFile(): Promise<ExtrasFile> {
  const filePath = extrasPath();
  await hydrateDurableFile(DURABLE_COMPILATION_EXTRAS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const json = JSON.parse(raw) as ExtrasFile;
    return { entries: json.entries ?? {} };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { entries: {} };
    throw err;
  }
}

async function writeExtrasFile(data: ExtrasFile): Promise<void> {
  const filePath = extrasPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_COMPILATION_EXTRAS_KEY, filePath);
}

export async function getCompilationExtraMatricules(
  year: number,
  month: number,
  department: string,
): Promise<string[]> {
  const file = await readExtrasFile();
  const list = file.entries[compilationExtrasKey(year, month, department)] ?? [];
  return list.map((item) => item.trim()).filter(Boolean);
}

export async function addCompilationExtraMatricules(
  year: number,
  month: number,
  department: string,
  matricules: string[],
): Promise<string[]> {
  const file = await readExtrasFile();
  const key = compilationExtrasKey(year, month, department);
  const current = new Set(file.entries[key] ?? []);
  for (const matricule of matricules) {
    const trimmed = matricule.trim();
    if (trimmed) current.add(trimmed);
  }
  const next = Array.from(current);
  file.entries[key] = next;
  await writeExtrasFile(file);
  return next;
}
