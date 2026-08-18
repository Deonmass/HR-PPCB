import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_AUDIT_LOGS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type {
  AppendAuditLogInput,
  AuditActor,
  AuditLogEntry,
  AuditLogsStore,
  ReadAuditLogsFilters,
} from './audit-log-types';
import {
  resolveAuditActionLabel,
  resolveAuditModuleLabel,
} from './audit-log-types';
import { hasUndoHandler } from './audit-undo-registry';

const MAX_ENTRIES = 5000;

function resolveStorePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'logs', 'audit.json');
  }
  const writable = path.join(getWritableDataRoot(), 'logs', 'audit.json');
  const bundled = path.join(process.cwd(), 'data', 'logs', 'audit.json');
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

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(
      value,
      (_key, current) => (typeof current === 'bigint' ? current.toString() : current),
      2,
    );
  } catch (err) {
    return JSON.stringify({
      _stringifyError: err instanceof Error ? err.message : String(err),
    });
  }
}

let auditFileUnreadable = false;

function emptyStore(): AuditLogsStore {
  return { entries: [], nextSeq: 1 };
}

function logIdFromSeq(seq: number): string {
  return `log-${String(seq).padStart(6, '0')}`;
}

async function readJsonFile(): Promise<AuditLogsStore> {
  const filePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_AUDIT_LOGS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as AuditLogsStore;
    auditFileUnreadable = false;
    return {
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      nextSeq: Number.isFinite(parsed.nextSeq) && parsed.nextSeq > 0 ? parsed.nextSeq : 1,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') {
      auditFileUnreadable = false;
      return emptyStore();
    }
    auditFileUnreadable = true;
    console.error('[audit-log] JSON illisible, écriture ignorée:', err instanceof Error ? err.message : err);
    return emptyStore();
  }
}

async function writeJsonFile(store: AuditLogsStore): Promise<void> {
  if (auditFileUnreadable) {
    throw new Error('Journal d’audit illisible — enregistrement du journal ignoré');
  }
  const filePath = resolveStorePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, safeJsonStringify(store), 'utf8');
  try {
    await persistDurableFile(DURABLE_AUDIT_LOGS_KEY, filePath);
  } catch (err) {
    console.error('[audit-log] persist GitHub ignoré:', err instanceof Error ? err.message : err);
  }
}

async function writeAppendFailureSidecar(
  err: unknown,
  partial: AppendAuditLogInput,
): Promise<void> {
  try {
    const dir = path.dirname(resolveStorePath());
    await fsPromises.mkdir(dir, { recursive: true });
    const errPath = path.join(dir, 'audit-last-error.json');
    await fsPromises.writeFile(
      errPath,
      safeJsonStringify({
        at: new Date().toISOString(),
        error:
          err instanceof Error
            ? { message: err.message, name: err.name, stack: err.stack }
            : String(err),
        attempted: {
          module: partial.module,
          action: partial.action,
          entityType: partial.entityType,
          entityId: partial.entityId,
          summary: partial.summary,
        },
      }),
      'utf8',
    );
  } catch (sidecarErr) {
    console.error('[audit-log] failed to write last-error sidecar:', sidecarErr);
  }
}

function trimOldest(store: AuditLogsStore): void {
  if (store.entries.length <= MAX_ENTRIES) return;
  store.entries = store.entries
    .slice()
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id))
    .slice(0, MAX_ENTRIES);
}

function inferUndoable(input: AppendAuditLogInput): boolean {
  if (typeof input.undoable === 'boolean') return input.undoable;
  if (input.action === 'error' || input.action === 'export' || input.action === 'import') return false;
  if (input.action === 'undo' || input.action === 'login' || input.action === 'logout') return false;
  if (!input.entityType || !hasUndoHandler(input.entityType)) return false;
  if (input.action === 'create') return input.after != null;
  if (input.action === 'update' || input.action === 'delete') return input.before != null;
  return false;
}

export async function appendAuditLog(partial: AppendAuditLogInput): Promise<AuditLogEntry | null> {
  try {
    const store = await readJsonFile();
    const seq = store.nextSeq;
    const entry: AuditLogEntry = {
      id: logIdFromSeq(seq),
      at: new Date().toISOString(),
      userId: (partial.userId || 'system').trim() || 'system',
      userName: (partial.userName || 'Système').trim() || 'Système',
      userEmail: partial.userEmail?.trim() || undefined,
      module: partial.module.trim() || 'system',
      moduleLabel: resolveAuditModuleLabel(partial.module, partial.moduleLabel),
      action: partial.action,
      actionLabel: resolveAuditActionLabel(partial.action, partial.actionLabel),
      entityType: partial.entityType,
      entityId: partial.entityId,
      summary: partial.summary.trim() || resolveAuditActionLabel(partial.action),
      details: (partial.details ?? partial.summary).trim(),
      before: partial.before,
      after: partial.after,
      undoable: inferUndoable(partial),
      undone: false,
      error: partial.error,
      meta: partial.meta,
    };
    store.entries.unshift(entry);
    store.nextSeq = seq + 1;
    trimOldest(store);
    await writeJsonFile(store);
    return entry;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[audit-log] append failed:', message, err);
    await writeAppendFailureSidecar(err, partial);
    return null;
  }
}

