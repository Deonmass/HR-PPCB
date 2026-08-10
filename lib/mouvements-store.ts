import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_MOUVEMENTS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { upsertEmployee, readEmployeesBundle } from './employees-json-store';
import type {
  Mouvement,
  MouvementInput,
  MouvementsDashboard,
  MouvementTypeId,
} from './mouvements-types';
import { isMouvementTypeId, mouvementTypeLabel } from './mouvements-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface StoreData {
  mouvements: Mouvement[];
  nextOrdre: number;
}

function resolveMouvementsPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'mouvements.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'mouvements.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'mouvements.json');
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

async function readStore(): Promise<StoreData> {
  const filePath = resolveMouvementsPath();
  await hydrateDurableFile(DURABLE_MOUVEMENTS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const list = Array.isArray(parsed.mouvements)
      ? parsed.mouvements.map(normalize).filter((m): m is Mouvement => Boolean(m))
      : [];
    const maxOrdre = list.reduce((max, m) => Math.max(max, m.numeroOrdre || 0), 0);
    const nextOrdre = Math.max(
      Number(parsed.nextOrdre) || 1,
      maxOrdre + 1,
    );
    return { mouvements: list, nextOrdre };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { mouvements: [], nextOrdre: 1 };
    throw err;
  }
}

async function writeStore(store: StoreData): Promise<void> {
  const filePath = resolveMouvementsPath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(
    filePath,
    JSON.stringify(
      {
        nextOrdre: store.nextOrdre,
        mouvements: store.mouvements,
      },
      null,
      2,
    ),
    'utf8',
  );
  await persistDurableFile(DURABLE_MOUVEMENTS_KEY, filePath);
}

function normalize(raw: unknown): Mouvement | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Mouvement>;
  if (!r.id) return null;
  const type: MouvementTypeId = isMouvementTypeId(String(r.type || ''))
    ? (r.type as MouvementTypeId)
    : 'autre';
  return {
    id: String(r.id),
    numeroOrdre: Number(r.numeroOrdre) || 0,
    agentMatricule: String(r.agentMatricule || '').trim(),
    agentNom: String(r.agentNom || '').trim(),
    posteAvant: String(r.posteAvant || '').trim(),
    departementAvant: String(r.departementAvant || '').trim(),
    posteActuel: String(r.posteActuel || '').trim(),
    departementActuel: String(r.departementActuel || '').trim(),
    date: String(r.date || '').trim(),
    type,
    notes: r.notes ? String(r.notes) : undefined,
    createdAt: String(r.createdAt || new Date().toISOString()),
    updatedAt: String(r.updatedAt || r.createdAt || new Date().toISOString()),
    createdBy: r.createdBy ? String(r.createdBy) : undefined,
  };
}

