import 'server-only';

import fs from 'fs';

import {
  cloneRowStyle,
  getSheet,
  getSheetBlock,
  readWorkbook,
  readWorkbookForData,
  saveWorkbook,
  shiftRowsUp,
  withExcelLock,
  writeRowValues,
  type AoaRow,
} from '@/lib/excel-io';
import type {
  AssignStep,
  AssignStepPayload,
  FactureBatchLineInput,
  FactureDashboard,
  FactureSuivi,
  FactureSuiviInput,
} from '@/lib/factures-fournisseurs/types';
import {
  assertRefUniqueness,
  buildFactureDashboard,
  canAssignStep,
  cellStr,
  formatDateCell,
  parseMontant,
  stepFields,
  withComputedStatut,
} from '@/lib/factures-fournisseurs/utils';
import { FACTURES_FOURNISSEURS_XLSX_PATH } from '@/lib/factures-fournisseurs/paths';

const EXCEL_PATH = FACTURES_FOURNISSEURS_XLSX_PATH;

const SHEET_NAME = 'Factures';
/** Ligne titre = 0, en-têtes = 1, données à partir de 2. */
const HEADER_ROW = 1;
const DATA_START = 2;

const BUNDLE_CACHE_TTL_MS = 8_000;
let bundleCache:
  | {
      mtimeMs: number;
      expiresAt: number;
      data: { factures: FactureSuivi[]; dashboard: FactureDashboard };
    }
  | null = null;
let bundleInFlight: Promise<{ factures: FactureSuivi[]; dashboard: FactureDashboard }> | null = null;

function getExcelMtimeMs(): number {
  try {
    return fs.statSync(EXCEL_PATH).mtimeMs;
  } catch {
    return 0;
  }
}

const COL = {
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

const LAST_COL = COL.commentaire;

const HEADERS = [
  'DATE',
  'SOCIETE',
  'FACTURE',
  'MONTANT',
  'Echeance',
  'PR',
  'DATE PR',
  'P.O',
  'DATE PO',
  'GRN',
  'DATE GRN',
  'payment',
  'DATE PYM',
  'Statut',
  'Commentaire',
];

interface WorkbookState {
  filePath: string;
  wb: Awaited<ReturnType<typeof readWorkbook>>;
  ws: import('xlsx-js-style').WorkSheet;
  dataRows: AoaRow[];
}

function factureIdFromRow(rowIndex: number): string {
  return `fac-${rowIndex}`;
}

function parseRowId(id: string): number | null {
  const match = id.trim().match(/^fac-(\d+)$/);
  if (!match) return null;
  const rowIndex = Number.parseInt(match[1], 10);
  return Number.isInteger(rowIndex) && rowIndex >= DATA_START ? rowIndex : null;
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
    headers.includes('nomduvoyageur') ||
    headers.includes('costcenter') ||
    headers.includes('san') ||
    headers.includes('datesan') ||
    headers.includes('posting') ||
    headers.includes('dateposting')
  );
}

/** Ancien layout A–M sans colonnes payment / DATE PYM. */
function isPrePaymentHeaderRow(headerRow: AoaRow): boolean {
  const headers = headerRow.map(normalizeHeader);
  if (isLegacyHeaderRow(headerRow)) return false;
  const hasStatut = headers.includes('statut') || headers.includes('status');
  const hasPayment = headers.includes('payment') || headers.includes('datepym');
  return hasStatut && !hasPayment;
}

