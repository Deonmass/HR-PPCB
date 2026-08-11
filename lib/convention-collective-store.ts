import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_CONVENTION_NOTES_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import type { ConventionNote } from './convention-collective-index';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

export type { ConventionNote };

interface NotesStore {
  notes: ConventionNote[];
}

function resolveNotesPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'documents', 'convention-collective-notes.json');
  }
  const writable = path.join(getWritableDataRoot(), 'documents', 'convention-collective-notes.json');
  const bundled = path.join(process.cwd(), 'data', 'documents', 'convention-collective-notes.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore
  }
  return writable;
}

export function resolveConventionPdfPath(): string {
  return path.join(
    process.cwd(),
    'Excel',
    'templates',
    'convention-collective',
    'convention-collective.pdf',
  );
}

async function readStore(): Promise<NotesStore> {
  const filePath = resolveNotesPath();
  await hydrateDurableFile(DURABLE_CONVENTION_NOTES_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as NotesStore;
    return { notes: Array.isArray(parsed.notes) ? parsed.notes : [] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { notes: [] };
    throw err;
  }
}

async function writeStore(store: NotesStore): Promise<void> {
  const filePath = resolveNotesPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  await persistDurableFile(DURABLE_CONVENTION_NOTES_KEY, filePath);
}

export async function listConventionNotes(): Promise<ConventionNote[]> {
  const store = await readStore();
  return [...store.notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function upsertConventionNote(input: {
  id?: string;
  title: string;
  summary: string;
  body?: string;
  tags?: string[];
  createdBy?: string;
}): Promise<ConventionNote> {
  const title = input.title.trim();
  if (!title) throw new Error('Titre requis');
  const summary = input.summary.trim();
  if (!summary) throw new Error('Résumé requis');
  const now = new Date().toISOString();
  const store = await readStore();
  const id = input.id?.trim();
  if (id) {
    const idx = store.notes.findIndex((n) => n.id === id);
    if (idx >= 0) {
      const prev = store.notes[idx];
      const updated: ConventionNote = {
        ...prev,
        title,
        summary,
        body: String(input.body ?? prev.body ?? '').trim(),
        tags: Array.isArray(input.tags)
          ? input.tags.map((t) => t.trim()).filter(Boolean)
          : prev.tags,
        updatedAt: now,
      };
      store.notes[idx] = updated;
      await writeStore(store);
      return updated;
    }
  }
  const entry: ConventionNote = {
    id: `cc-note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    summary,
    body: String(input.body || '').trim(),
    tags: (input.tags || []).map((t) => t.trim()).filter(Boolean),
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
  };
  store.notes.unshift(entry);
  await writeStore(store);
  return entry;
}

export async function deleteConventionNote(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.notes.filter((n) => n.id !== id);
  if (next.length === store.notes.length) return false;
  await writeStore({ notes: next });
  return true;
}
