import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import type {
  PpcDisciplineCase,
  PpcDisciplineCaseInput,
  PpcDisciplineEvent,
  PpcDisciplineEventType,
  PpcDisciplineStatut,
} from './ppc-discipline-types';
import {
  PPC_DISCIPLINE_EVENT_TYPES,
  PPC_DISCIPLINE_STATUTS,
} from './ppc-discipline-types';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface StoreData {
  cases: PpcDisciplineCase[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'employees', 'ppc-discipline.json');
  }
  const writable = path.join(getWritableDataRoot(), 'employees', 'ppc-discipline.json');
  const bundled = path.join(process.cwd(), 'data', 'employees', 'ppc-discipline.json');
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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

let storeChain: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = storeChain.then(task, task);
  storeChain = run.then(() => undefined, () => undefined);
  return run;
}

function normalizeStatut(raw: string): PpcDisciplineStatut {
  return PPC_DISCIPLINE_STATUTS.includes(raw as PpcDisciplineStatut)
    ? (raw as PpcDisciplineStatut)
    : 'Ouvert';
}

function normalizeEventType(raw: string): PpcDisciplineEventType {
  return PPC_DISCIPLINE_EVENT_TYPES.includes(raw as PpcDisciplineEventType)
    ? (raw as PpcDisciplineEventType)
    : 'commentaire';
}

function normalizeEvent(raw: unknown): PpcDisciplineEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PpcDisciplineEvent>;
  const texte = String(r.texte || '').trim();
  if (!texte) return null;
  return {
    id: String(r.id || randomUUID()),
    type: normalizeEventType(String(r.type || 'commentaire')),
    auteur: String(r.auteur || '').trim() || '—',
    texte,
    date: String(r.date || '').trim(),
    createdAt: String(r.createdAt || new Date().toISOString()),
  };
}

