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
  ContractantFamilyMember,
  ContractantInput,
} from './contractants-types';
import {
  isContractantEmployeeStatut,
  isContractantEtatCivil,
  isContractantSexe,
} from './contractants-types';
import { inferFemaleSexeFromName } from './contractants-gender';
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

function normalizeFamilyMember(raw: unknown): ContractantFamilyMember | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ContractantFamilyMember>;
  const nom = String(r.nom || '').trim();
  if (!nom) return null;
  const sexeRaw = String(r.sexe || '').trim().toUpperCase();
  return {
    id: String(r.id || randomUUID()),
    nom,
    lien: String(r.lien || 'Autre').trim() || 'Autre',
    dateNaissance: String(r.dateNaissance || '').trim(),
    sexe: isContractantSexe(sexeRaw) ? sexeRaw : '',
  };
}

function normalizeEmployee(raw: unknown): ContractantEmployee | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ContractantEmployee> & { statut?: string };
  if (!r.id) return null;
  const sexeRaw = String(r.sexe || '').trim().toUpperCase();
  const sexe = isContractantSexe(sexeRaw) ? sexeRaw : '';
  const etatRaw = String(r.etatCivil || '').trim().toUpperCase();
  const etatCivil = isContractantEtatCivil(etatRaw) ? etatRaw : 'C';
  const statutRaw = String(r.statut || '').trim();
  const statut = isContractantEmployeeStatut(statutRaw) ? statutRaw : 'Permanent';
  let fonction = String(r.fonction || '').trim();
  // MALANGA / KIMPESE / etc. sont des lieux, pas des fonctions.
  if (isLocalisationLabel(fonction)) fonction = '';
  const family = Array.isArray(r.family)
    ? r.family.map(normalizeFamilyMember).filter((m): m is ContractantFamilyMember => Boolean(m))
    : [];
  const payrollSiteRaw = String(r.payrollSite || '').trim().toLowerCase();
  const payrollSite =
    payrollSiteRaw === 'site' || payrollSiteRaw === 'hors-site'
      ? payrollSiteRaw
      : '';
  return {
    id: String(r.id),
    nom: String(r.nom || '').trim(),
    sexe,
    lieuAffectation: normalizeLocalisation(r.lieuAffectation),
    fonction,
    departement: String(r.departement || '').trim(),
    service: String(r.service || '').trim(),
    telephone: String(r.telephone || '').trim(),
    etatCivil,
    statut,
    dateEmbauche: String(r.dateEmbauche || '').trim(),
    dateSortie: String(r.dateSortie || '').trim(),
    managerEmployeeId: String(r.managerEmployeeId || '').trim(),
    family,
    matriculePpc: String(r.matriculePpc || '').trim(),
    numeroCnss: String(r.numeroCnss || '').trim(),
    numeroCompte: String(r.numeroCompte || '').trim(),
    banque: String(r.banque || '').trim(),
    nbDependants: Math.max(0, Math.round(Number(r.nbDependants) || 0)),
    txJr: Number.isFinite(Number(r.txJr)) ? Number(r.txJr) : 0,
    coutTransport: Number.isFinite(Number(r.coutTransport)) ? Number(r.coutTransport) : 0,
    payrollSite,
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
  if (sexeRaw && !isContractantSexe(sexeRaw)) throw new Error('Sexe invalide');
  if (!lieuAffectation) throw new Error('Lieu d’affectation requis');
  if (!isContractantEtatCivil(etatRaw)) throw new Error('État civil invalide');
  if (!isContractantEmployeeStatut(statutRaw)) {
    throw new Error('Statut invalide (Permanent ou Journalier)');
  }
  return {
    nom,
    sexe: inferFemaleSexeFromName(nom, isContractantSexe(sexeRaw) ? sexeRaw : ''),
    lieuAffectation,
    fonction,
    departement,
    service: String(input.service || '').trim(),
    telephone,
    etatCivil: etatRaw,
    statut: statutRaw,
    dateEmbauche: String(input.dateEmbauche || '').trim(),
    dateSortie: String(input.dateSortie || '').trim(),
    managerEmployeeId: String(input.managerEmployeeId || '').trim(),
    family: Array.isArray(input.family)
      ? input.family.map(normalizeFamilyMember).filter((m): m is ContractantFamilyMember => Boolean(m))
      : [],
    matriculePpc: String(input.matriculePpc || '').trim(),
    numeroCnss: String(input.numeroCnss || '').trim(),
    numeroCompte: String(input.numeroCompte || '').trim(),
    banque: String(input.banque || '').trim(),
    nbDependants: Math.max(0, Math.round(Number(input.nbDependants) || 0)),
    txJr: Number.isFinite(Number(input.txJr)) ? Number(input.txJr) : 0,
    coutTransport: Number.isFinite(Number(input.coutTransport)) ? Number(input.coutTransport) : 0,
    payrollSite:
      input.payrollSite === 'site' || input.payrollSite === 'hors-site' ? input.payrollSite : '',
  };
}