export async function readAuditLogs(filters: ReadAuditLogsFilters = {}): Promise<{
  entries: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}> {
  const store = await readJsonFile();
  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  const offset = Math.max(filters.offset ?? 0, 0);
  const q = filters.q?.trim().toLowerCase() ?? '';
  const moduleFilter = filters.module?.trim().toLowerCase() ?? '';
  const actionFilter = filters.action?.trim().toLowerCase() ?? '';
  const userIdFilter = filters.userId?.trim().toLowerCase() ?? '';

  let entries = store.entries.slice().sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

  if (moduleFilter) {
    entries = entries.filter(
      (item) =>
        item.module.toLowerCase() === moduleFilter
        || item.moduleLabel.toLowerCase().includes(moduleFilter),
    );
  }
  if (actionFilter) {
    entries = entries.filter((item) => item.action.toLowerCase() === actionFilter);
  }
  if (userIdFilter) {
    entries = entries.filter(
      (item) =>
        item.userId.toLowerCase() === userIdFilter
        || item.userName.toLowerCase().includes(userIdFilter)
        || (item.userEmail ?? '').toLowerCase().includes(userIdFilter),
    );
  }
  if (q) {
    entries = entries.filter((item) => {
      const haystack = [
        item.summary,
        item.details,
        item.module,
        item.moduleLabel,
        item.action,
        item.actionLabel,
        item.userName,
        item.userEmail,
        item.entityId,
        item.entityType,
        item.error?.message,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  const total = entries.length;
  return {
    entries: entries.slice(offset, offset + limit),
    total,
    limit,
    offset,
  };
}

export async function getAuditLog(id: string): Promise<AuditLogEntry | null> {
  const store = await readJsonFile();
  return store.entries.find((item) => item.id === id) ?? null;
}

export async function deleteAuditLog(id: string): Promise<boolean> {
  const store = await readJsonFile();
  const next = store.entries.filter((item) => item.id !== id);
  if (next.length === store.entries.length) return false;
  store.entries = next;
  await writeJsonFile(store);
  return true;
}

export async function undoAuditLog(
  id: string,
  actor: AuditActor,
): Promise<{ entry: AuditLogEntry; undoLog: AuditLogEntry | null }> {
  const store = await readJsonFile();
  const index = store.entries.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Log introuvable');
  const entry = store.entries[index];
  if (!entry.undoable) throw new Error('Cette action ne peut pas être annulée');
  if (entry.undone) throw new Error('Cette action a déjà été annulée');
  if (!entry.entityType || !hasUndoHandler(entry.entityType)) {
    throw new Error('Aucun gestionnaire d’annulation pour ce type d’entité');
  }

  const { runUndoHandler } = await import('./audit-undo-handlers');
  await runUndoHandler(entry);

  const undoSeq = store.nextSeq;
  const undoLog: AuditLogEntry = {
    id: logIdFromSeq(undoSeq),
    at: new Date().toISOString(),
    userId: actor.userId,
    userName: actor.userName,
    userEmail: actor.userEmail,
    module: entry.module,
    moduleLabel: entry.moduleLabel,
    action: 'undo',
    actionLabel: resolveAuditActionLabel('undo'),
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: `Annulation : ${entry.summary}`,
    details: `Annulation de l’action « ${entry.actionLabel} » (${entry.id}). ${entry.details}`,
    before: entry.after,
    after: entry.before,
    undoable: false,
    undone: false,
    meta: { undoneLogId: entry.id },
  };

  store.entries[index] = {
    ...entry,
    undone: true,
    undoneByLogId: undoLog.id,
  };
  store.entries.unshift(undoLog);
  store.nextSeq = undoSeq + 1;
  trimOldest(store);
  await writeJsonFile(store);
  return { entry: store.entries.find((item) => item.id === id)!, undoLog };
}

export async function logAuditError(input: {
  message: string;
  details?: string;
  module?: string;
  moduleLabel?: string;
  path?: string;
  method?: string;
  stack?: string;
  code?: string;
  status?: number;
  context?: Record<string, unknown>;
  user?: AuditActor | null;
}): Promise<AuditLogEntry | null> {
  return appendAuditLog({
    userId: input.user?.userId,
    userName: input.user?.userName,
    userEmail: input.user?.userEmail,
    module: input.module || 'system',
    moduleLabel: input.moduleLabel,
    action: 'error',
    summary: input.message,
    details: input.details || input.message,
    undoable: false,
    error: {
      message: input.message,
      code: input.code,
      stack: input.stack,
      path: input.path,
      method: input.method,
      status: input.status,
      context: input.context,
    },
  });
}

export async function listAuditFilterOptions(): Promise<{
  modules: { id: string; label: string }[];
  users: { id: string; name: string }[];
}> {
  const store = await readJsonFile();
  const modulesMap = new Map<string, string>();
  const usersMap = new Map<string, string>();
  for (const entry of store.entries) {
    if (!modulesMap.has(entry.module)) modulesMap.set(entry.module, entry.moduleLabel);
    if (!usersMap.has(entry.userId)) usersMap.set(entry.userId, entry.userName);
  }
  return {
    modules: [...modulesMap.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    users: [...usersMap.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  };
}