function normalizeCase(raw: unknown): PpcDisciplineCase | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<PpcDisciplineCase>;
  if (!r.id || !r.matricule) return null;
  return {
    id: String(r.id),
    matricule: String(r.matricule).trim(),
    employeeName: String(r.employeeName || '').trim(),
    departement: String(r.departement || '').trim(),
    jobTitle: String(r.jobTitle || '').trim(),
    parti: r.parti === true,
    dateIncident: String(r.dateIncident || '').trim(),
    motif: String(r.motif || '').trim(),
    faits: String(r.faits || '').trim(),
    demandeDate: String(r.demandeDate || '').trim(),
    demandeTexte: String(r.demandeTexte || '').trim(),
    demandeLien: String(r.demandeLien || '').trim(),
    demandeEcheance: String(r.demandeEcheance || '').trim(),
    reponseDate: String(r.reponseDate || '').trim(),
    reponseTexte: String(r.reponseTexte || '').trim(),
    reponseLien: String(r.reponseLien || '').trim(),
    sanction: String(r.sanction || 'Aucune').trim() || 'Aucune',
    dateSanction: String(r.dateSanction || '').trim(),
    statut: normalizeStatut(String(r.statut || 'Ouvert')),
    historique: Array.isArray(r.historique)
      ? r.historique.map(normalizeEvent).filter((e): e is PpcDisciplineEvent => Boolean(e))
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
        ? parsed.cases.map(normalizeCase).filter((c): c is PpcDisciplineCase => Boolean(c))
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

function pushEvent(
  item: PpcDisciplineCase,
  type: PpcDisciplineEventType,
  auteur: string,
  texte: string,
  date?: string,
): PpcDisciplineCase {
  const now = new Date().toISOString();
  return {
    ...item,
    historique: [
      ...item.historique,
      {
        id: randomUUID(),
        type,
        auteur: auteur.trim() || '—',
        texte: texte.trim(),
        date: (date || todayIso()).trim(),
        createdAt: now,
      },
    ],
    updatedAt: now,
  };
}

function assertOpen(item: PpcDisciplineCase): void {
  if (item.statut === 'Clos') {
    throw new Error('Le cas est clos. Rouvrez-le avant de poursuivre.');
  }
}

export async function listPpcDisciplineCases(opts?: {
  matricule?: string;
}): Promise<PpcDisciplineCase[]> {
  const store = await readStore();
  let list = [...store.cases];
  if (opts?.matricule) list = list.filter((c) => c.matricule === opts.matricule);
  return list.sort(
    (a, b) => new Date(b.dateIncident || b.createdAt).getTime() - new Date(a.dateIncident || a.createdAt).getTime(),
  );
}

export async function getPpcDisciplineCase(id: string): Promise<PpcDisciplineCase | null> {
  const store = await readStore();
  return store.cases.find((c) => c.id === id) ?? null;
}

export function createPpcDisciplineCase(
  input: PpcDisciplineCaseInput,
  createdBy?: string,
): Promise<PpcDisciplineCase> {
  return enqueue(() => createPpcDisciplineCaseLocked(input, createdBy));
}

async function createPpcDisciplineCaseLocked(
  input: PpcDisciplineCaseInput,
  createdBy?: string,
): Promise<PpcDisciplineCase> {
  const matricule = String(input.matricule || '').trim();
  const motif = String(input.motif || '').trim();
  const demandeDate = String(input.demandeDate || '').trim();
  const demandeEcheance = String(input.demandeEcheance || '').trim();
  const demandeLien = String(input.demandeLien || '').trim();
  if (!matricule) throw new Error('Agent requis');
  if (!motif) throw new Error('Motif requis');
  if (!demandeDate) throw new Error('Date d’envoi de la demande requise');
  if (!demandeEcheance) throw new Error('Échéance de réponse requise');

  const now = new Date().toISOString();
  const dateIncident = String(input.dateIncident || todayIso()).trim();
  const auteur = createdBy?.trim() || '—';
  const demandeLigne = [
    demandeLien || 'Demande d’explication',
    `Échéance de réponse : ${demandeEcheance}`,
  ].join('\n');
  const record: PpcDisciplineCase = {
    id: randomUUID(),
    matricule,
    employeeName: String(input.employeeName || '').trim(),
    departement: String(input.departement || '').trim(),
    jobTitle: String(input.jobTitle || '').trim(),
    parti: input.parti === true,
    dateIncident,
    motif,
    faits: String(input.faits || '').trim(),
    demandeDate,
    demandeTexte: '',
    demandeLien,
    demandeEcheance,
    reponseDate: '',
    reponseTexte: '',
    reponseLien: '',
    sanction: 'Aucune',
    dateSanction: '',
    statut: "Demande d'explication",
    historique: [{
      id: randomUUID(),
      type: 'ouverture',
      auteur,
      texte: motif,
      date: dateIncident,
      createdAt: now,
    }, {
      id: randomUUID(),
      type: 'demande',
      auteur,
      texte: demandeLigne,
      date: demandeDate,
      createdAt: now,
    }],
    createdAt: now,
    updatedAt: now,
    createdBy: auteur,
  };

  const store = await readStore();
  store.cases.unshift(record);
  await writeStore(store);
  return record;
}

export function updatePpcDisciplineCase(
  id: string,
  patch: Partial<Pick<PpcDisciplineCase, 'dateIncident' | 'motif' | 'faits' | 'statut' | 'sanction'>>,
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  return enqueue(() => updatePpcDisciplineCaseLocked(id, patch, auteur));
}

async function updatePpcDisciplineCaseLocked(
  id: string,
  patch: Partial<Pick<PpcDisciplineCase, 'dateIncident' | 'motif' | 'faits' | 'statut' | 'sanction'>>,
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.cases[index]!;
  const nextStatut = patch.statut !== undefined ? normalizeStatut(String(patch.statut)) : prev.statut;
  let next: PpcDisciplineCase = {
    ...prev,
    dateIncident: patch.dateIncident !== undefined ? String(patch.dateIncident).trim() : prev.dateIncident,
    motif: patch.motif !== undefined ? String(patch.motif).trim() : prev.motif,
    faits: patch.faits !== undefined ? String(patch.faits).trim() : prev.faits,
    sanction: patch.sanction !== undefined ? String(patch.sanction).trim() || 'Aucune' : prev.sanction,
    statut: nextStatut,
    updatedAt: new Date().toISOString(),
  };
  if (!next.motif) throw new Error('Motif requis');
  if (nextStatut !== prev.statut) {
    next = pushEvent(next, 'statut', auteur || '—', `Statut : ${prev.statut} → ${nextStatut}`);
  }
  store.cases[index] = next;
  await writeStore(store);
  return next;
}

export function envoyerDemandeExplication(
  id: string,
  input: { demandeDate?: string; demandeLien: string; demandeEcheance?: string },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  return enqueue(() => envoyerDemandeExplicationLocked(id, input, auteur));
}

async function envoyerDemandeExplicationLocked(
  id: string,
  input: { demandeDate?: string; demandeLien: string; demandeEcheance?: string },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  const lien = String(input.demandeLien || '').trim();
  const date = String(input.demandeDate || '').trim();
  const echeance = String(input.demandeEcheance || '').trim();
  if (!date) throw new Error('Date d’envoi requise');
  if (!echeance) throw new Error('Échéance de réponse requise');
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.cases[index]!;
  assertOpen(prev);
  let next: PpcDisciplineCase = {
    ...prev,
    demandeDate: date,
    demandeLien: lien,
    demandeEcheance: echeance,
    statut: "Demande d'explication",
  };
  const ligne = [
    lien || 'Demande d’explication',
    `Échéance de réponse : ${echeance}`,
  ].join('\n');
  next = pushEvent(next, 'demande', auteur || '—', ligne, date);
  store.cases[index] = next;
  await writeStore(store);
  return next;
}

export function enregistrerReponseAgent(
  id: string,
  input: { reponseDate?: string; reponseLien: string },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  return enqueue(() => enregistrerReponseAgentLocked(id, input, auteur));
}

async function enregistrerReponseAgentLocked(
  id: string,
  input: { reponseDate?: string; reponseLien: string },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  const lien = String(input.reponseLien || '').trim();
  const date = String(input.reponseDate || '').trim();
  if (!date) throw new Error('Date de la réponse requise');
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.cases[index]!;
  assertOpen(prev);
  let next: PpcDisciplineCase = {
    ...prev,
    reponseDate: date,
    reponseLien: lien,
    statut: 'Réponse reçue',
  };
  next = pushEvent(next, 'reponse', auteur || '—', lien || 'Réponse enregistrée', date);
  store.cases[index] = next;
  await writeStore(store);
  return next;
}

export function enregistrerActionsPpc(
  id: string,
  input: {
    demandeDate?: string;
    demandeLien?: string;
    demandeEcheance?: string;
    reponseDate?: string;
    reponseLien?: string;
    sanction?: string;
    dateSanction?: string;
    texte?: string;
  },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  return enqueue(() => enregistrerActionsPpcLocked(id, input, auteur));
}

async function enregistrerActionsPpcLocked(
  id: string,
  input: {
    demandeDate?: string;
    demandeLien?: string;
    demandeEcheance?: string;
    reponseDate?: string;
    reponseLien?: string;
    sanction?: string;
    dateSanction?: string;
    texte?: string;
  },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.cases[index]!;
  assertOpen(prev);

  const demandeLien = String(input.demandeLien || '').trim();
  const demandeDate = String(input.demandeDate || '').trim();
  const demandeEcheance = String(input.demandeEcheance || '').trim();
  const reponseLien = String(input.reponseLien || '').trim();
  const reponseDate = String(input.reponseDate || '').trim();
  const sanction = String(input.sanction || '').trim() || 'Aucune';
  const dateSanction = String(input.dateSanction || '').trim();
  const note = String(input.texte || '').trim();
  const auteurNom = auteur || '—';
  const hasDemande = Boolean(demandeLien || demandeDate || demandeEcheance);
  const hasReponse = Boolean(reponseLien);
  const hasSanction = sanction !== 'Aucune';

  if (!hasDemande && !hasReponse && !hasSanction) {
    throw new Error('Renseignez au moins un document ou une sanction');
  }

  let next: PpcDisciplineCase = { ...prev, updatedAt: new Date().toISOString() };

  if (hasDemande) {
    const changed = demandeLien !== prev.demandeLien
      || demandeDate !== prev.demandeDate
      || demandeEcheance !== prev.demandeEcheance;
    next = {
      ...next,
      demandeDate: demandeDate || todayIso(),
      demandeLien,
      demandeEcheance,
    };
    if (changed) {
      const ligne = demandeEcheance ? `${demandeLien}\nÉchéance de réponse : ${demandeEcheance}` : demandeLien;
      next = pushEvent(next, 'demande', auteurNom, ligne, demandeDate || todayIso());
    }
  }

  if (hasReponse) {
    const changed = reponseLien !== prev.reponseLien || reponseDate !== prev.reponseDate;
    next = {
      ...next,
      reponseDate: reponseDate || todayIso(),
      reponseLien,
    };
    if (changed) {
      next = pushEvent(next, 'reponse', auteurNom, reponseLien, reponseDate || todayIso());
    }
  }

  if (hasSanction) {
    const date = dateSanction || todayIso();
    next = {
      ...next,
      sanction,
      dateSanction: date,
      statut: 'Clos',
    };
    if (sanction !== prev.sanction || date !== prev.dateSanction) {
      next = pushEvent(next, 'sanction', auteurNom, sanction, date);
    }
    if (note) {
      next = pushEvent(next, 'commentaire', auteurNom, note, date);
    }
    if (prev.statut !== 'Clos') {
      next = pushEvent(next, 'statut', auteurNom, `Statut : ${prev.statut} → Clos`, date);
    }
  } else if (hasReponse) {
    next = { ...next, statut: 'Réponse reçue' };
  } else if (hasDemande && prev.statut === 'Ouvert') {
    next = { ...next, statut: "Demande d'explication" };
  }

  store.cases[index] = next;
  await writeStore(store);
  return next;
}

export function appliquerSanctionPpc(
  id: string,
  input: { sanction: string; dateSanction?: string; texte?: string },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  return enqueue(() => appliquerSanctionPpcLocked(id, input, auteur));
}

async function appliquerSanctionPpcLocked(
  id: string,
  input: { sanction: string; dateSanction?: string; texte?: string },
  auteur?: string,
): Promise<PpcDisciplineCase | null> {
  const sanction = String(input.sanction || '').trim() || 'Aucune';
  if (sanction === 'Aucune') throw new Error('Choisissez une sanction');
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const prev = store.cases[index]!;
  assertOpen(prev);
  const date = String(input.dateSanction || todayIso()).trim();
  const note = String(input.texte || '').trim();
  let next: PpcDisciplineCase = {
    ...prev,
    sanction,
    dateSanction: date,
    statut: 'Clos',
  };
  next = pushEvent(next, 'sanction', auteur || '—', sanction, date);
  if (note) {
    next = pushEvent(next, 'commentaire', auteur || '—', note, date);
  }
  if (prev.statut !== 'Clos') {
    next = pushEvent(next, 'statut', auteur || '—', `Statut : ${prev.statut} → Clos`, date);
  }
  store.cases[index] = next;
  await writeStore(store);
  return next;
}

export function commenterPpcDisciplineCase(
  id: string,
  auteur: string,
  texte: string,
): Promise<PpcDisciplineCase | null> {
  return enqueue(() => commenterPpcDisciplineCaseLocked(id, auteur, texte));
}

async function commenterPpcDisciplineCaseLocked(
  id: string,
  auteur: string,
  texte: string,
): Promise<PpcDisciplineCase | null> {
  const trimmed = texte.trim();
  if (!trimmed) throw new Error('Commentaire vide');
  const store = await readStore();
  const index = store.cases.findIndex((c) => c.id === id);
  if (index < 0) return null;
  store.cases[index] = pushEvent(store.cases[index]!, 'commentaire', auteur, trimmed);
  await writeStore(store);
  return store.cases[index]!;
}

export function deletePpcDisciplineCase(id: string): Promise<boolean> {
  return enqueue(() => deletePpcDisciplineCaseLocked(id));
}

async function deletePpcDisciplineCaseLocked(id: string): Promise<boolean> {
  const store = await readStore();
  const before = store.cases.length;
  store.cases = store.cases.filter((c) => c.id !== id);
  if (store.cases.length === before) return false;
  await writeStore(store);
  return true;
}
