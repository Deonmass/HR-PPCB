import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_FACTURES_SUIVI_KEY,
  DURABLE_FOURNISSEURS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from '@/lib/durable-fs';
import { canPersistProjectFiles, getWritableDataRoot } from '@/lib/runtime-mode';
import type {
  AssignStepPayload,
  FactureBatchLineInput,
  FactureDashboard,
  FactureSuivi,
  FactureSuiviInput,
} from './types';
import type { Fournisseur } from '../fournisseurs-types';
import type { FacturesJsonStoreData, FournisseursJsonStoreData } from './json-types';
import {
  assertRefUniqueness,
  buildFactureDashboard,
  canAssignStep,
  cellStr,
  computeCommentaire,
  formatDateCell,
  parseMontant,
  stepFields,
  withComputedStatut,
} from './utils';
import { FACTURES_FOURNISSEURS_XLSX_PATH } from './paths';
import { getSheetBlock, readWorkbookForData, withExcelLock, type AoaRow } from '@/lib/excel-io';

const FACTURES_SHEET_NAME = 'Factures';
const FACTURES_HEADER_ROW = 1;
const FACTURES_DATA_START = 2;

const FOURNISSEURS_SHEET_NAME = 'Fournisseurs';
const FOURNISSEURS_DATA_START = 1;

const FACTURES_COL = {
  date: 0,
  societe: 1,
  facture: 2,
  montant: 3,
  echeance: 4,
  pr: 5,
  datePr: 6,
  po: 7,
  datePo: 8,
  grn: 9,
  dateGrn: 10,
  payment: 11,
  datePym: 12,
  statut: 13,
  commentaire: 14,
} as const;

