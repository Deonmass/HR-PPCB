import 'server-only';

import { randomUUID } from 'crypto';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { DURABLE_WORK_VISAS_KEY, hydrateDurableFile, persistDurableFile } from './durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';
import type {
  WorkVisaBundle,
  WorkVisaDocKind,
  WorkVisaDocumentInput,
  WorkVisaDocumentSlot,
  WorkVisaDocumentVersion,
  WorkVisaDossier,
  WorkVisaDossierInput,
  WorkVisaDossierStatus,
  WorkVisaDossierView,
  WorkVisaFilterOptions,
  WorkVisaKpis,
  WorkVisaListQuery,
  WorkVisaReport,
  WorkVisaStoreData,
} from './work-visa-types';
import { computeValidity, inferIsExpat, todayIsoDate } from './work-visa-validity';

function resolveStorePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'protocol', 'work-visas', 'store.json');
  }
  const writable = path.join(getWritableDataRoot(), 'protocol', 'work-visas', 'store.json');
  const bundled = path.join(process.cwd(), 'data', 'protocol', 'work-visas', 'store.json');
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

function emptyStore(): WorkVisaStoreData {
  return { meta: { version: 1 }, dossiers: [] };
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function nowIso(): string {
  return new Date().toISOString();
}

function emptySlot(): WorkVisaDocumentSlot {
  return { current: null, history: [] };
}

function normalizeStatus(value: unknown): WorkVisaDossierStatus {
  return str(value).toLowerCase() === 'inactif' ? 'inactif' : 'actif';
}

function normalizeDocInput(raw: WorkVisaDocumentInput | null | undefined): WorkVisaDocumentVersion | null {
  if (!raw) return null;
  const number = str(raw.number);
  const expiryDate = str(raw.expiryDate).slice(0, 10);
  if (!number && !expiryDate) return null;
  if (!expiryDate) {
    throw new Error('Date d’expiration requise pour le document');
  }
  return {
    id: randomUUID(),
    number: number || '—',
    type: str(raw.type) || undefined,
    issueDate: str(raw.issueDate).slice(0, 10) || undefined,
    startDate: str(raw.startDate).slice(0, 10) || undefined,
    expiryDate,
  };
}

function normalizeSlot(raw: unknown): WorkVisaDocumentSlot {
  if (!raw || typeof raw !== 'object') return emptySlot();
  const obj = raw as Partial<WorkVisaDocumentSlot>;
  const history = Array.isArray(obj.history)
    ? obj.history
        .filter((item): item is WorkVisaDocumentVersion => Boolean(item && typeof item === 'object'))
        .map((item) => ({
          id: str(item.id) || randomUUID(),
          number: str(item.number) || '—',
          type: str(item.type) || undefined,
          issueDate: str(item.issueDate).slice(0, 10) || undefined,
          startDate: str(item.startDate).slice(0, 10) || undefined,
          expiryDate: str(item.expiryDate).slice(0, 10),
          archivedAt: str(item.archivedAt) || undefined,
        }))
        .filter((item) => item.expiryDate)
    : [];
  let current: WorkVisaDocumentVersion | null = null;
  if (obj.current && typeof obj.current === 'object') {
    const expiryDate = str(obj.current.expiryDate).slice(0, 10);
    if (expiryDate) {
      current = {
        id: str(obj.current.id) || randomUUID(),
        number: str(obj.current.number) || '—',
        type: str(obj.current.type) || undefined,
        issueDate: str(obj.current.issueDate).slice(0, 10) || undefined,
        startDate: str(obj.current.startDate).slice(0, 10) || undefined,
        expiryDate,
        archivedAt: str(obj.current.archivedAt) || undefined,
      };
    }
  }
  return { current, history };
}

function normalizeDossier(raw: Partial<WorkVisaDossier> & { id?: string }): WorkVisaDossier | null {
  const matricule = str(raw.matricule);
  const nom = str(raw.nom);
  if (!matricule || !nom) return null;
  const nationalite = str(raw.nationalite);
  const isExpat =
    typeof raw.isExpat === 'boolean' ? raw.isExpat : inferIsExpat(nationalite);
  return {
    id: str(raw.id) || randomUUID(),
    matricule,
    nom,
    prenom: str(raw.prenom),
    centreCout: str(raw.centreCout),
    sexe: str(raw.sexe),
    nationalite,
    isExpat,
    status: normalizeStatus(raw.status),
    passport: normalizeSlot(raw.passport),
    workVisa: normalizeSlot(raw.workVisa),
    workCard: normalizeSlot(raw.workCard),
    vsr: normalizeSlot(raw.vsr),
    createdAt: str(raw.createdAt) || nowIso(),
    updatedAt: str(raw.updatedAt) || nowIso(),
  };
}

async function readStore(): Promise<WorkVisaStoreData> {
  const filePath = resolveStorePath();
  await hydrateDurableFile(DURABLE_WORK_VISAS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<WorkVisaStoreData>;
    const dossiers = Array.isArray(parsed.dossiers)
      ? parsed.dossiers
          .map((item) => normalizeDossier(item))
          .filter((item): item is WorkVisaDossier => Boolean(item))
      : [];
    return { meta: { version: 1 }, dossiers };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return emptyStore();
    throw err;
  }
}

async function writeStore(store: WorkVisaStoreData): Promise<void> {
  const filePath = resolveStorePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  const payload = `${JSON.stringify(store, null, 2)}\n`;
  await fsPromises.writeFile(filePath, payload, 'utf8');
  await persistDurableFile(DURABLE_WORK_VISAS_KEY, filePath);
}

export function toDossierView(dossier: WorkVisaDossier, today = todayIsoDate()): WorkVisaDossierView {
  const passportValidity = computeValidity(dossier.passport.current?.expiryDate, today);
  const workVisaValidity = computeValidity(dossier.workVisa.current?.expiryDate, today);
  const workCardValidity = computeValidity(dossier.workCard.current?.expiryDate, today);
  const vsrValidity = computeValidity(dossier.vsr.current?.expiryDate, today);
  const displayName = [dossier.nom, dossier.prenom].filter(Boolean).join(' ').trim() || dossier.nom;
  return {
    ...dossier,
    displayName,
    passportValidity,
    workVisaValidity,
    workCardValidity,
    vsrValidity,
    hasAnyAlert:
      (passportValidity.alert && passportValidity.status !== 'absent')
      || (workVisaValidity.alert && workVisaValidity.status !== 'absent')
      || (workCardValidity.alert && workCardValidity.status !== 'absent')
      || (vsrValidity.alert && vsrValidity.status !== 'absent'),
  };
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr', { sensitivity: 'base' }),
  );
}

