import fs from 'fs/promises';
import path from 'path';
import type { ExitDocType } from './employee-docs.server';

/** Journal des documents d'exit émis (les fichiers sont enregistrés côté client). */

const LOG_DIR = path.join(process.cwd(), 'data', 'documents');
const LOG_FILE = path.join(LOG_DIR, 'exit-issued.json');

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

export async function listExitIssued(): Promise<ExitIssuedRecord[]> {
  try {
    const raw = await fs.readFile(LOG_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ExitIssuedRecord[]) : [];
  } catch {
    return [];
  }
}

export async function appendExitIssued(
  record: Omit<ExitIssuedRecord, 'id' | 'createdAt'>,
): Promise<ExitIssuedRecord> {
  const entry: ExitIssuedRecord = {
    ...record,
    id: `exit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const items = await listExitIssued();
  items.push(entry);
  await fs.mkdir(LOG_DIR, { recursive: true });
  await fs.writeFile(LOG_FILE, JSON.stringify(items, null, 2), 'utf8');
  return entry;
}