function resolveStorePath(relativePath: string): string {
  if (canPersistProjectFiles()) return path.join(process.cwd(), relativePath);
  const writable = path.join(getWritableDataRoot(), relativePath.replace(/^data[\\/]/, ''));
  const bundled = path.join(process.cwd(), relativePath);
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

function facturesPath(): string {
  return resolveStorePath(path.join('data', 'factures-fournisseurs', 'factures.json'));
}

function fournisseursPath(): string {
  return resolveStorePath(path.join('data', 'factures-fournisseurs', 'fournisseurs.json'));
}

function fournisseurIdFromSeq(seq: number): string {
  return `frn-${seq}`;
}

function factureIdFromSeq(seq: number): string {
  return `fac-${seq}`;
}

function parseSeq(id: string, prefix: 'frn' | 'fac'): number | null {
  const match = id.trim().match(new RegExp(`^${prefix}-(\\d+)$`));
  if (!match) return null;
  const seq = Number.parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
}

function normalizeHeader(value: unknown): string {
  return cellStr(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

function isLegacyHeaderRow(headerRow: AoaRow): boolean {
  const headers = headerRow.map(normalizeHeader);
  return (
    headers.includes('nomduvoyageur')
    || headers.includes('costcenter')
    || headers.includes('san')
    || headers.includes('datesan')
    || headers.includes('posting')
    || headers.includes('dateposting')
  );
}

function isPrePaymentHeaderRow(headerRow: AoaRow): boolean {
  const headers = headerRow.map(normalizeHeader);
  if (isLegacyHeaderRow(headerRow)) return false;
  const hasStatut = headers.includes('statut') || headers.includes('status');
  const hasPayment = headers.includes('payment') || headers.includes('datepym');
  return hasStatut && !hasPayment;
}

function rowToFacture(row: AoaRow, seq: number): FactureSuivi | null {
  const facture = cellStr(row[FACTURES_COL.facture]);
  const societe = cellStr(row[FACTURES_COL.societe]);
  if (!facture && !societe) return null;
  return withComputedStatut({
    id: factureIdFromSeq(seq),
    date: formatDateCell(row[FACTURES_COL.date]),
    societe,
    facture,
    montant: parseMontant(row[FACTURES_COL.montant]),
    echeance: formatDateCell(row[FACTURES_COL.echeance]),
    pr: cellStr(row[FACTURES_COL.pr]),
    datePr: formatDateCell(row[FACTURES_COL.datePr]),
    po: cellStr(row[FACTURES_COL.po]),
    datePo: formatDateCell(row[FACTURES_COL.datePo]),
    grn: cellStr(row[FACTURES_COL.grn]),
    dateGrn: formatDateCell(row[FACTURES_COL.dateGrn]),
    payment: cellStr(row[FACTURES_COL.payment]),
    datePym: formatDateCell(row[FACTURES_COL.datePym]),
    commentaire: cellStr(row[FACTURES_COL.commentaire]),
  });
}

function legacyRowToFacture(row: AoaRow, seq: number): FactureSuivi | null {
  const facture = cellStr(row[2]);
  const societe = cellStr(row[1]);
  if (!facture && !societe) return null;
  return withComputedStatut({
    id: factureIdFromSeq(seq),
    date: formatDateCell(row[0]),
    societe,
    facture,
    montant: parseMontant(row[3]),
    echeance: formatDateCell(row[4]),
    pr: cellStr(row[7]),
    datePr: formatDateCell(row[8]),
    po: cellStr(row[9]),
    datePo: formatDateCell(row[10]),
    grn: cellStr(row[13]),
    dateGrn: formatDateCell(row[14]),
    payment: cellStr(row[16]),
    datePym: formatDateCell(row[17]),
    commentaire: cellStr(row[19]),
  });
}

function prePaymentRowToFacture(row: AoaRow, seq: number): FactureSuivi | null {
  const facture = cellStr(row[2]);
  const societe = cellStr(row[1]);
  if (!facture && !societe) return null;
  return withComputedStatut({
    id: factureIdFromSeq(seq),
    date: formatDateCell(row[0]),
    societe,
    facture,
    montant: parseMontant(row[3]),
    echeance: formatDateCell(row[4]),
    pr: cellStr(row[5]),
    datePr: formatDateCell(row[6]),
    po: cellStr(row[7]),
    datePo: formatDateCell(row[8]),
    grn: cellStr(row[9]),
    dateGrn: formatDateCell(row[10]),
    payment: '',
    datePym: '',
    commentaire: cellStr(row[12]),
  });
}

function rowToFournisseur(row: AoaRow, seq: number): Fournisseur | null {
  const nom = cellStr(row[0]);
  if (!nom) return null;
  return {
    id: fournisseurIdFromSeq(seq),
    nom,
    natureService: cellStr(row[1]),
  };
}

async function readJsonFile<T>(repoKey: string, filePath: string, fallback: T): Promise<T> {
  await hydrateDurableFile(repoKey, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return fallback;
    throw err;
  }
}

async function writeJsonFile(repoKey: string, filePath: string, value: unknown): Promise<void> {
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
  await persistDurableFile(repoKey, filePath);
}

async function readLegacyWorkbook(): Promise<{
  factures: FactureSuivi[];
  fournisseurs: Fournisseur[];
}> {
  return withExcelLock(FACTURES_FOURNISSEURS_XLSX_PATH, async () => {
    const wb = await readWorkbookForData(FACTURES_FOURNISSEURS_XLSX_PATH);
    const facturesBlock = getSheetBlock(wb, FACTURES_SHEET_NAME, FACTURES_DATA_START, { maxCols: 24 });
    const headerRow = facturesBlock.headerRows[FACTURES_HEADER_ROW] ?? [];
    const legacy = isLegacyHeaderRow(headerRow);
    const prePayment = isPrePaymentHeaderRow(headerRow);
    const factures: FactureSuivi[] = [];
    facturesBlock.dataRows.forEach((row, index) => {
      const seq = FACTURES_DATA_START + index;
      const item = legacy
        ? legacyRowToFacture(row, seq)
        : prePayment
          ? prePaymentRowToFacture(row, seq)
          : rowToFacture(row, seq);
      if (item) factures.push(item);
    });

    const fournisseursBlock = getSheetBlock(wb, FOURNISSEURS_SHEET_NAME, FOURNISSEURS_DATA_START);
    const fournisseurs: Fournisseur[] = [];
    fournisseursBlock.dataRows.forEach((row, index) => {
      const item = rowToFournisseur(row, FOURNISSEURS_DATA_START + index);
      if (item) fournisseurs.push(item);
    });
    return { factures, fournisseurs };
  });
}

async function ensureMigrated(): Promise<void> {
  const [facturesExists, fournisseursExists] = await Promise.all([
    fsPromises.access(facturesPath()).then(() => true).catch(() => false),
    fsPromises.access(fournisseursPath()).then(() => true).catch(() => false),
  ]);
  if (facturesExists && fournisseursExists) return;

  let legacy: { factures: FactureSuivi[]; fournisseurs: Fournisseur[] } = {
    factures: [],
    fournisseurs: [],
  };
  try {
    if (fs.existsSync(FACTURES_FOURNISSEURS_XLSX_PATH)) {
      legacy = await readLegacyWorkbook();
    }
  } catch {
    legacy = { factures: [], fournisseurs: [] };
  }
  const nextFactureSeq = legacy.factures.reduce((max, item) => Math.max(max, parseSeq(item.id, 'fac') ?? 0), 0) + 1;
  const nextFournisseurSeq = legacy.fournisseurs.reduce((max, item) => Math.max(max, parseSeq(item.id, 'frn') ?? 0), 0) + 1;
  await Promise.all([
    writeJsonFile(DURABLE_FACTURES_SUIVI_KEY, facturesPath(), {
      factures: legacy.factures,
      nextFactureSeq,
    } satisfies FacturesJsonStoreData),
    writeJsonFile(DURABLE_FOURNISSEURS_KEY, fournisseursPath(), {
      fournisseurs: legacy.fournisseurs,
      nextFournisseurSeq,
    } satisfies FournisseursJsonStoreData),
  ]);
}

async function readFacturesStore(): Promise<FacturesJsonStoreData> {
  return readJsonFile(DURABLE_FACTURES_SUIVI_KEY, facturesPath(), { factures: [], nextFactureSeq: 1 });
}

async function readFournisseursStore(): Promise<FournisseursJsonStoreData> {
  return readJsonFile(DURABLE_FOURNISSEURS_KEY, fournisseursPath(), { fournisseurs: [], nextFournisseurSeq: 1 });
}

function mergeInput(existing: FactureSuivi | null, input: FactureSuiviInput): FactureSuivi {
  const base = existing ?? withComputedStatut({
    id: '',
    date: '',
    societe: '',
    facture: '',
    montant: null,
    echeance: '',
    pr: '',
    datePr: '',
    po: '',
    datePo: '',
    grn: '',
    dateGrn: '',
    payment: '',
    datePym: '',
    commentaire: '',
  });
  return withComputedStatut({
    id: base.id,
    date: input.date !== undefined ? String(input.date).trim() : base.date,
    societe: input.societe !== undefined ? String(input.societe).trim() : base.societe,
    facture: input.facture !== undefined ? String(input.facture).trim() : base.facture,
    montant: input.montant !== undefined ? input.montant : base.montant,
    echeance: input.echeance !== undefined ? String(input.echeance).trim() : base.echeance,
    pr: input.pr !== undefined ? String(input.pr).trim() : base.pr,
    datePr: input.datePr !== undefined ? String(input.datePr).trim() : base.datePr,
    po: input.po !== undefined ? String(input.po).trim() : base.po,
    datePo: input.datePo !== undefined ? String(input.datePo).trim() : base.datePo,
    grn: input.grn !== undefined ? String(input.grn).trim() : base.grn,
    dateGrn: input.dateGrn !== undefined ? String(input.dateGrn).trim() : base.dateGrn,
    payment: input.payment !== undefined ? String(input.payment).trim() : base.payment,
    datePym: input.datePym !== undefined ? String(input.datePym).trim() : base.datePym,
    commentaire: input.commentaire !== undefined ? String(input.commentaire).trim() : base.commentaire,
  });
}

function sortFactures(items: FactureSuivi[]): FactureSuivi[] {
  return [...items].sort((a, b) => {
    const da = a.date || a.echeance;
    const db = b.date || b.echeance;
    return db.localeCompare(da, 'fr') || a.facture.localeCompare(b.facture, 'fr');
  });
}

export async function listFacturesSuivi(): Promise<FactureSuivi[]> {
  await ensureMigrated();
  const store = await readFacturesStore();
  // Recompute unpaid/paid from payment (covers legacy pipeline statuses).
  const normalized = store.factures.map((item) =>
    withComputedStatut({
      ...item,
      commentaire: item.commentaire,
    }),
  );
  return sortFactures(normalized);
}

export async function getFactureSuivi(id: string): Promise<FactureSuivi | null> {
  const factures = await listFacturesSuivi();
  return factures.find((item) => item.id === id) ?? null;
}

export async function getFacturesSuiviBundle(): Promise<{ factures: FactureSuivi[]; dashboard: FactureDashboard }> {
  const factures = await listFacturesSuivi();
  return { factures, dashboard: buildFactureDashboard(factures) };
}

export async function upsertFactureSuivi(input: FactureSuiviInput): Promise<FactureSuivi> {
  await ensureMigrated();
  const store = await readFacturesStore();
  const existingIndex = input.id ? store.factures.findIndex((item) => item.id === input.id) : -1;
  const existing = existingIndex >= 0 ? store.factures[existingIndex] : null;
  const next = mergeInput(existing, input);
  if (!next.facture.trim()) throw new Error('Numéro de facture requis');
  if (!next.societe.trim()) throw new Error('Société (fournisseur) requise');
  if (!next.id) {
    next.id = factureIdFromSeq(store.nextFactureSeq);
    store.nextFactureSeq += 1;
  }
  const others = store.factures.filter((item) => item.id !== next.id);
  assertRefUniqueness(others, [next]);
  if (existingIndex >= 0) store.factures[existingIndex] = next;
  else store.factures.push(next);
  await writeJsonFile(DURABLE_FACTURES_SUIVI_KEY, facturesPath(), store);
  return next;
}

export async function upsertFacturesBatch(lines: FactureBatchLineInput[]): Promise<FactureSuivi[]> {
  await ensureMigrated();
  if (!lines.length) throw new Error('Aucune facture à enregistrer');
  const store = await readFacturesStore();
  const created: FactureSuivi[] = [];
  for (const line of lines) {
    const next = mergeInput(null, {
      date: line.date,
      societe: line.societe,
      facture: line.facture,
      montant: line.montant,
      echeance: line.echeance,
      pr: line.pr,
      datePr: line.datePr,
      po: line.po,
      payment: line.payment,
      commentaire: line.commentaire,
    });
    if (!next.facture.trim()) throw new Error('Numéro de facture requis sur chaque ligne');
    if (!next.societe.trim()) throw new Error('Société requise sur chaque ligne');
    next.id = factureIdFromSeq(store.nextFactureSeq);
    store.nextFactureSeq += 1;
    assertRefUniqueness([...store.factures, ...created], [next]);
    created.push(next);
  }
  store.factures.push(...created);
  await writeJsonFile(DURABLE_FACTURES_SUIVI_KEY, facturesPath(), store);
  return created;
}

export async function deleteFactureSuivi(id: string): Promise<boolean> {
  await ensureMigrated();
  const store = await readFacturesStore();
  const next = store.factures.filter((item) => item.id !== id);
  if (next.length === store.factures.length) return false;
  store.factures = next;
  await writeJsonFile(DURABLE_FACTURES_SUIVI_KEY, facturesPath(), store);
  return true;
}

export async function assignFactureStep(payload: AssignStepPayload): Promise<FactureSuivi[]> {
  await ensureMigrated();
  const numero = payload.numero.trim();
  const date = payload.date.trim();
  const ids = [...new Set(payload.ids.map((id) => id.trim()).filter(Boolean))];
  if (!numero) throw new Error('Numéro requis');
  if (!date) throw new Error('Date requise');
  if (!ids.length) throw new Error('Sélectionnez au moins une facture');

  const store = await readFacturesStore();
  const { numeroKey, dateKey } = stepFields(payload.step);
  const selected = store.factures.filter((item) => ids.includes(item.id));
  if (selected.length !== ids.length) throw new Error('Facture introuvable');
  for (const current of selected) {
    if (!canAssignStep(current, payload.step)) {
      throw new Error(
        `La facture ${current.facture} n'est pas à l'étape requise pour ${payload.step.toUpperCase()} (statut actuel: ${current.statutLabel})`,
      );
    }
  }
  if (payload.step === 'grn') {
    const poSet = new Set(selected.map((item) => item.po.trim()).filter(Boolean));
    if (poSet.size !== 1) {
      throw new Error('Pour affecter un GRN, toutes les factures sélectionnées doivent partager le même PO');
    }
  }
  const updated: FactureSuivi[] = [];
  const others = store.factures.filter((item) => !ids.includes(item.id));
  for (const current of selected) {
    const next = withComputedStatut({
      ...current,
      [numeroKey]: numero,
      [dateKey]: date,
      commentaire: computeCommentaire(current.statut, ''),
    } as FactureSuivi);
    assertRefUniqueness([...others, ...updated], [next]);
    const index = store.factures.findIndex((item) => item.id === current.id);
    store.factures[index] = next;
    updated.push(next);
  }
  await writeJsonFile(DURABLE_FACTURES_SUIVI_KEY, facturesPath(), store);
  return updated;
}

export async function importFacturesSuiviRows(rows: FactureSuiviInput[]): Promise<{ imported: number; skipped: number }> {
  await ensureMigrated();
  if (!rows.length) throw new Error('Aucune ligne à importer');
  const store = await readFacturesStore();
  const existingKeys = new Set(
    store.factures.map((item) => `${item.facture.trim().toLowerCase()}|${item.societe.trim().toLowerCase()}`),
  );
  let imported = 0;
  let skipped = 0;
  const batch: FactureSuivi[] = [];
  for (const input of rows) {
    const key = `${String(input.facture ?? '').trim().toLowerCase()}|${String(input.societe ?? '').trim().toLowerCase()}`;
    if (!input.facture?.trim() || !input.societe?.trim() || existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    const next = mergeInput(null, {
      ...input,
      commentaire: input.commentaire?.trim() || '',
    });
    next.id = factureIdFromSeq(store.nextFactureSeq);
    store.nextFactureSeq += 1;
    batch.push(next);
    existingKeys.add(key);
    imported += 1;
  }
  if (batch.length) {
    // Single uniqueness pass (avoids O(n²) during large Excel imports).
    assertRefUniqueness(store.factures, batch);
    store.factures.push(...batch);
    await writeJsonFile(DURABLE_FACTURES_SUIVI_KEY, facturesPath(), store);
  }
  return { imported, skipped };
}

export async function listFournisseurs(): Promise<Fournisseur[]> {
  await ensureMigrated();
  const store = await readFournisseursStore();
  return [...store.fournisseurs].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

export async function upsertFournisseur(item: Partial<Fournisseur> & { nom: string }): Promise<Fournisseur> {
  await ensureMigrated();
  const store = await readFournisseursStore();
  const nom = item.nom.trim();
  const natureService = (item.natureService ?? '').trim();
  if (!nom) throw new Error("Nom de l'ETS requis");
  const existingIndex = item.id ? store.fournisseurs.findIndex((row) => row.id === item.id) : -1;
  const saved: Fournisseur = {
    id: existingIndex >= 0
      ? store.fournisseurs[existingIndex].id
      : fournisseurIdFromSeq(store.nextFournisseurSeq),
    nom,
    natureService,
  };
  if (existingIndex >= 0) store.fournisseurs[existingIndex] = saved;
  else {
    store.fournisseurs.push(saved);
    store.nextFournisseurSeq += 1;
  }
  await writeJsonFile(DURABLE_FOURNISSEURS_KEY, fournisseursPath(), store);
  return saved;
}

export async function deleteFournisseur(id: string): Promise<boolean> {
  await ensureMigrated();
  const store = await readFournisseursStore();
  const next = store.fournisseurs.filter((item) => item.id !== id);
  if (next.length === store.fournisseurs.length) return false;
  store.fournisseurs = next;
  await writeJsonFile(DURABLE_FOURNISSEURS_KEY, fournisseursPath(), store);
  return true;
}