export function computeKpis(views: WorkVisaDossierView[]): WorkVisaKpis {
  const active = views.filter((d) => d.status === 'actif');
  return {
    total: views.length,
    expats: active.filter((d) => d.isExpat).length,
    visasValides: active.filter((d) => d.workVisaValidity.status === 'actif').length,
    visasExpires: active.filter((d) => d.workVisaValidity.status === 'expire').length,
    passportsExpires: active.filter((d) => d.passportValidity.status === 'expire').length,
    workCardsExpires: active.filter((d) => d.workCardValidity.status === 'expire').length,
    vsrExpires: active.filter((d) => d.vsrValidity.status === 'expire').length,
    alerts4m: active.filter((d) => {
      const levels = [
        d.passportValidity.alertLevel,
        d.workVisaValidity.alertLevel,
        d.workCardValidity.alertLevel,
        d.vsrValidity.alertLevel,
      ];
      return levels.some((level) => level === 'm4' || level === 'm3' || level === 'm2' || level === 'm1' || level === 'today');
    }).length,
  };
}

function matchesReport(view: WorkVisaDossierView, report: WorkVisaReport): boolean {
  switch (report) {
    case 'visa-valide':
      return view.status === 'actif' && view.workVisaValidity.status === 'actif';
    case 'visa-expire':
      return view.status === 'actif' && view.workVisaValidity.status === 'expire';
    case 'expat-sans-vsr':
      return (
        view.status === 'actif'
        && view.isExpat
        && (view.vsrValidity.status === 'absent' || !view.vsr.current)
      );
    case 'expat-avec-vsr':
      return view.status === 'actif' && view.isExpat && view.vsrValidity.status === 'actif';
    default:
      return true;
  }
}

