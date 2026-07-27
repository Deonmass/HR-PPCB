import 'server-only';

import {
  cloneRowStyle,
  getSheet,
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  shiftRowsUp,
  withExcelLock,
  writeRowValues,
  type AoaRow,
} from './excel-io';
import type { Fournisseur } from './fournisseurs-types';
import { FACTURES_FOURNISSEURS_XLSX_PATH } from '@/lib/factures-fournisseurs/paths';

const EXCEL_PATH = FACTURES_FOURNISSEURS_XLSX_PATH;

const SHEET_NAME = 'Fournisseurs';
/** Première ligne de données (0-based) — ligne 1 = en-têtes. */
const DATA_START = 1;
const COL_NOM = 0;
const COL_NATURE = 1;

interface WorkbookState {
  filePath: string;
  wb: Awaited<ReturnType<typeof readWorkbook>>;
  ws: import('xlsx-js-style').WorkSheet;
  dataRows: AoaRow[];
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

export function fournisseurIdFromRow(rowIndex: number): string {
  return `frn-${rowIndex}`;
}

function parseRowId(id: string): number | null {
  const match = id.trim().match(/^frn-(\d+)$/);
  if (!match) return null;
  const rowIndex = Number.parseInt(match[1], 10);
  return Number.isInteger(rowIndex) && rowIndex >= DATA_START ? rowIndex : null;
}

async function loadState(): Promise<WorkbookState> {
  const wb = await readWorkbook(EXCEL_PATH);
  const ws = getSheet(wb, SHEET_NAME);
  const sheet = getSheetBlock(wb, SHEET_NAME, DATA_START);
  return { filePath: EXCEL_PATH, wb, ws, dataRows: sheet.dataRows };
}

function ensureHeader(ws: WorkbookState['ws']): void {
  writeRowValues(ws, 0, ["Noms de l'ETS", 'Nature de service']);
}

function findNextEmptyRow(dataRows: AoaRow[]): number {
  const firstEmpty = dataRows.findIndex((row) => !str(row[COL_NOM]) && !str(row[COL_NATURE]));
  if (firstEmpty >= 0) return firstEmpty;
  return dataRows.length;
}

function rowToFournisseur(row: AoaRow, rowIndex: number): Fournisseur | null {
  const nom = str(row[COL_NOM]);
  if (!nom) return null;
  return {
    id: fournisseurIdFromRow(rowIndex),
    nom,
    natureService: str(row[COL_NATURE]),
  };
}

export async function listFournisseurs(): Promise<Fournisseur[]> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const items: Fournisseur[] = [];
    state.dataRows.forEach((row, index) => {
      const item = rowToFournisseur(row, DATA_START + index);
      if (item) items.push(item);
    });
    return items.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  });
}

export async function upsertFournisseur(item: Partial<Fournisseur> & { nom: string }): Promise<Fournisseur> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    ensureHeader(state.ws);

    const nom = item.nom.trim();
    const natureService = (item.natureService ?? '').trim();
    if (!nom) throw new Error("Nom de l'ETS requis");

    const existingRow = item.id ? parseRowId(item.id) : null;
    let targetRowIndex: number;

    if (existingRow != null) {
      const relative = existingRow - DATA_START;
      if (relative < 0 || relative >= state.dataRows.length || !str(state.dataRows[relative]?.[COL_NOM])) {
        throw new Error('Fournisseur introuvable');
      }
      targetRowIndex = existingRow;
    } else {
      targetRowIndex = DATA_START + findNextEmptyRow(state.dataRows);
      const styleSourceRow = targetRowIndex > DATA_START ? targetRowIndex - 1 : DATA_START;
      cloneRowStyle(state.ws, styleSourceRow, targetRowIndex, COL_NOM, COL_NATURE);
    }

    writeRowValues(state.ws, targetRowIndex, [nom, natureService]);
    await saveWorkbook(state.wb, state.filePath);

    return {
      id: fournisseurIdFromRow(targetRowIndex),
      nom,
      natureService,
    };
  });
}

export async function deleteFournisseur(id: string): Promise<boolean> {
  return withExcelLock(EXCEL_PATH, async () => {
    const state = await loadState();
    const rowIndex = parseRowId(id);
    if (rowIndex == null) return false;

    const relative = rowIndex - DATA_START;
    if (relative < 0 || relative >= state.dataRows.length || !str(state.dataRows[relative]?.[COL_NOM])) {
      return false;
    }

    shiftRowsUp(state.ws, rowIndex, 1);
    await saveWorkbook(state.wb, state.filePath);
    return true;
  });
}
