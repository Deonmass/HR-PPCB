import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_CLASSIFICATION_POSTES_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import {
  familyFromClassification,
  type ClassificationPoste,
  type ClassificationPosteInput,
} from './classification-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface StoreData {
  updatedAt: string;
  source: string;
  postes: ClassificationPoste[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'classification-postes.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'classification-postes.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'classification-postes.json');
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

function emptyStore(): StoreData {
  return {
    updatedAt: new Date().toISOString(),
    source: 'CLASSIFICATION FINAL Revised',
    postes: [],
  };
}

function toNum(raw: unknown): number | null {
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toText(raw: unknown): string {
  return String(raw ?? '').trim();
}

function normalizePoste(raw: unknown): ClassificationPoste | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ClassificationPoste>;
  if (!r.id && !r.title) return null;
  const classification = toText(r.classification);
  return {
    id: toText(r.id) || '',
    numero: toNum(r.numero),
    dateEval: toText(r.dateEval),
    departmentShort: toText(r.departmentShort),
    title: toText(r.title),
    instructions: toNum(r.instructions),
    experience: toNum(r.experience),
    initiative: toNum(r.initiative),
    responsabilite: toNum(r.responsabilite),
    commandement: toNum(r.commandement),
    discretion: toNum(r.discretion),
    effortPhysique: toNum(r.effortPhysique),
    effortMental: toNum(r.effortMental),
    conditionsTravail: toNum(r.conditionsTravail),
    risques: toNum(r.risques),
    total: toNum(r.total),
    gradePaterson: toText(r.gradePaterson),
    blueprint: toText(r.blueprint),
    classificationNationale: toText(r.classificationNationale),
    eventailPoints: toText(r.eventailPoints),
    gradeNouveau: toText(r.gradeNouveau),
    classification,
    family: familyFromClassification(classification),
    echelon: toNum(r.echelon),
    ecart: toNum(r.ecart),
    department: toText(r.department) || toText(r.departmentShort),
    location: toText(r.location),
  };
}

function nextId(postes: ClassificationPoste[]): string {
  let max = 0;
  for (const poste of postes) {
    const m = /^cls-(\d+)$/i.exec(poste.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `cls-${String(max + 1).padStart(3, '0')}`;
}

async function readStore(): Promise<StoreData> {
  const filePath = resolvePath();
  await hydrateDurableFile(DURABLE_CLASSIFICATION_POSTES_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const postes = Array.isArray(parsed.postes)
      ? parsed.postes
          .map(normalizePoste)
          .filter((p): p is ClassificationPoste => Boolean(p && p.id && p.title))
      : [];
    return {
      updatedAt: String(parsed.updatedAt || new Date().toISOString()),
      source: String(parsed.source || 'CLASSIFICATION FINAL Revised'),
      postes,
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyStore();
    throw err;
  }
}

async function writeStore(store: StoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(
    filePath,
    JSON.stringify(
      {
        updatedAt: new Date().toISOString(),
        source: store.source,
        postes: store.postes,
      },
      null,
      2,
    ),
    'utf8',
  );
  await persistDurableFile(DURABLE_CLASSIFICATION_POSTES_KEY, filePath);
}

function fromInput(input: ClassificationPosteInput, id: string): ClassificationPoste {
  const title = toText(input.title);
  if (!title) throw new Error('Le titre du poste est requis');
  const classification = toText(input.classification);
  return {
    id,
    numero: toNum(input.numero),
    dateEval: toText(input.dateEval),
    departmentShort: toText(input.departmentShort) || toText(input.department),
    title,
    instructions: toNum(input.instructions),
    experience: toNum(input.experience),
    initiative: toNum(input.initiative),
    responsabilite: toNum(input.responsabilite),
    commandement: toNum(input.commandement),
    discretion: toNum(input.discretion),
    effortPhysique: toNum(input.effortPhysique),
    effortMental: toNum(input.effortMental),
    conditionsTravail: toNum(input.conditionsTravail),
    risques: toNum(input.risques),
    total: toNum(input.total),
    gradePaterson: toText(input.gradePaterson),
    blueprint: toText(input.blueprint),
    classificationNationale: toText(input.classificationNationale),
    eventailPoints: toText(input.eventailPoints),
    gradeNouveau: toText(input.gradeNouveau),
    classification,
    family: familyFromClassification(classification),
    echelon: toNum(input.echelon),
    ecart: toNum(input.ecart),
    department: toText(input.department) || toText(input.departmentShort),
    location: toText(input.location),
  };
}

export async function listClassificationPostes(): Promise<ClassificationPoste[]> {
  const store = await readStore();
  return store.postes;
}

export async function createClassificationPoste(
  input: ClassificationPosteInput,
): Promise<ClassificationPoste> {
  const store = await readStore();
  const poste = fromInput(input, nextId(store.postes));
  store.postes.push(poste);
  await writeStore(store);
  return poste;
}

export async function updateClassificationPoste(
  id: string,
  input: ClassificationPosteInput,
): Promise<ClassificationPoste | null> {
  const store = await readStore();
  const index = store.postes.findIndex((p) => p.id === id);
  if (index < 0) return null;
  const poste = fromInput(input, id);
  store.postes[index] = poste;
  await writeStore(store);
  return poste;
}

export async function deleteClassificationPoste(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.postes.filter((p) => p.id !== id);
  if (next.length === store.postes.length) return false;
  store.postes = next;
  await writeStore(store);
  return true;
}