/** Écrit les MSISDN airtime sur les employés contractants déjà rapprochés. */
export async function applyContractantPhones(
  updates: { contractantId: string; employeeId: string; telephone: string }[],
): Promise<number> {
  const pending = updates.filter((item) => item.contractantId && item.employeeId && item.telephone.trim());
  if (!pending.length) return 0;
  const store = await readStore();
  const now = new Date().toISOString();
  let changed = 0;
  for (const update of pending) {
    const contractant = store.contractants.find((item) => item.id === update.contractantId);
    const employee = contractant?.employees.find((item) => item.id === update.employeeId);
    if (!employee) continue;
    const next = update.telephone.trim();
    if ((employee.telephone || '') === next) continue;
    employee.telephone = next;
    employee.updatedAt = now;
    if (contractant) contractant.updatedAt = now;
    changed += 1;
  }
  if (changed > 0) await writeStore(store);
  return changed;
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
    service: data.service || '',
    telephone: data.telephone,
    etatCivil: data.etatCivil,
    statut: data.statut,
    dateEmbauche: data.dateEmbauche || '',
    dateSortie: data.dateSortie || '',
    managerEmployeeId: data.managerEmployeeId || '',
    family: data.family || [],
    matriculePpc: data.matriculePpc || '',
    numeroCnss: data.numeroCnss || '',
    numeroCompte: data.numeroCompte || '',
    banque: data.banque || '',
    nbDependants: data.nbDependants || 0,
    txJr: data.txJr || 0,
    coutTransport: data.coutTransport || 0,
    payrollSite: data.payrollSite || '',
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
    service: data.service || '',
    telephone: data.telephone,
    etatCivil: data.etatCivil,
    statut: data.statut,
    dateEmbauche: data.dateEmbauche ?? prev.dateEmbauche,
    dateSortie: data.dateSortie ?? prev.dateSortie,
    managerEmployeeId: data.managerEmployeeId ?? prev.managerEmployeeId,
    family: data.family ?? prev.family,
    matriculePpc: data.matriculePpc || prev.matriculePpc || '',
    numeroCnss: data.numeroCnss || prev.numeroCnss || '',
    numeroCompte: data.numeroCompte || prev.numeroCompte || '',
    banque: data.banque || prev.banque || '',
    nbDependants:
      input.nbDependants !== undefined ? data.nbDependants || 0 : prev.nbDependants || 0,
    txJr: input.txJr !== undefined ? data.txJr || 0 : prev.txJr || 0,
    coutTransport:
      input.coutTransport !== undefined ? data.coutTransport || 0 : prev.coutTransport || 0,
    payrollSite: data.payrollSite || prev.payrollSite || '',
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

function normalizeEmployeeNameKey(nom: string): string {
  return nom
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Import Excel : ajoute les nouveaux employés et ignore ceux déjà présents (même nom).
 */
export async function importContractantEmployees(
  contractantId: string,
  inputs: ContractantEmployeeInput[],
): Promise<{
  contractant: Contractant;
  imported: number;
  alreadyPresent: string[];
  skippedEmpty: number;
} | null> {
  const store = await readStore();
  const index = store.contractants.findIndex((c) => c.id === contractantId);
  if (index < 0) return null;

  const prev = store.contractants[index]!;
  const now = new Date().toISOString();
  const employees = [...prev.employees];
  const knownNames = new Set(employees.map((e) => normalizeEmployeeNameKey(e.nom)).filter(Boolean));
  const alreadyPresent: string[] = [];
  const alreadyPresentKeys = new Set<string>();
  let imported = 0;
  let skippedEmpty = 0;

  for (const input of inputs) {
    const nom = String(input.nom || '').trim();
    if (!nom) {
      skippedEmpty += 1;
      continue;
    }
    const key = normalizeEmployeeNameKey(nom);
    if (!key) {
      skippedEmpty += 1;
      continue;
    }
    if (knownNames.has(key)) {
      if (!alreadyPresentKeys.has(key)) {
        alreadyPresentKeys.add(key);
        alreadyPresent.push(nom);
      }
      continue;
    }
    knownNames.add(key);
    const sexeRaw = String(input.sexe || '').trim().toUpperCase();
    const etatRaw = String(input.etatCivil || '').trim().toUpperCase();
    const statutRaw = String(input.statut || '').trim();
    let id = String(store.nextEmployeeId++);
    if (employees.some((e) => e.id === id)) id = randomUUID();
    employees.push({
      id,
      nom,
      sexe: inferFemaleSexeFromName(nom, isContractantSexe(sexeRaw) ? sexeRaw : ''),
      lieuAffectation: normalizeLocalisation(input.lieuAffectation),
      fonction: isLocalisationLabel(input.fonction) ? '' : String(input.fonction || '').trim(),
      departement: String(input.departement || '').trim(),
      service: String(input.service || '').trim(),
      telephone: String(input.telephone || '').trim(),
      etatCivil: isContractantEtatCivil(etatRaw) ? etatRaw : 'C',
      statut: isContractantEmployeeStatut(statutRaw) ? statutRaw : 'Permanent',
      dateEmbauche: String(input.dateEmbauche || '').trim(),
      dateSortie: String(input.dateSortie || '').trim(),
      managerEmployeeId: '',
      family: [],
      matriculePpc: '',
      numeroCnss: '',
      numeroCompte: '',
      banque: '',
      nbDependants: 0,
      txJr: 0,
      coutTransport: 0,
      payrollSite: '',
      createdAt: now,
      updatedAt: now,
    });
    imported += 1;
  }

  if (imported === 0 && alreadyPresent.length === 0 && skippedEmpty === inputs.length) {
    throw new Error('Aucune ligne employé valide dans le fichier');
  }

  const next: Contractant = {
    ...prev,
    employees,
    updatedAt: now,
  };
  store.contractants[index] = next;
  await writeStore(store);
  return {
    contractant: next,
    imported,
    alreadyPresent: alreadyPresent.sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' })),
    skippedEmpty,
  };
}

/** @deprecated Prefer importContractantEmployees (merge). Kept for callers that need full replace. */
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
      sexe: inferFemaleSexeFromName(nom, isContractantSexe(sexeRaw) ? sexeRaw : ''),
      lieuAffectation: normalizeLocalisation(input.lieuAffectation),
      fonction: isLocalisationLabel(input.fonction) ? '' : String(input.fonction || '').trim(),
      departement: String(input.departement || '').trim(),
      service: String(input.service || '').trim(),
      telephone: String(input.telephone || '').trim(),
      etatCivil: isContractantEtatCivil(etatRaw) ? etatRaw : 'C',
      statut: isContractantEmployeeStatut(statutRaw) ? statutRaw : 'Permanent',
      dateEmbauche: String(input.dateEmbauche || '').trim(),
      dateSortie: String(input.dateSortie || '').trim(),
      managerEmployeeId: '',
      family: [],
      matriculePpc: '',
      numeroCnss: '',
      numeroCompte: '',
      banque: '',
      nbDependants: 0,
      txJr: 0,
      coutTransport: 0,
      payrollSite: '',
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