export async function listMouvements(): Promise<Mouvement[]> {
  const store = await readStore();
  return [...store.mouvements].sort((a, b) => {
    if (b.numeroOrdre !== a.numeroOrdre) return b.numeroOrdre - a.numeroOrdre;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function monthKey(isoOrDate: string): string {
  const s = isoOrDate.trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function yearOf(isoOrDate: string): number {
  const s = isoOrDate.trim();
  if (/^\d{4}/.test(s)) return Number(s.slice(0, 4));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? 0 : d.getFullYear();
}

export function buildMouvementsDashboard(items: Mouvement[]): MouvementsDashboard {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const currentYear = now.getFullYear();

  const parTypeMap = new Map<string, number>();
  const parDept = new Map<string, number>();

  for (const m of items) {
    parTypeMap.set(m.type, (parTypeMap.get(m.type) ?? 0) + 1);
    const dep = m.departementActuel || '—';
    parDept.set(dep, (parDept.get(dep) ?? 0) + 1);
  }

  return {
    total: items.length,
    thisMonth: items.filter((m) => monthKey(m.date) === currentMonth).length,
    thisYear: items.filter((m) => yearOf(m.date) === currentYear).length,
    nouvellesAffectations: items.filter((m) => m.type === 'nouvelle_affectation').length,
    promotions: items.filter((m) => m.type === 'promotion').length,
    transversaux: items.filter((m) => m.type === 'changement_transversal').length,
    parType: [...parTypeMap.entries()]
      .map(([id, count]) => ({ id, label: mouvementTypeLabel(id), count }))
      .sort((a, b) => b.count - a.count),
    parDepartementActuel: [...parDept.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    recents: [...items]
      .sort((a, b) => b.date.localeCompare(a.date) || b.numeroOrdre - a.numeroOrdre)
      .slice(0, 8),
  };
}

export async function createMouvement(
  input: MouvementInput,
  createdBy?: string,
): Promise<Mouvement> {
  const matricule = String(input.agentMatricule || '').trim();
  const nom = String(input.agentNom || '').trim();
  if (!matricule || !nom) throw new Error('Agent (matricule et nom) requis');
  if (!input.posteActuel?.trim()) throw new Error('Poste actuel requis');
  if (!input.date?.trim()) throw new Error('Date du mouvement requise');
  if (!isMouvementTypeId(String(input.type || ''))) throw new Error('Type de mouvement invalide');

  const store = await readStore();
  let posteAvant = String(input.posteAvant || '').trim();
  let departementAvant = String(input.departementAvant || '').trim();
  const posteActuel = String(input.posteActuel || '').trim();
  const departementActuel = String(input.departementActuel || '').trim();

  const applyToEmployee = input.applyToEmployee !== false;

  try {
    const { employees } = await readEmployeesBundle();
    const agent = employees.find(
      (e) => e.matricule.trim().toLowerCase() === matricule.toLowerCase(),
    );
    if (agent) {
      if (!posteAvant) posteAvant = agent.jobTitle || agent.position || '';
      if (!departementAvant) departementAvant = agent.departement || agent.departmentHr || '';
      if (applyToEmployee) {
        await upsertEmployee({
          ...agent,
          jobTitle: posteActuel || agent.jobTitle,
          position: posteActuel || agent.position,
          departement: departementActuel || agent.departement,
          departmentHr: departementActuel || agent.departmentHr,
        });
      }
    }
  } catch {
    // historique seul si fiche employé inaccessible
  }

  const now = new Date().toISOString();
  const mouvement: Mouvement = {
    id: `mvt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    numeroOrdre: store.nextOrdre,
    agentMatricule: matricule,
    agentNom: nom,
    posteAvant,
    departementAvant,
    posteActuel,
    departementActuel,
    date: String(input.date).trim(),
    type: input.type,
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
    createdBy,
  };

  store.mouvements.push(mouvement);
  store.nextOrdre += 1;
  await writeStore(store);
  return mouvement;
}

export async function updateMouvement(
  id: string,
  input: MouvementInput,
): Promise<Mouvement | null> {
  const store = await readStore();
  const index = store.mouvements.findIndex((m) => m.id === id);
  if (index < 0) return null;

  const matricule = String(input.agentMatricule || '').trim();
  const nom = String(input.agentNom || '').trim();
  if (!matricule || !nom) throw new Error('Agent (matricule et nom) requis');
  if (!input.posteActuel?.trim()) throw new Error('Poste actuel requis');
  if (!input.date?.trim()) throw new Error('Date du mouvement requise');
  if (!isMouvementTypeId(String(input.type || ''))) throw new Error('Type de mouvement invalide');

  const existing = store.mouvements[index];
  const posteActuel = String(input.posteActuel || '').trim();
  const departementActuel = String(input.departementActuel || '').trim();
  const applyToEmployee = input.applyToEmployee !== false;

  if (applyToEmployee) {
    try {
      const { employees } = await readEmployeesBundle();
      const agent = employees.find(
        (e) => e.matricule.trim().toLowerCase() === matricule.toLowerCase(),
      );
      if (agent) {
        await upsertEmployee({
          ...agent,
          jobTitle: posteActuel || agent.jobTitle,
          position: posteActuel || agent.position,
          departement: departementActuel || agent.departement,
          departmentHr: departementActuel || agent.departmentHr,
        });
      }
    } catch {
      // ignore employee update
    }
  }

  const updated: Mouvement = {
    ...existing,
    agentMatricule: matricule,
    agentNom: nom,
    posteAvant: String(input.posteAvant || '').trim(),
    departementAvant: String(input.departementAvant || '').trim(),
    posteActuel,
    departementActuel,
    date: String(input.date).trim(),
    type: input.type,
    notes: input.notes?.trim() || undefined,
    updatedAt: new Date().toISOString(),
  };

  store.mouvements[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteMouvement(id: string): Promise<boolean> {
  const store = await readStore();
  const next = store.mouvements.filter((m) => m.id !== id);
  if (next.length === store.mouvements.length) return false;
  store.mouvements = next;
  await writeStore(store);
  return true;
}
