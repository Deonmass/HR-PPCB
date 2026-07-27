import 'server-only';

import path from 'path';
import * as XLSX from 'xlsx-js-style';
import {
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  withExcelLock,
  writeRowValues,
  type AoaRow,
} from './excel-io';
import {
  SUGGESTION_AFFECTATION_COL,
  SUGGESTION_AFFECTATION_DATA_START,
  SUGGESTION_AFFECTATION_HEADERS,
  SUGGESTION_AFFECTATION_SHEET,
} from './village-columns';
import { getEmployeeWorkbookPath } from './excel-data-paths';

const EXCEL_PATH = getEmployeeWorkbookPath();

export interface VillageAffectationSuggestion {
  id: string;
  numeroVilla: string;
  matricule: string;
  nom: string;
  commentaire: string;
  createdAt: string;
}

export interface VillageAffectationSuggestionForm {
  id?: string;
  numeroVilla: string;
  matricule: string;
  nom?: string;
  commentaire?: string;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function nowDisplay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function newId(): string {
  return `sug-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function ensureSuggestionSheet(wb: XLSX.WorkBook): XLSX.WorkSheet {
  if (wb.Sheets[SUGGESTION_AFFECTATION_SHEET]) {
    return wb.Sheets[SUGGESTION_AFFECTATION_SHEET]!;
  }
  const ws = XLSX.utils.aoa_to_sheet([SUGGESTION_AFFECTATION_HEADERS.slice()]);
  XLSX.utils.book_append_sheet(wb, ws, SUGGESTION_AFFECTATION_SHEET);
  return ws;
}

function rowToSuggestion(row: AoaRow): VillageAffectationSuggestion | null {
  const id = str(row[SUGGESTION_AFFECTATION_COL.id]);
  const numeroVilla = str(row[SUGGESTION_AFFECTATION_COL.numeroVilla]);
  if (!id || !numeroVilla) return null;
  return {
    id,
    numeroVilla,
    matricule: str(row[SUGGESTION_AFFECTATION_COL.matricule]),
    nom: str(row[SUGGESTION_AFFECTATION_COL.nom]),
    commentaire: str(row[SUGGESTION_AFFECTATION_COL.commentaire]),
    createdAt: str(row[SUGGESTION_AFFECTATION_COL.createdAt]),
  };
}

function suggestionToRow(data: VillageAffectationSuggestion): AoaRow {
  return [
    data.id,
    data.numeroVilla,
    data.matricule,
    data.nom,
    data.commentaire,
    data.createdAt,
  ];
}

export async function readAffectationSuggestions(
  numeroVilla?: string,
): Promise<VillageAffectationSuggestion[]> {
  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    ensureSuggestionSheet(wb);
    const block = getSheetBlock(wb, SUGGESTION_AFFECTATION_SHEET, SUGGESTION_AFFECTATION_DATA_START, {
      keyCol: 0,
    });
    let list = block.dataRows
      .map(rowToSuggestion)
      .filter((s): s is VillageAffectationSuggestion => Boolean(s));
    if (numeroVilla?.trim()) {
      const key = numeroVilla.trim().toLowerCase();
      list = list.filter((s) => s.numeroVilla.toLowerCase() === key);
    }
    return list.sort((a, b) => a.numeroVilla.localeCompare(b.numeroVilla, 'fr', { numeric: true }));
  });
}

export async function upsertAffectationSuggestion(
  data: VillageAffectationSuggestionForm,
): Promise<VillageAffectationSuggestion> {
  const numeroVilla = data.numeroVilla.trim();
  const matricule = data.matricule.trim();
  if (!numeroVilla) throw new Error('Numéro de maison requis');
  if (!matricule) throw new Error('Matricule agent requis');

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    const ws = ensureSuggestionSheet(wb);
    const block = getSheetBlock(wb, SUGGESTION_AFFECTATION_SHEET, SUGGESTION_AFFECTATION_DATA_START, {
      keyCol: 0,
    });

    const id = data.id?.trim() || newId();
    const idx = block.dataRows.findIndex(
      (r) => str(r[SUGGESTION_AFFECTATION_COL.id]).toLowerCase() === id.toLowerCase(),
    );
    const existing = idx >= 0 ? rowToSuggestion(block.dataRows[idx]!) : null;
    const saved: VillageAffectationSuggestion = {
      id,
      numeroVilla,
      matricule,
      nom: (data.nom ?? existing?.nom ?? '').trim(),
      commentaire: (data.commentaire ?? existing?.commentaire ?? '').trim(),
      createdAt: existing?.createdAt || nowDisplay(),
    };
    const row = suggestionToRow(saved);

    if (idx >= 0) {
      writeRowValues(ws, SUGGESTION_AFFECTATION_DATA_START + idx, row);
      block.dataRows[idx] = row;
    } else {
      writeRowValues(ws, SUGGESTION_AFFECTATION_DATA_START + block.dataRows.length, row);
      block.dataRows.push(row);
    }

    await saveWorkbook(wb, EXCEL_PATH);
    return saved;
  });
}

export async function deleteAffectationSuggestion(id: string): Promise<boolean> {
  const key = id.trim().toLowerCase();
  if (!key) return false;

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    if (!wb.Sheets[SUGGESTION_AFFECTATION_SHEET]) return false;
    const block = getSheetBlock(wb, SUGGESTION_AFFECTATION_SHEET, SUGGESTION_AFFECTATION_DATA_START, {
      keyCol: 0,
    });
    const idx = block.dataRows.findIndex(
      (r) => str(r[SUGGESTION_AFFECTATION_COL.id]).toLowerCase() === key,
    );
    if (idx < 0) return false;

    block.dataRows.splice(idx, 1);
    const aoa = [
      SUGGESTION_AFFECTATION_HEADERS.slice(),
      ...block.dataRows.map((r) => [
        str(r[0]),
        str(r[1]),
        str(r[2]),
        str(r[3]),
        str(r[4]),
        str(r[5]),
      ]),
    ];
    wb.Sheets[SUGGESTION_AFFECTATION_SHEET] = XLSX.utils.aoa_to_sheet(aoa);
    await saveWorkbook(wb, EXCEL_PATH);
    return true;
  });
}
