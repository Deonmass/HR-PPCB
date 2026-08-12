import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_CONTRACTANTS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import type {
  Contractant,
  ContractantEmployee,
  ContractantEmployeeInput,
  ContractantInput,
} from './contractants-types';
import {
  isContractantEmployeeStatut,
  isContractantEtatCivil,
  isContractantSexe,
} from './contractants-types';
import { isLocalisationLabel, normalizeLocalisation } from './localisations';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import { randomUUID } from 'crypto';

interface StoreData {
  nextContractantId: number;
  nextEmployeeId: number;
  contractants: Contractant[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'contractants.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'contractants.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'contractants.json');
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
  return { nextContractantId: 1, nextEmployeeId: 1, contractants: [] };
}

function normalizeEmployee(raw: unknown): ContractantEmployee | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ContractantEmployee> & { statut?: string };
  if (!r.id) return null;
  const sexeRaw = String(r.sexe || '').trim().toUpperCase();
  const sexe = isContractantSexe(sexeRaw) ? sexeRaw : 'M';
  const etatRaw = String(r.etatCivil || '').trim().toUpperCase();
  const etatCivil = isContractantEtatCivil(etatRaw) ? etatRaw : 'C';
  const statutRaw = String(r.statut || '').trim();
  const statut = isContractantEmployeeStatut(statutRaw) ? statutRaw : 'Permanent';
  let fonction = String(r.fonction || '').trim();
  // MALANGA / KIMPESE / etc. sont des lieux, pas des fonctions.
  if (isLocalisationLabel(fonction)) fonction = '';
  return {
    id: String(r.id),
    nom: String(r.nom || '').trim(),
    sexe,
    lieuAffectation: normalizeLocalisation(r.lieuAffectation),
    fonction,
    departement: String(r.departement || '').trim(),
    telephone: String(r.telephone || '').trim(),
    etatCivil,
    statut,
    createdAt: String(r.createdAt || new Date().toISOString()),
    updatedAt: String(r.updatedAt || r.createdAt || new Date().toISOString()),
  };
}

function normalizeContractant(raw: unknown): Contractant | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<Contractant>;
  if (!r.id) return null;
  const employees = Array.isArray(r.employees)
    ? r.employees.map(normalizeEmployee).filter((e): e is ContractantEmployee => Boolean(e))
    : [];
  return {
    id: String(r.id),
    denomination: String(r.denomination || '').trim(),
    typeService: String(r.typeService || '').trim(),
    employees,
    createdAt: String(r.createdAt || new Date().toISOString()),
    updatedAt: String(r.updatedAt || r.createdAt || new Date().toISOString()),
  };
}

async function readStore(): Promise<StoreData> {
  const filePath = resolvePath();
  await hydrateDurableFile(DURABLE_CONTRACTANTS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const contractants = Array.isArray(parsed.contractants)
      ? parsed.contractants.map(normalizeContractant).filter((c): c is Contractant => Boolean(c))
      : [];
    const maxC = contractants.reduce((max, c) => {
      const n = Number(c.id);
      return Number.isFinite(n) ? Math.max(max, n) : max;
    }, 0);
    const maxE = contractants.reduce((max, c) => {
      for (const e of c.employees) {
        const n = Number(e.id);
        if (Number.isFinite(n)) max = Math.max(max, n);
      }
      return max;
    }, 0);
    return {
      contractants,
      nextContractantId: Math.max(Number(parsed.nextContractantId) || 1, maxC + 1),
      nextEmployeeId: Math.max(Number(parsed.nextEmployeeId) || 1, maxE + 1),
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
        nextContractantId: store.nextContractantId,
        nextEmployeeId: store.nextEmployeeId,
        contractants: store.contractants,
      },
      null,
      2,
    ),
    'utf8',
  );
  await persistDurableFile(DURABLE_CONTRACTANTS_KEY, filePath);
}

function validateContractantInput(input: ContractantInput): ContractantInput {
  const denomination = String(input.denomination || '').trim();
  const typeService = String(input.typeService || '').trim();
  if (!denomination) throw new Error('Dénomination requise');
  if (!typeService) throw new Error('Type de service requis');
  return { denomination, typeService };
}

function validateEmployeeInput(input: ContractantEmployeeInput): ContractantEmployeeInput {
  const nom = String(input.nom || '').trim();
  const sexeRaw = String(input.sexe || '').trim().toUpperCase();
  const lieuRaw = String(input.lieuAffectation || '').trim();
  const lieuAffectation = normalizeLocalisation(lieuRaw);
  let fonction = String(input.fonction || '').trim();
  if (isLocalisationLabel(fonction)) fonction = '';
  const departement = String(input.departement || '').trim();
  const telephone = String(input.telephone || '').trim();
  const etatRaw = String(input.etatCivil || '').trim().toUpperCase();
  const statutRaw = String(input.statut || '').trim();
  if (!nom) throw new Error('Nom requis');
  if (!isContractantSexe(sexeRaw)) throw new Error('Sexe invalide');
  if (!lieuAffectation) throw new Error('Lieu d’affectation requis');
  if (!departement) throw new Error('Département requis');
  if (!isContractantEtatCivil(etatRaw)) throw new Error('État civil invalide');
  if (!isContractantEmployeeStatut(statutRaw)) {
    throw new Error('Statut invalide (Permanent ou Journalier)');
  }
  return {
    nom,
    sexe: sexeRaw,
    lieuAffectation,
    fonction,
    departement,
    telephone,
    etatCivil: etatRaw,
    statut: statutRaw,
  };
}

export async function listContractants(): Promise<Contractant[]> {
  const store = await readStore();
  return [...store.contractants].sort((a, b) =>
    a.denomination.localeCompare(b.denomination, 'fr', { sensitivity: 'base' }),
  );
}

