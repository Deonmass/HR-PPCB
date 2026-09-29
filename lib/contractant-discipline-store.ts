import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  ContractantDisciplineCase,
  ContractantDisciplineCaseInput,
  ContractantDisciplineStatut,
} from './contractant-discipline-types';
import { CONTRACTANT_DISCIPLINE_STATUTS } from './contractant-discipline-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface StoreData {
  cases: ContractantDisciplineCase[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'contractant-discipline.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'contractant-discipline.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'contractant-discipline.json');
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

function emptyStore(): StoreData {
  return { cases: [] };
}

function normalizeStatut(raw: string): ContractantDisciplineStatut {
  return CONTRACTANT_DISCIPLINE_STATUTS.includes(raw as ContractantDisciplineStatut)
    ? (raw as ContractantDisciplineStatut)
    : 'Ouvert';
}

function normalizeCase(raw: unknown): ContractantDisciplineCase | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ContractantDisciplineCase>;
  if (!r.id || !r.contractantId || !r.employeeId) return null;
  return {
    id: String(r.id),
    contractantId: String(r.contractantId),
    employeeId: String(r.employeeId),
    employeeName: String(r.employeeName || '').trim(),
    dateIncident: String(r.dateIncident || '').trim(),
    motif: String(r.motif || '').trim(),
    explication: String(r.explication || '').trim(),
    reponse: String(r.reponse || '').trim(),
    sanction: String(r.sanction || 'Aucune').trim() || 'Aucune',
    statut: normalizeStatut(String(r.statut || 'Ouvert')),
    commentaires: Array.isArray(r.commentaires)
      ? r.commentaires
          .filter((c) => c && typeof c === 'object')
          .map((c) => ({
            id: String((c as { id?: string }).id || randomUUID()),
            auteur: String((c as { auteur?: string }).auteur || '').trim() || '—',
            texte: String((c as { texte?: string }).texte || '').trim(),
            createdAt: String((c as { createdAt?: string }).createdAt || new Date().toISOString()),
          }))
          .filter((c) => c.texte)
      : [],
    createdAt: String(r.createdAt || new Date().toISOString()),
    updatedAt: String(r.updatedAt || r.createdAt || new Date().toISOString()),
    createdBy: r.createdBy ? String(r.createdBy) : undefined,
  };
}

async function readStore(): Promise<StoreData> {
  const filePath = resolvePath();
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as StoreData;
    return {
      cases: Array.isArray(parsed.cases)
        ? parsed.cases.map(normalizeCase).filter((c): c is ContractantDisciplineCase => Boolean(c))
        : [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: StoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
}

export async function listDisciplineCases(opts?: {
  contractantId?: string;
  employeeId?: string;
}): Promise<ContractantDisciplineCase[]> {
  const store = await readStore();
  let list = [...store.cases];
  if (opts?.contractantId) {
    list = list.filter((c) => c.contractantId === opts.contractantId);
  }
  if (opts?.employeeId) {
    list = list.filter((c) => c.employeeId === opts.employeeId);
  }
  return list.sort(
    (a, b) => new Date(b.dateIncident || b.createdAt).getTime() - new Date(a.dateIncident || a.createdAt).getTime(),
  );
}

export async function countDisciplineByEmployee(
  contractantId: string,
): Promise<Record<string, number>> {
  const cases = await listDisciplineCases({ contractantId });
  const counts: Record<string, number> = {};
  for (const item of cases) {
    counts[item.employeeId] = (counts[item.employeeId] || 0) + 1;
  }
  return counts;
}

export async function getDisciplineCase(id: string): Promise<ContractantDisciplineCase | null> {
  const store = await readStore();
  return store.cases.find((c) => c.id === id) ?? null;
}

export async function createDisciplineCase(
  input: ContractantDisciplineCaseInput,
  createdBy?: string,
): Promise<ContractantDisciplineCase> {
  const contractantId = String(input.contractantId || '').trim();
  const employeeId = String(input.employeeId || '').trim();
  const motif = String(input.motif || '').trim();
  if (!contractantId) throw new Error('Contractant requis');
  if (!employeeId) throw new Error('Employé requis');
  if (!motif) throw new Error('Motif requis');

  const now = new Date().toISOString();
  const record: ContractantDisciplineCase = {
    id: randomUUID(),
    contractantId,
    employeeId,
    employeeName: String(input.employeeName || '').trim(),
    dateIncident: String(input.dateIncident || now.slice(0, 10)).trim(),
    motif,
    explication: String(input.explication || '').trim(),
    reponse: String(input.reponse || '').trim(),
    sanction: String(input.sanction || 'Aucune').trim() || 'Aucune',
    statut: normalizeStatut(String(input.statut || 'Ouvert')),
    commentaires: [],
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  const store = await readStore();
  store.cases.unshift(record);
  await writeStore(store);
  return record;
}

export async function updateDisciplineCase(
  id: string,
  patch: Partial<ContractantDisciplineCaseInput> & {
    commentaires?: ContractantDisciplineCase['commentaires'];
  },
): Promise<ContractantDisciplineCase | null> {
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.cases[index]!;
  const next: ContractantDisciplineCase = {
    ...prev,
    dateIncident: patch.dateIncident !== undefined ? String(patch.dateIncident).trim() : prev.dateIncident,
    motif: patch.motif !== undefined ? String(patch.motif).trim() : prev.motif,
    explication: patch.explication !== undefined ? String(patch.explication).trim() : prev.explication,
    reponse: patch.reponse !== undefined ? String(patch.reponse).trim() : prev.reponse,
    sanction: patch.sanction !== undefined ? String(patch.sanction).trim() || 'Aucune' : prev.sanction,
    statut: patch.statut !== undefined ? normalizeStatut(String(patch.statut)) : prev.statut,
    commentaires: patch.commentaires ?? prev.commentaires,
    updatedAt: new Date().toISOString(),
  };
  if (!next.motif) throw new Error('Motif requis');
  store.cases[index] = next;
  await writeStore(store);
  return next;
}

export async function addDisciplineComment(
  id: string,
  auteur: string,
  texte: string,
): Promise<ContractantDisciplineCase | null> {
  const trimmed = texte.trim();
  if (!trimmed) throw new Error('Commentaire vide');
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.cases[index]!;
  const next: ContractantDisciplineCase = {
    ...prev,
    commentaires: [
      ...prev.commentaires,
      {
        id: randomUUID(),
        auteur: auteur.trim() || '—',
        texte: trimmed,
        createdAt: new Date().toISOString(),
      },
    ],
    updatedAt: new Date().toISOString(),
  };
  store.cases[index] = next;
  await writeStore(store);
  return next;
}

export async function deleteDisciplineCase(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.cases.length;
  store.cases = store.cases.filter((c) => c.id !== id);
  if (store.cases.length === before) return false;
  await writeStore(store);
  return true;
}
