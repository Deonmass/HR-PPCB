import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_CONGE_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { readEmployees } from './employees-json-store';
import { parseCongeWorkbookFromBuffer } from './conge-import';
import {
  isOnOrAfterHire,
  isSundayIso,
  normalizeDayCodeInput,
  overlayCongeIdentity,
} from './conge-rules';
import {
  CONGE_STORE_VERSION,
  DEFAULT_CONGE_GRADES,
  DEFAULT_CONGE_SENIORITY_BANDS,
  emptyCongeStore,
  isCongeStoredDayCode,
  type CongeBundle,
  type CongeDayPatch,
  type CongeEmployeeRecord,
  type CongeGradeRow,
  type CongeHrIdentity,
  type CongeSeniorityBand,
  type CongeStoreData,
} from './conge-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

function resolveCongePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'conge.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'conge.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'conge.json');
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

function toNum(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  const n = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function toText(raw: unknown): string {
  return String(raw ?? '').trim();
}

function normalizeGradeRow(raw: unknown): CongeGradeRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CongeGradeRow>;
  const grade = toText(r.grade).toUpperCase();
  if (!grade) return null;
  const joursAnnuels = toNum(r.joursAnnuels);
  const joursParMois = toNum(r.joursParMois, joursAnnuels / 12);
  return {
    grade,
    categorie: toText(r.categorie),
    joursAnnuels,
    joursParMois: joursParMois || joursAnnuels / 12,
    limiteAnnee: toNum(r.limiteAnnee),
  };
}

function normalizeBand(raw: unknown): CongeSeniorityBand | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CongeSeniorityBand>;
  const minYears = toNum(r.minYears, Number.NaN);
  if (!Number.isFinite(minYears)) return null;
  const extraDaysPerYear = toNum(r.extraDaysPerYear);
  const extraPerMonth = toNum(r.extraPerMonth, extraDaysPerYear / 12);
  return {
    label: toText(r.label) || String(minYears),
    minYears,
    extraDaysPerYear,
    extraPerMonth,
  };
}

function normalizeDays(raw: unknown): CongeEmployeeRecord['days'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: CongeEmployeeRecord['days'] = {};
  for (const [iso, code] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    const v = String(code || '').trim().toUpperCase();
    if (isCongeStoredDayCode(v)) out[iso] = v;
  }
  return out;
}

function normalizeEmployee(raw: unknown): CongeEmployeeRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<CongeEmployeeRecord>;
  const matricule = toText(r.matricule);
  if (!matricule || !/^\d+$/.test(matricule)) return null;
  return {
    matricule,
    nom: toText(r.nom),
    sexe: toText(r.sexe),
    departement: toText(r.departement),
    position: toText(r.position),
    grade: toText(r.grade).toUpperCase(),
    appointmentDate: toText(r.appointmentDate),
    openingBalance: toNum(r.openingBalance),
    days: normalizeDays(r.days),
  };
}

function normalizeStore(raw: unknown): CongeStoreData {
  const fallback = emptyCongeStore();
  if (!raw || typeof raw !== 'object') return fallback;
  const r = raw as Partial<CongeStoreData>;
  const grades = Array.isArray(r.grades)
    ? r.grades.map(normalizeGradeRow).filter((g): g is CongeGradeRow => Boolean(g))
    : [];
  const bands = Array.isArray(r.seniorityBands)
    ? r.seniorityBands.map(normalizeBand).filter((b): b is CongeSeniorityBand => Boolean(b))
    : [];
  const employees = Array.isArray(r.employees)
    ? r.employees.map(normalizeEmployee).filter((e): e is CongeEmployeeRecord => Boolean(e))
    : [];
  const exerciseYear = toNum(r.exerciseYear, fallback.exerciseYear);
  return {
    version: CONGE_STORE_VERSION,
    exerciseYear,
    rangeStart: toText(r.rangeStart) || fallback.rangeStart,
    rangeEnd: toText(r.rangeEnd) || fallback.rangeEnd,
    source: toText(r.source),
    updatedAt: toText(r.updatedAt) || new Date().toISOString(),
    grades: grades.length ? grades : DEFAULT_CONGE_GRADES.map((row) => ({ ...row })),
    seniorityBands: bands.length ? bands : DEFAULT_CONGE_SENIORITY_BANDS.map((row) => ({ ...row })),
    employees,
  };
}

async function readStore(): Promise<CongeStoreData> {
  const filePath = resolveCongePath();
  await hydrateDurableFile(DURABLE_CONGE_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return normalizeStore(JSON.parse(raw) as unknown);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyCongeStore();
    throw err;
  }
}