export function filterDossierViews(
  views: WorkVisaDossierView[],
  query: WorkVisaListQuery = {},
): WorkVisaDossierView[] {
  const q = str(query.q).toLowerCase();
  return views.filter((view) => {
    if (q) {
      const hay = `${view.matricule} ${view.nom} ${view.prenom} ${view.displayName}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    if (query.centreCout && view.centreCout !== query.centreCout) return false;
    if (query.nationalite && view.nationalite !== query.nationalite) return false;
    if (query.sexe && view.sexe !== query.sexe) return false;
    if (query.status && view.status !== query.status) return false;
    if (query.report && !matchesReport(view, query.report)) return false;
    if (query.passportExpired && view.passportValidity.status !== 'expire') return false;
    if (query.workCardExpired && view.workCardValidity.status !== 'expire') return false;
    if (query.vsrExpired && view.vsrValidity.status !== 'expire') return false;
    if (query.visaExpired && view.workVisaValidity.status !== 'expire') return false;
    if (query.visaValide && view.workVisaValidity.status !== 'actif') return false;
    if (query.alert4m) {
      const levels = [
        view.passportValidity.alertLevel,
        view.workVisaValidity.alertLevel,
        view.workCardValidity.alertLevel,
        view.vsrValidity.alertLevel,
      ];
      const hit = levels.some(
        (level) =>
          level === 'm4' || level === 'm3' || level === 'm2' || level === 'm1' || level === 'today',
      );
      if (!hit) return false;
    }
    return true;
  });
}

function buildFilterOptions(dossiers: WorkVisaDossier[]): WorkVisaFilterOptions {
  return {
    centresCout: uniqueSorted(dossiers.map((d) => d.centreCout)),
    nationalites: uniqueSorted(dossiers.map((d) => d.nationalite)),
    sexes: uniqueSorted(dossiers.map((d) => d.sexe)),
  };
}

export async function listWorkVisaDossiers(query: WorkVisaListQuery = {}): Promise<WorkVisaBundle> {
  const store = await readStore();
  const today = todayIsoDate();
  const allViews = store.dossiers.map((d) => toDossierView(d, today));
  const dossiers = filterDossierViews(allViews, query);
  return {
    dossiers,
    kpis: computeKpis(allViews),
    filters: buildFilterOptions(store.dossiers),
  };
}

export async function getWorkVisaDossier(id: string): Promise<WorkVisaDossierView | null> {
  const store = await readStore();
  const found = store.dossiers.find((d) => d.id === id);
  return found ? toDossierView(found) : null;
}

export async function createWorkVisaDossier(input: WorkVisaDossierInput): Promise<WorkVisaDossierView> {
  const store = await readStore();
  const matricule = str(input.matricule);
  const nom = str(input.nom);
  if (!matricule) throw new Error('Matricule requis');
  if (!nom) throw new Error('Nom requis');

  const activeDup = store.dossiers.find(
    (d) => d.matricule.toLowerCase() === matricule.toLowerCase() && d.status === 'actif',
  );
  if (activeDup) {
    throw new Error(`Un dossier actif existe déjà pour le matricule ${matricule}`);
  }

  const nationalite = str(input.nationalite);
  const now = nowIso();
  const dossier: WorkVisaDossier = {
    id: randomUUID(),
    matricule,
    nom,
    prenom: str(input.prenom),
    centreCout: str(input.centreCout),
    sexe: str(input.sexe),
    nationalite,
    isExpat: typeof input.isExpat === 'boolean' ? input.isExpat : inferIsExpat(nationalite),
    status: normalizeStatus(input.status),
    passport: { current: normalizeDocInput(input.passport), history: [] },
    workVisa: { current: normalizeDocInput(input.workVisa), history: [] },
    workCard: { current: normalizeDocInput(input.workCard), history: [] },
    vsr: { current: normalizeDocInput(input.vsr), history: [] },
    createdAt: now,
    updatedAt: now,
  };

  store.dossiers.unshift(dossier);
  await writeStore(store);
  return toDossierView(dossier);
}

export async function updateWorkVisaDossier(
  id: string,
  input: Partial<WorkVisaDossierInput>,
): Promise<WorkVisaDossierView> {
  const store = await readStore();
  const index = store.dossiers.findIndex((d) => d.id === id);
  if (index < 0) throw new Error('Dossier introuvable');

  const existing = store.dossiers[index];
  const matricule = input.matricule !== undefined ? str(input.matricule) : existing.matricule;
  const nom = input.nom !== undefined ? str(input.nom) : existing.nom;
  if (!matricule) throw new Error('Matricule requis');
  if (!nom) throw new Error('Nom requis');

  if (matricule.toLowerCase() !== existing.matricule.toLowerCase()) {
    const activeDup = store.dossiers.find(
      (d) =>
        d.id !== id
        && d.matricule.toLowerCase() === matricule.toLowerCase()
        && d.status === 'actif',
    );
    if (activeDup) {
      throw new Error(`Un dossier actif existe déjà pour le matricule ${matricule}`);
    }
  }

  const nationalite =
    input.nationalite !== undefined ? str(input.nationalite) : existing.nationalite;

  const next: WorkVisaDossier = {
    ...existing,
    matricule,
    nom,
    prenom: input.prenom !== undefined ? str(input.prenom) : existing.prenom,
    centreCout: input.centreCout !== undefined ? str(input.centreCout) : existing.centreCout,
    sexe: input.sexe !== undefined ? str(input.sexe) : existing.sexe,
    nationalite,
    isExpat:
      typeof input.isExpat === 'boolean'
        ? input.isExpat
        : input.nationalite !== undefined
          ? inferIsExpat(nationalite)
          : existing.isExpat,
    status: input.status !== undefined ? normalizeStatus(input.status) : existing.status,
    updatedAt: nowIso(),
  };

  if (input.passport !== undefined) {
    next.passport = {
      current: normalizeDocInput(input.passport),
      history: existing.passport.history,
    };
  }
  if (input.workVisa !== undefined) {
    next.workVisa = {
      current: normalizeDocInput(input.workVisa),
      history: existing.workVisa.history,
    };
  }
  if (input.workCard !== undefined) {
    next.workCard = {
      current: normalizeDocInput(input.workCard),
      history: existing.workCard.history,
    };
  }
  if (input.vsr !== undefined) {
    next.vsr = {
      current: normalizeDocInput(input.vsr),
      history: existing.vsr.history,
    };
  }

  store.dossiers[index] = next;
  await writeStore(store);
  return toDossierView(next);
}

function slotForKind(dossier: WorkVisaDossier, kind: WorkVisaDocKind): WorkVisaDocumentSlot {
  switch (kind) {
    case 'passport':
      return dossier.passport;
    case 'workVisa':
      return dossier.workVisa;
    case 'workCard':
      return dossier.workCard;
    case 'vsr':
      return dossier.vsr;
  }
}

function setSlotForKind(
  dossier: WorkVisaDossier,
  kind: WorkVisaDocKind,
  slot: WorkVisaDocumentSlot,
): WorkVisaDossier {
  switch (kind) {
    case 'passport':
      return { ...dossier, passport: slot };
    case 'workVisa':
      return { ...dossier, workVisa: slot };
    case 'workCard':
      return { ...dossier, workCard: slot };
    case 'vsr':
      return { ...dossier, vsr: slot };
  }
}

export async function renewWorkVisaDocument(
  id: string,
  kind: WorkVisaDocKind,
  input: WorkVisaDocumentInput,
): Promise<WorkVisaDossierView> {
  const store = await readStore();
  const index = store.dossiers.findIndex((d) => d.id === id);
  if (index < 0) throw new Error('Dossier introuvable');

  const existing = store.dossiers[index];
  const newCurrent = normalizeDocInput(input);
  if (!newCurrent) throw new Error('Nouveau document invalide (numéro / expiration requis)');

  const slot = slotForKind(existing, kind);
  const history = [...slot.history];
  if (slot.current) {
    history.unshift({
      ...slot.current,
      archivedAt: nowIso(),
    });
  }

  const next = setSlotForKind(existing, kind, { current: newCurrent, history });
  next.updatedAt = nowIso();
  store.dossiers[index] = next;
  await writeStore(store);
  return toDossierView(next);
}

export async function setWorkVisaDossierStatus(
  id: string,
  status: WorkVisaDossierStatus,
): Promise<WorkVisaDossierView> {
  return updateWorkVisaDossier(id, { status });
}
