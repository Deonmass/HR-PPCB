import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_AUDIT_HR_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import type {
  AuditHrAction,
  AuditHrActionInput,
  AuditHrConfirmation,
  AuditHrSeverity,
} from './audit-hr-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface StoreData {
  actions: AuditHrAction[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'audit', 'actions.json');
  }
  const writable = path.join(getWritableDataRoot(), 'audit', 'actions.json');
  const bundled = path.join(process.cwd(), 'data', 'audit', 'actions.json');
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

function uid(prefix = 'aud'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeDate(value: unknown): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  return '';
}

function normalizeSeverity(value: unknown): AuditHrSeverity {
  const s = String(value || '').trim();
  if (s === 'High' || s === 'Medium' || s === 'Low') return s;
  return 'Medium';
}

function normalizeConfirmation(value: unknown): AuditHrConfirmation {
  return String(value || '').trim() === 'Oui' ? 'Oui' : 'Non';
}

function normalizeAction(raw: unknown): AuditHrAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<AuditHrAction>;
  const action = String(r.action || '').trim();
  if (!action) return null;
  const now = new Date().toISOString();
  return {
    id: String(r.id || uid()),
    owner: String(r.owner || '').trim(),
    action,
    issueCreationDate: normalizeDate(r.issueCreationDate),
    dueDate: normalizeDate(r.dueDate),
    closingDate: normalizeDate(r.closingDate),
    confirmationAudit: normalizeConfirmation(r.confirmationAudit),
    commentaire: String(r.commentaire || ''),
    severity: normalizeSeverity(r.severity),
    createdAt: String(r.createdAt || now),
    updatedAt: String(r.updatedAt || now),
    createdBy: r.createdBy ? String(r.createdBy) : undefined,
    updatedBy: r.updatedBy ? String(r.updatedBy) : undefined,
  };
}

async function readStore(): Promise<StoreData> {
  const filePath = resolvePath();
  await hydrateDurableFile(DURABLE_AUDIT_HR_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions.map(normalizeAction).filter((a): a is AuditHrAction => Boolean(a))
      : [];
    return { actions };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { actions: [] };
    throw err;
  }
}

async function writeStore(data: StoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  await fsPromises.writeFile(filePath, payload, 'utf8');
  await persistDurableFile(DURABLE_AUDIT_HR_KEY, filePath);
}

export async function listAuditHrActions(): Promise<AuditHrAction[]> {
  const store = await readStore();
  return [...store.actions].sort((a, b) => {
    const ownerCmp = a.owner.localeCompare(b.owner, 'fr');
    if (ownerCmp !== 0) return ownerCmp;
    return a.action.localeCompare(b.action, 'fr');
  });
}

export async function getAuditHrAction(id: string): Promise<AuditHrAction | null> {
  const store = await readStore();
  return store.actions.find((a) => a.id === id) || null;
}

function fromInput(input: AuditHrActionInput, base?: AuditHrAction, actor?: string): AuditHrAction {
  const now = new Date().toISOString();
  const action = String(input.action || '').trim();
  if (!action) throw new Error('Action requise');
  const owner = String(input.owner || '').trim();
  if (!owner) throw new Error('Owner requis');

  return {
    id: base?.id || uid(),
    owner,
    action,
    issueCreationDate: normalizeDate(input.issueCreationDate),
    dueDate: normalizeDate(input.dueDate),
    closingDate: normalizeDate(input.closingDate),
    confirmationAudit: normalizeConfirmation(input.confirmationAudit),
    commentaire: String(input.commentaire || ''),
    severity: normalizeSeverity(input.severity),
    createdAt: base?.createdAt || now,
    updatedAt: now,
    createdBy: base?.createdBy || actor,
    updatedBy: actor,
  };
}

export async function createAuditHrAction(
  input: AuditHrActionInput,
  actor?: string,
): Promise<AuditHrAction> {
  const store = await readStore();
  const created = fromInput(input, undefined, actor);
  store.actions.push(created);
  await writeStore(store);
  return created;
}

export async function updateAuditHrAction(
  id: string,
  input: AuditHrActionInput,
  actor?: string,
): Promise<AuditHrAction | null> {
  const store = await readStore();
  const idx = store.actions.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const updated = fromInput(input, store.actions[idx], actor);
  store.actions[idx] = updated;
  await writeStore(store);
  return updated;
}

export async function completeAuditHrAction(
  id: string,
  patch: {
    closingDate?: string;
    confirmationAudit?: AuditHrConfirmation | '';
    commentaire?: string;
  },
  actor?: string,
): Promise<AuditHrAction | null> {
  const store = await readStore();
  const idx = store.actions.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const current = store.actions[idx];
  const today = new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const updated: AuditHrAction = {
    ...current,
    closingDate: normalizeDate(patch.closingDate) || current.closingDate || iso,
    confirmationAudit: patch.confirmationAudit
      ? normalizeConfirmation(patch.confirmationAudit)
      : current.confirmationAudit,
    commentaire:
      patch.commentaire != null ? String(patch.commentaire) : current.commentaire,
    updatedAt: new Date().toISOString(),
    updatedBy: actor,
  };
  store.actions[idx] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteAuditHrAction(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.actions.filter((a) => a.id !== id);
  if (next.length === store.actions.length) return false;
  store.actions = next;
  await writeStore(store);
  return true;
}