export async function getContractant(id: string): Promise<Contractant | null> {
  const store = await readStore();
  return store.contractants.find((c) => c.id === id) ?? null;
}

export async function createContractant(input: ContractantInput): Promise<Contractant> {
  const data = validateContractantInput(input);
  const store = await readStore();
  const now = new Date().toISOString();
  const record: Contractant = {
    id: String(store.nextContractantId++),
    denomination: data.denomination,
    typeService: data.typeService,
    employees: [],
    createdAt: now,
    updatedAt: now,
  };
  store.contractants.push(record);
  await writeStore(store);
  return record;
}

export async function updateContractant(
  id: string,
  input: ContractantInput,
): Promise<Contractant | null> {
  const data = validateContractantInput(input);
  const store = await readStore();
  const index = store.contractants.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.contractants[index]!;
  const next: Contractant = {
    ...prev,
    denomination: data.denomination,
    typeService: data.typeService,
    updatedAt: new Date().toISOString(),
  };
  store.contractants[index] = next;
  await writeStore(store);
  return next;
}

export async function deleteContractant(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.contractants.length;
  store.contractants = store.contractants.filter((c) => c.id !== id);
  if (store.contractants.length === before) return false;
  await writeStore(store);
  return true;
}

export async function createContractantEmployee(
  contractantId: string,
  input: ContractantEmployeeInput,
): Promise<ContractantEmployee | null> {
  const data = validateEmployeeInput(input);
  const store = await readStore();
  const contractant = store.contractants.find((c) => c.id === contractantId);
  if (!contractant) return null;
  const now = new Date().toISOString();
  const employee: ContractantEmployee = {
    id: String(store.nextEmployeeId++),
    nom: data.nom,
    sexe: data.sexe,
    lieuAffectation: data.lieuAffectation,
    fonction: data.fonction,
    departement: data.departement,
    telephone: data.telephone,
    etatCivil: data.etatCivil,
    statut: data.statut,
    createdAt: now,
    updatedAt: now,
  };
  // Prefer sequential ids; UUID fallback if collision
  if (contractant.employees.some((e) => e.id === employee.id)) {
    employee.id = randomUUID();
  }
  contractant.employees.push(employee);
  contractant.updatedAt = now;
  await writeStore(store);
  return employee;
}

export async function updateContractantEmployee(
  contractantId: string,
  employeeId: string,
  input: ContractantEmployeeInput,
): Promise<ContractantEmployee | null> {
  const data = validateEmployeeInput(input);
  const store = await readStore();
  const contractant = store.contractants.find((c) => c.id === contractantId);
  if (!contractant) return null;
  const index = contractant.employees.findIndex((e) => e.id === employeeId);
  if (index < 0) return null;
  const prev = contractant.employees[index]!;
  const next: ContractantEmployee = {
    ...prev,
    nom: data.nom,
    sexe: data.sexe,
    lieuAffectation: data.lieuAffectation,
    fonction: data.fonction,
    departement: data.departement,
    telephone: data.telephone,
    etatCivil: data.etatCivil,
    statut: data.statut,
    updatedAt: new Date().toISOString(),
  };
  contractant.employees[index] = next;
  contractant.updatedAt = next.updatedAt;
  await writeStore(store);
  return next;
}

export async function deleteContractantEmployee(
  contractantId: string,
  employeeId: string,
): Promise<boolean> {
  const store = await readStore();
  const contractant = store.contractants.find((c) => c.id === contractantId);
  if (!contractant) return false;
  const before = contractant.employees.length;
  contractant.employees = contractant.employees.filter((e) => e.id !== employeeId);
  if (contractant.employees.length === before) return false;
  contractant.updatedAt = new Date().toISOString();
  await writeStore(store);
  return true;
}

/** Remplace la liste des employés d’un contractant (import Excel = source de vérité). */
export async function replaceContractantEmployees(
  contractantId: string,
  inputs: ContractantEmployeeInput[],
): Promise<{ contractant: Contractant; imported: number } | null> {
  const store = await readStore();
  const index = store.contractants.findIndex((c) => c.id === contractantId);
  if (index < 0) return null;

  const now = new Date().toISOString();
  const employees: ContractantEmployee[] = [];
  for (const input of inputs) {
    const nom = String(input.nom || '').trim();
    if (!nom) continue;
    const sexeRaw = String(input.sexe || '').trim().toUpperCase();
    const etatRaw = String(input.etatCivil || '').trim().toUpperCase();
    const statutRaw = String(input.statut || '').trim();
    let id = String(store.nextEmployeeId++);
    if (employees.some((e) => e.id === id)) id = randomUUID();
    employees.push({
      id,
      nom,
      sexe: isContractantSexe(sexeRaw) ? sexeRaw : 'M',
      lieuAffectation: normalizeLocalisation(input.lieuAffectation),
      fonction: isLocalisationLabel(input.fonction) ? '' : String(input.fonction || '').trim(),
      departement: String(input.departement || '').trim(),
      telephone: String(input.telephone || '').trim(),
      etatCivil: isContractantEtatCivil(etatRaw) ? etatRaw : 'C',
      statut: isContractantEmployeeStatut(statutRaw) ? statutRaw : 'Permanent',
      createdAt: now,
      updatedAt: now,
    });
  }

  if (employees.length === 0) {
    throw new Error('Aucune ligne employé valide dans le fichier');
  }

  const prev = store.contractants[index]!;
  const next: Contractant = {
    ...prev,
    employees,
    updatedAt: now,
  };
  store.contractants[index] = next;
  await writeStore(store);
  return { contractant: next, imported: employees.length };
}