function legacyRowToFacture(row: AoaRow, rowIndex: number): FactureSuivi | null {
  // Old layout: DATE SOCIETE FACTURE MONTANT Echeance VOYAGEUR COST PR DATEPR PO DATEPO SAN DATESAN GRN DATEGRN Posting DATEPosting Payment DATEpayment Statut
  const facture = cellStr(row[2]);
  const societe = cellStr(row[1]);
  if (!facture && !societe) return null;
  return withComputedStatut({
    id: factureIdFromRow(rowIndex),
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

function prePaymentRowToFacture(row: AoaRow, rowIndex: number): FactureSuivi | null {
  const facture = cellStr(row[2]);
  const societe = cellStr(row[1]);
  if (!facture && !societe) return null;
  return withComputedStatut({
    id: factureIdFromRow(rowIndex),
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

async function loadState(): Promise<WorkbookState> {
  const wb = await readWorkbook(EXCEL_PATH);
  const ws = getSheet(wb, SHEET_NAME);
  const sheet = getSheetBlock(wb, SHEET_NAME, DATA_START, { maxCols: 20 });
  return { filePath: EXCEL_PATH, wb, ws, dataRows: sheet.dataRows };
}

function ensureHeader(ws: WorkbookState['ws']): void {
  writeRowValues(ws, 0, ['FACTURES FOURNISSEURS']);
  writeRowValues(ws, HEADER_ROW, HEADERS);
}

function rowToFacture(row: AoaRow, rowIndex: number): FactureSuivi | null {
  const facture = cellStr(row[COL.facture]);
  const societe = cellStr(row[COL.societe]);
  if (!facture && !societe) return null;

  return withComputedStatut({
    id: factureIdFromRow(rowIndex),
    date: formatDateCell(row[COL.date]),
    societe,
    facture,
    montant: parseMontant(row[COL.montant]),
    echeance: formatDateCell(row[COL.echeance]),
    pr: cellStr(row[COL.pr]),
    datePr: formatDateCell(row[COL.datePr]),
    po: cellStr(row[COL.po]),
    datePo: formatDateCell(row[COL.datePo]),
    grn: cellStr(row[COL.grn]),
    dateGrn: formatDateCell(row[COL.dateGrn]),
    payment: cellStr(row[COL.payment]),
    datePym: formatDateCell(row[COL.datePym]),
    commentaire: cellStr(row[COL.commentaire]),
  });
}

function toRowValues(item: FactureSuivi): AoaRow {
  return [
    item.date,
    item.societe,
    item.facture,
    item.montant ?? '',
    item.echeance,
    item.pr,
    item.datePr,
    item.po,
    item.datePo,
    item.grn,
    item.dateGrn,
    item.payment,
    item.datePym,
    item.statutLabel,
    item.commentaire,
  ];
}

function mergeInput(existing: FactureSuivi | null, input: FactureSuiviInput): FactureSuivi {
  const base =
    existing ??
    withComputedStatut({
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
    commentaire:
      input.commentaire !== undefined ? String(input.commentaire).trim() : base.commentaire,
  });
}

function findNextEmptyRow(dataRows: AoaRow[]): number {
  const firstEmpty = dataRows.findIndex(
    (row) => !cellStr(row[COL.facture]) && !cellStr(row[COL.societe]),
  );
  if (firstEmpty >= 0) return firstEmpty;
  return dataRows.length;
}

function listFromState(state: WorkbookState): FactureSuivi[] {
  const block = getSheetBlock(state.wb, SHEET_NAME, DATA_START, { maxCols: 24 });
  const headerRow = block.headerRows[HEADER_ROW] ?? [];
  const legacy = isLegacyHeaderRow(headerRow);
  const prePayment = isPrePaymentHeaderRow(headerRow);
  const items: FactureSuivi[] = [];
  block.dataRows.forEach((row, index) => {
    const item = legacy
      ? legacyRowToFacture(row, DATA_START + index)
      : prePayment
        ? prePaymentRowToFacture(row, DATA_START + index)
        : rowToFacture(row, DATA_START + index);
    if (item) items.push(item);
  });
  return items;
}

async function migrateLegacyIfNeeded(state: WorkbookState): Promise<WorkbookState> {
  const block = getSheetBlock(state.wb, SHEET_NAME, DATA_START, { maxCols: 24 });
  const headerRow = block.headerRows[HEADER_ROW] ?? [];
  const needsRewrite = isLegacyHeaderRow(headerRow) || isPrePaymentHeaderRow(headerRow);
  if (!needsRewrite) {
    ensureHeader(state.ws);
    return state;
  }

  const migrated = listFromState(state);
  ensureHeader(state.ws);
  migrated.forEach((item, index) => {
    const rowIndex = DATA_START + index;
    writeRowValues(state.ws, rowIndex, toRowValues({ ...item, id: factureIdFromRow(rowIndex) }));
  });
  for (let i = migrated.length; i < block.dataRows.length; i += 1) {
    writeRowValues(state.ws, DATA_START + i, Array(LAST_COL + 1).fill(''));
  }
  await saveWorkbook(state.wb, state.filePath);
  return loadState();
}

export async function listFacturesSuivi(): Promise<FactureSuivi[]> {
  return withExcelLock(EXCEL_PATH, async () => {
    // Fast path: read workbook without style metadata (much faster),
    // detect legacy layout from headers, and only fallback to the slow
    // styled read + migration when strictly necessary.
    const wbData = await readWorkbookForData(EXCEL_PATH);
    const block = getSheetBlock(wbData, SHEET_NAME, DATA_START, { maxCols: 20 });
    const headerRow = block.headerRows[HEADER_ROW] ?? [];
    const legacy = isLegacyHeaderRow(headerRow);
    const prePayment = isPrePaymentHeaderRow(headerRow);

    const sortFn = (a: FactureSuivi, b: FactureSuivi) => {
      const da = a.date || a.echeance;
      const db = b.date || b.echeance;
      return db.localeCompare(da, 'fr') || a.facture.localeCompare(b.facture, 'fr');
    };

    if (!legacy && !prePayment) {
      const items: FactureSuivi[] = [];
      block.dataRows.forEach((row, index) => {
        const rowIndex = DATA_START + index;
        const item = rowToFacture(row, rowIndex);
        if (item) items.push(item);
      });
      return items.sort(sortFn);
    }

    let state = await loadState();
    state = await migrateLegacyIfNeeded(state);
    return listFromState(state).sort(sortFn);
  });
}

export async function getFacturesSuiviBundle(): Promise<{
  factures: FactureSuivi[];
  dashboard: FactureDashboard;
}> {
  const mtimeMs = getExcelMtimeMs();
  const now = Date.now();

  if (bundleCache && bundleCache.mtimeMs === mtimeMs && now < bundleCache.expiresAt) {
    return bundleCache.data;
  }
  if (bundleInFlight) return bundleInFlight;

  bundleInFlight = (async () => {
    const factures = await listFacturesSuivi();
    const dashboard = buildFactureDashboard(factures);
    const data = { factures, dashboard };
    bundleCache = { mtimeMs, expiresAt: Date.now() + BUNDLE_CACHE_TTL_MS, data };
    return data;
  })().finally(() => {
    bundleInFlight = null;
  });

  return bundleInFlight;
}

export async function upsertFactureSuivi(input: FactureSuiviInput): Promise<FactureSuivi> {
  return withExcelLock(EXCEL_PATH, async () => {
    let state = await loadState();
    state = await migrateLegacyIfNeeded(state);
    ensureHeader(state.ws);

    const existingRow = input.id ? parseRowId(input.id) : null;
    let existing: FactureSuivi | null = null;
    let targetRowIndex: number;
    const all = listFromState(state);

    if (existingRow != null) {
      const relative = existingRow - DATA_START;
      const row = state.dataRows[relative];
      if (!row) throw new Error('Facture introuvable');
      existing = rowToFacture(row, existingRow);
      if (!existing) throw new Error('Facture introuvable');
      targetRowIndex = existingRow;
    } else {
      targetRowIndex = DATA_START + findNextEmptyRow(state.dataRows);
      const styleSource = targetRowIndex > DATA_START ? targetRowIndex - 1 : DATA_START;
      cloneRowStyle(state.ws, styleSource, targetRowIndex, 0, LAST_COL);
    }

    const next = mergeInput(existing, input);
    if (!next.facture.trim()) throw new Error('Numéro de facture requis');
    if (!next.societe.trim()) throw new Error('Société (fournisseur) requise');

    next.id = factureIdFromRow(targetRowIndex);
    const others = all.filter((f) => f.id !== next.id);
    assertRefUniqueness(others, [next]);

    writeRowValues(state.ws, targetRowIndex, toRowValues(next));
    await saveWorkbook(state.wb, state.filePath);
    return next;
  });
}

export async function upsertFacturesBatch(lines: FactureBatchLineInput[]): Promise<FactureSuivi[]> {
  if (!lines.length) throw new Error('Aucune facture à enregistrer');

  return withExcelLock(EXCEL_PATH, async () => {
    let state = await loadState();
    state = await migrateLegacyIfNeeded(state);
    ensureHeader(state.ws);

    const existing = listFromState(state);
    const created: FactureSuivi[] = [];
    let nextRelative = findNextEmptyRow(state.dataRows);

    for (const line of lines) {
      const targetRowIndex = DATA_START + nextRelative;
      const styleSource = targetRowIndex > DATA_START ? targetRowIndex - 1 : DATA_START;
      cloneRowStyle(state.ws, styleSource, targetRowIndex, 0, LAST_COL);

      const next = mergeInput(null, {
        date: line.date,
        societe: line.societe,
        facture: line.facture,
        montant: line.montant,
        echeance: line.echeance,
        pr: line.pr,
        datePr: line.datePr,
      });
      if (!next.facture.trim()) throw new Error('Numéro de facture requis sur chaque ligne');
      if (!next.societe.trim()) throw new Error('Société requise sur chaque ligne');
      next.id = factureIdFromRow(targetRowIndex);

      assertRefUniqueness([...existing, ...created], [next]);
      writeRowValues(state.ws, targetRowIndex, toRowValues(next));
      created.push(next);
      nextRelative += 1;
    }

    await saveWorkbook(state.wb, state.filePath);
    return created;
  });
}

export async function deleteFactureSuivi(id: string): Promise<boolean> {
  return withExcelLock(EXCEL_PATH, async () => {
    let state = await loadState();
    state = await migrateLegacyIfNeeded(state);
    const rowIndex = parseRowId(id);
    if (rowIndex == null) return false;
    const relative = rowIndex - DATA_START;
    if (relative < 0 || relative >= state.dataRows.length) return false;
    if (!rowToFacture(state.dataRows[relative], rowIndex)) return false;
    shiftRowsUp(state.ws, rowIndex, 1);
    await saveWorkbook(state.wb, state.filePath);
    return true;
  });
}

export async function assignFactureStep(payload: AssignStepPayload): Promise<FactureSuivi[]> {
  const numero = payload.numero.trim();
  const date = payload.date.trim();
  const ids = [...new Set(payload.ids.map((id) => id.trim()).filter(Boolean))];
  if (!numero) throw new Error('Numéro requis');
  if (!date) throw new Error('Date requise');
  if (!ids.length) throw new Error('Sélectionnez au moins une facture');

  return withExcelLock(EXCEL_PATH, async () => {
    let state = await loadState();
    state = await migrateLegacyIfNeeded(state);
    ensureHeader(state.ws);
    const { numeroKey, dateKey } = stepFields(payload.step);
    const all = listFromState(state);
    const selected: FactureSuivi[] = [];

    for (const id of ids) {
      const rowIndex = parseRowId(id);
      if (rowIndex == null) throw new Error(`Facture invalide: ${id}`);
      const relative = rowIndex - DATA_START;
      const row = state.dataRows[relative];
      if (!row) throw new Error(`Facture introuvable: ${id}`);
      const current = rowToFacture(row, rowIndex);
      if (!current) throw new Error(`Facture introuvable: ${id}`);
      if (!canAssignStep(current, payload.step)) {
        throw new Error(
          `La facture ${current.facture} n'est pas à l'étape requise pour ${payload.step.toUpperCase()} (statut actuel: ${current.statutLabel})`,
        );
      }
      selected.push(current);
    }

    if (payload.step === 'grn') {
      const poSet = new Set(selected.map((f) => f.po.trim()).filter(Boolean));
      if (poSet.size !== 1) {
        throw new Error(
          'Pour affecter un GRN, toutes les factures sélectionnées doivent partager le même PO',
        );
      }
    }

    const updated: FactureSuivi[] = [];
    const others = all.filter((f) => !ids.includes(f.id));

    for (const current of selected) {
      const next = withComputedStatut({
        ...current,
        [numeroKey]: numero,
        [dateKey]: date,
        commentaire: '',
      } as FactureSuivi);

      assertRefUniqueness([...others, ...updated], [next]);
      const rowIndex = parseRowId(current.id);
      if (rowIndex == null) continue;
      writeRowValues(state.ws, rowIndex, toRowValues(next));
      updated.push(next);
    }

    await saveWorkbook(state.wb, state.filePath);
    return updated;
  });
}

export async function importFacturesSuiviRows(
  rows: FactureSuiviInput[],
): Promise<{ imported: number; skipped: number }> {
  if (!rows.length) throw new Error('Aucune ligne à importer');

  return withExcelLock(EXCEL_PATH, async () => {
    let state = await loadState();
    state = await migrateLegacyIfNeeded(state);
    ensureHeader(state.ws);

    const existing = listFromState(state);
    const existingKeys = new Set(
      existing.map((f) => `${f.facture.trim().toLowerCase()}|${f.societe.trim().toLowerCase()}`),
    );

    let imported = 0;
    let skipped = 0;
    let nextRelative = findNextEmptyRow(state.dataRows);
    const created: FactureSuivi[] = [];

    for (const input of rows) {
      const key = `${String(input.facture ?? '')
        .trim()
        .toLowerCase()}|${String(input.societe ?? '')
        .trim()
        .toLowerCase()}`;
      if (!input.facture?.trim() || !input.societe?.trim()) {
        skipped += 1;
        continue;
      }
      if (existingKeys.has(key)) {
        skipped += 1;
        continue;
      }

      const targetRowIndex = DATA_START + nextRelative;
      const styleSource = targetRowIndex > DATA_START ? targetRowIndex - 1 : DATA_START;
      cloneRowStyle(state.ws, styleSource, targetRowIndex, 0, LAST_COL);

      const next = mergeInput(null, { ...input, commentaire: '' });
      next.id = factureIdFromRow(targetRowIndex);

      assertRefUniqueness([...existing, ...created], [next]);
      writeRowValues(state.ws, targetRowIndex, toRowValues(next));
      created.push(next);
      existingKeys.add(key);
      imported += 1;
      nextRelative += 1;
    }

    await saveWorkbook(state.wb, state.filePath);
    return { imported, skipped };
  });
}

export type { AssignStep };
