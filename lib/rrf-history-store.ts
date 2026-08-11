import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_RRF_HISTORY_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type { RrfFormData } from './rrf-types';
import { RRF_EMPTY_FORM } from './rrf-types';

/** Historique des RRF — data/documents/rrf-history.json (1 ligne par dossier). */

export type RrfExportFormat = 'saved' | 'xlsx' | 'pdf';

function resolveLogPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'documents', 'rrf-history.json');
  }
  const writable = path.join(getWritableDataRoot(), 'documents', 'rrf-history.json');
  const bundled = path.join(process.cwd(), 'data', 'documents', 'rrf-history.json');
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

export interface RrfHistoryRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  format: RrfExportFormat;
  fileName: string;
  positionTitle: string;
  jobTitle: string;
  costCenter: string;
  location: string;
  reportsTo: string;
  headcount: string;
  issuedBy?: string;
  /** Snapshot complet du formulaire (rechargé depuis l’historique). */
  form: RrfFormData;
}

function sanitizeForm(raw: unknown): RrfFormData {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Partial<RrfFormData>;
  const benefits = data.benefits && typeof data.benefits === 'object' ? data.benefits : {};
  return {
    ...RRF_EMPTY_FORM,
    ...data,
    benefits: {
      ...RRF_EMPTY_FORM.benefits,
      ...benefits,
    },
  };
}

function normalizeRecord(raw: unknown): RrfHistoryRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<RrfHistoryRecord> & { createdAt?: string };
  if (!r.id || !r.createdAt) return null;
  const form = sanitizeForm(r.form);
  const format: RrfExportFormat =
    r.format === 'pdf' ? 'pdf' : r.format === 'xlsx' ? 'xlsx' : 'saved';
  return {
    id: String(r.id),
    createdAt: String(r.createdAt),
    updatedAt: String(r.updatedAt || r.createdAt),
    format,
    fileName: String(r.fileName || ''),
    positionTitle: String(r.positionTitle || form.positionTitle || ''),
    jobTitle: String(r.jobTitle || form.jobTitle || ''),
    costCenter: String(r.costCenter || form.costCenter || ''),
    location: String(r.location || form.location || ''),
    reportsTo: String(r.reportsTo || form.reportsTo || ''),
    headcount: String(r.headcount || form.headcount || ''),
    issuedBy: r.issuedBy ? String(r.issuedBy) : undefined,
    form,
  };
}

function summaryFromForm(form: RrfFormData, extra: {
  format: RrfExportFormat;
  fileName: string;
  issuedBy?: string;
  id: string;
  createdAt: string;
  updatedAt: string;
}): RrfHistoryRecord {
  return {
    id: extra.id,
    createdAt: extra.createdAt,
    updatedAt: extra.updatedAt,
    format: extra.format,
    fileName: extra.fileName,
    positionTitle: form.positionTitle,
    jobTitle: form.jobTitle,
    costCenter: form.costCenter,
    location: form.location,
    reportsTo: form.reportsTo,
    headcount: form.headcount,
    issuedBy: extra.issuedBy,
    form,
  };
}

/** Clé métier pour fusionner les doublons d’un même dossier (ex-save + excel + pdf). */
function formKey(record: RrfHistoryRecord): string {
  return [
    record.positionTitle,
    record.jobTitle,
    record.costCenter,
    record.location,
    record.headcount,
    record.issuedBy || '',
  ]
    .map((v) => String(v || '').trim().toLowerCase())
    .join('|');
}

/**
 * Une seule ligne par dossier : garde la plus récente de chaque groupe.
 */
function dedupeHistory(items: RrfHistoryRecord[]): RrfHistoryRecord[] {
  const byKey = new Map<string, RrfHistoryRecord>();
  for (const item of items) {
    const key = formKey(item);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    const prevTs = prev.updatedAt || prev.createdAt;
    const nextTs = item.updatedAt || item.createdAt;
    if (nextTs >= prevTs) {
      byKey.set(key, {
        ...item,
        createdAt: prev.createdAt < item.createdAt ? prev.createdAt : item.createdAt,
        updatedAt: nextTs,
      });
    } else {
      byKey.set(key, {
        ...prev,
        createdAt: prev.createdAt < item.createdAt ? prev.createdAt : item.createdAt,
      });
    }
  }
  return [...byKey.values()].sort((a, b) =>
    (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
  );
}

async function writeAll(items: RrfHistoryRecord[]): Promise<void> {
  const filePath = resolveLogPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(items, null, 2), 'utf8');
  await persistDurableFile(DURABLE_RRF_HISTORY_KEY, filePath);
}

export async function listRrfHistory(): Promise<RrfHistoryRecord[]> {
  const filePath = resolveLogPath();
  await hydrateDurableFile(DURABLE_RRF_HISTORY_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const items = parsed
      .map((item) => normalizeRecord(item))
      .filter((item): item is RrfHistoryRecord => Boolean(item));
    const deduped = dedupeHistory(items);
    // Persiste le nettoyage si des doublons existaient (save + excel + pdf).
    if (deduped.length !== items.length) {
      await writeAll(deduped);
    }
    return deduped;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return [];
    throw err;
  }
}

export async function getRrfHistory(id: string): Promise<RrfHistoryRecord | null> {
  const items = await listRrfHistory();
  return items.find((item) => item.id === id) ?? null;
}

export async function deleteRrfHistory(id: string): Promise<boolean> {
  const items = await listRrfHistory();
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return false;
  await writeAll(next);
  return true;
}

/**
 * Crée ou met à jour UNE ligne d’historique (même id = mise à jour).
 * Pas de nouvelle ligne à chaque export.
 */
export async function upsertRrfHistory(input: {
  id?: string;
  form: RrfFormData;
  issuedBy?: string;
  format?: RrfExportFormat;
  fileName?: string;
}): Promise<RrfHistoryRecord> {
  const form = sanitizeForm(input.form);
  const now = new Date().toISOString();
  const format = input.format || 'saved';
  const fileName = input.fileName || `RRF-${(form.positionTitle || form.jobTitle || 'rrf').replace(/\s+/g, '-').slice(0, 40)}.json`;

  const items = await listRrfHistory();
  const id = input.id?.trim();
  if (id) {
    const idx = items.findIndex((item) => item.id === id);
    if (idx >= 0) {
      const prev = items[idx];
      const updated = summaryFromForm(form, {
        id: prev.id,
        createdAt: prev.createdAt,
        updatedAt: now,
        format,
        fileName,
        issuedBy: input.issuedBy ?? prev.issuedBy,
      });
      items[idx] = updated;
      await writeAll(items);
      return updated;
    }
  }

  const entry = summaryFromForm(form, {
    id: `rrf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    updatedAt: now,
    format,
    fileName,
    issuedBy: input.issuedBy,
  });
  items.unshift(entry);
  await writeAll(items);
  return entry;
}

/** @deprecated préférez upsertRrfHistory — conserve l’API pour appels existants. */
export async function appendRrfHistory(
  input: {
    format: RrfExportFormat;
    fileName: string;
    form: RrfFormData;
    issuedBy?: string;
    id?: string;
  },
): Promise<RrfHistoryRecord> {
  return upsertRrfHistory(input);
}
