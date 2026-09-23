import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  durableCompilationSnapshotKey,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { CompilationData, CompilationRow } from './timesheet-compilation';
import type { PolicyChange } from './timesheet-compilation-policy';

export type CompilationSnapshotSource = 'export' | 'close' | 'import';

export interface CompilationSnapshot {
  year: number;
  month: number;
  department: string;
  savedAt: string;
  savedBy?: string;
  source: CompilationSnapshotSource;
  /** Données brutes au moment de l’extrait. */
  data: CompilationData;
  /** Lignes après politique (telles qu’exportées / affichées). */
  policyRows: CompilationRow[];
  policyChanges: PolicyChange[];
}

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

function snapshotPath(year: number, month: number, department: string): string {
  return resolveStorePath(durableCompilationSnapshotKey(year, month, department));
}

export async function getCompilationSnapshot(
  year: number,
  month: number,
  department: string,
): Promise<CompilationSnapshot | null> {
  const filePath = snapshotPath(year, month, department);
  const durableKey = durableCompilationSnapshotKey(year, month, department);
  await hydrateDurableFile(durableKey, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const json = JSON.parse(raw) as CompilationSnapshot;
    if (!json?.data?.rows || !Array.isArray(json.policyRows)) return null;
    return json;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return null;
    throw err;
  }
}

export async function saveCompilationSnapshot(input: {
  year: number;
  month: number;
  department: string;
  data: CompilationData;
  policyRows: CompilationRow[];
  policyChanges: PolicyChange[];
  source: CompilationSnapshotSource;
  userId?: string;
}): Promise<CompilationSnapshot> {
  const snapshot: CompilationSnapshot = {
    year: input.year,
    month: input.month,
    department: input.department,
    savedAt: new Date().toISOString(),
    savedBy: input.userId,
    source: input.source,
    data: {
      ...input.data,
      year: input.year,
      month: input.month,
      department: input.department,
      closed: input.source === 'close' ? true : Boolean(input.data.closed),
      frozen: true,
    },
    policyRows: input.policyRows,
    policyChanges: input.policyChanges,
  };

  const filePath = snapshotPath(input.year, input.month, input.department);
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(snapshot, null, 2), 'utf8');
  await persistDurableFile(
    durableCompilationSnapshotKey(input.year, input.month, input.department),
    filePath,
  );
  return snapshot;
}

export async function deleteCompilationSnapshot(
  year: number,
  month: number,
  department: string,
): Promise<boolean> {
  const filePath = snapshotPath(year, month, department);
  try {
    await fsPromises.unlink(filePath);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return false;
    throw err;
  }
}

/** Build API payload from a saved snapshot (frozen extract). */
export function compilationDataFromSnapshot(snapshot: CompilationSnapshot): CompilationData & {
  policyRows: CompilationRow[];
  policyChanges: PolicyChange[];
} {
  return {
    ...snapshot.data,
    closed: true,
    frozen: true,
    snapshot: {
      savedAt: snapshot.savedAt,
      savedBy: snapshot.savedBy,
      source: snapshot.source,
    },
    policyRows: snapshot.policyRows,
    policyChanges: snapshot.policyChanges,
  };
}
