import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import type { ExitDocType } from './employee-docs.server';
import {
  DURABLE_EXIT_ISSUED_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

/** Journal des documents d'exit émis (les fichiers sont enregistrés côté client). */

export interface ExitIssuedRecord {
  id: string;
  createdAt: string;
  matricule: string;
  employeeName: string;
  doc: ExitDocType;
  docLabel: string;
  fileName: string;
  issuedBy?: string;
}

function resolveLogPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'documents', 'exit-issued.json');
  }
  const writable = path.join(getWritableDataRoot(), 'documents', 'exit-issued.json');
  const bundled = path.join(process.cwd(), 'data', 'documents', 'exit-issued.json');
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

async function readAll(): Promise<ExitIssuedRecord[]> {
  const filePath = resolveLogPath();
  await hydrateDurableFile(DURABLE_EXIT_ISSUED_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExitIssuedRecord[]) : [];
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return [];
    throw err;
  }
}

async function writeAll(items: ExitIssuedRecord[]): Promise<void> {
  const filePath = resolveLogPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(items, null, 2), 'utf8');
  await persistDurableFile(DURABLE_EXIT_ISSUED_KEY, filePath);
}

export async function listExitIssued(): Promise<ExitIssuedRecord[]> {
  return readAll();
}

export async function deleteExitIssued(id: string): Promise<boolean> {
  const items = await readAll();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeAll(next);
  return true;
}

export async function appendExitIssued(
  record: Omit<ExitIssuedRecord, 'id' | 'createdAt'>,
): Promise<ExitIssuedRecord> {
  const entry: ExitIssuedRecord = {
    ...record,
    id: `exit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const items = await readAll();
  items.push(entry);
  await writeAll(items);
  return entry;
}