async function writeStore(store: CongeStoreData): Promise<void> {
  const filePath = resolveCongePath();
  const payload: CongeStoreData = {
    ...store,
    version: CONGE_STORE_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
  await persistDurableFile(DURABLE_CONGE_KEY, filePath);
}

function toHrIdentity(emp: {
  matricule: string;
  nom: string;
  departement: string;
  departmentHr?: string;
  grade: string;
  patersonGrade?: string;
  jobTitle: string;
  position?: string;
  gender: string;
  appointmentDate: string;
}): CongeHrIdentity {
  return {
    matricule: emp.matricule,
    nom: emp.nom,
    departement: emp.departement,
    departmentHr: emp.departmentHr,
    grade: emp.grade,
    patersonGrade: emp.patersonGrade,
    jobTitle: emp.jobTitle,
    position: emp.position,
    gender: emp.gender,
    appointmentDate: emp.appointmentDate,
  };
}

export async function readCongeStore(): Promise<CongeStoreData> {
  return readStore();
}

export async function writeCongeStore(store: CongeStoreData): Promise<CongeStoreData> {
  const next = normalizeStore(store);
  await writeStore(next);
  return next;
}

export async function getCongeBundle(): Promise<CongeBundle> {
  const store = await readStore();
  let hrByMatricule = new Map<string, CongeHrIdentity>();
  try {
    const employees = await readEmployees();
    hrByMatricule = new Map(
      employees.map((emp) => [emp.matricule.trim().toLowerCase(), toHrIdentity(emp)]),
    );
  } catch {
    // overlay optionnel si le fichier RH est inaccessible
  }

  return {
    exerciseYear: store.exerciseYear,
    rangeStart: store.rangeStart,
    rangeEnd: store.rangeEnd,
    source: store.source,
    updatedAt: store.updatedAt,
    grades: store.grades,
    seniorityBands: store.seniorityBands,
    employees: store.employees.map((row) =>
      overlayCongeIdentity(row, hrByMatricule.get(row.matricule.trim().toLowerCase())),
    ),
  };
}

export async function importCongeWorkbook(
  buffer: Buffer | ArrayBuffer | Uint8Array,
  source = 'import',
): Promise<CongeStoreData> {
  const parsed = await parseCongeWorkbookFromBuffer(buffer, source);
  await writeStore(parsed.store);
  return parsed.store;
}

export async function patchCongeDays(patches: CongeDayPatch[]): Promise<CongeStoreData> {
  if (!Array.isArray(patches) || patches.length === 0) {
    throw new Error('Aucune modification');
  }
  const store = await readStore();
  const indexByMatricule = new Map(store.employees.map((row, index) => [row.matricule, index]));
  let hrByMatricule = new Map<string, CongeHrIdentity>();
  try {
    const employees = await readEmployees();
    hrByMatricule = new Map(
      employees.map((emp) => [emp.matricule.trim().toLowerCase(), toHrIdentity(emp)]),
    );
  } catch {
    // overlay optionnel
  }

  for (const patch of patches) {
    const matricule = String(patch.matricule || '').trim();
    const iso = String(patch.iso || '').trim().slice(0, 10);
    if (!matricule) throw new Error('Matricule requis');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Date invalide');
    const idx = indexByMatricule.get(matricule);
    if (idx == null) throw new Error(`Agent ${matricule} introuvable`);
    const record = store.employees[idx];
    const view = overlayCongeIdentity(
      record,
      hrByMatricule.get(record.matricule.trim().toLowerCase()),
    );
    if (isSundayIso(iso)) throw new Error('Dimanche : cellule vide');
    if (!isOnOrAfterHire(iso, view.appointmentDate)) {
      throw new Error('Avant date d’embauche');
    }
    const code = normalizeDayCodeInput(patch.code);
    const days = { ...record.days };
    if (!code || code === 'IN') delete days[iso];
    else if (isCongeStoredDayCode(code)) days[iso] = code;
    else throw new Error('Code invalide');
    store.employees[idx] = { ...record, days };
  }

  await writeStore(store);
  return store;
}

export async function saveCongeRules(
  grades: CongeGradeRow[],
  seniorityBands: CongeSeniorityBand[],
): Promise<CongeStoreData> {
  const store = await readStore();
  const nextGrades = (grades || []).map(normalizeGradeRow).filter((row): row is CongeGradeRow => Boolean(row));
  const nextBands = (seniorityBands || [])
    .map(normalizeBand)
    .filter((row): row is CongeSeniorityBand => Boolean(row));
  if (!nextGrades.length) throw new Error('Barème de grades requis');
  store.grades = nextGrades;
  store.seniorityBands = nextBands.length
    ? nextBands
    : DEFAULT_CONGE_SENIORITY_BANDS.map((row) => ({ ...row }));
  await writeStore(store);
  return store;
}
