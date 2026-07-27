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
  AFFECTATION_HISTO_COL,
  AFFECTATION_HISTO_DATA_START,
  AFFECTATION_HISTO_HEADERS,
  AFFECTATION_HISTO_SHEET,
} from './village-columns';
import { getEmployeeWorkbookPath } from './excel-data-paths';

const EXCEL_PATH = getEmployeeWorkbookPath();

export interface VillageAffectationHistoryEntry {
  date: string;
  action: 'Affecter' | 'Liberer' | string;
  matricule: string;
  nom: string;
  numeroVilla: string;
  typeMaison: string;
  ancienNumero: string;
  raison: string;
  commentaire: string;
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function nowDisplay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ensureHistoSheet(wb: XLSX.WorkBook): XLSX.WorkSheet {
  if (wb.Sheets[AFFECTATION_HISTO_SHEET]) return wb.Sheets[AFFECTATION_HISTO_SHEET]!;
  const ws = XLSX.utils.aoa_to_sheet([AFFECTATION_HISTO_HEADERS.slice()]);
  XLSX.utils.book_append_sheet(wb, ws, AFFECTATION_HISTO_SHEET);
  return ws;
}

function rowToEntry(row: AoaRow): VillageAffectationHistoryEntry | null {
  const matricule = str(row[AFFECTATION_HISTO_COL.matricule]);
  const date = str(row[AFFECTATION_HISTO_COL.date]);
  if (!date && !matricule) return null;
  return {
    date,
    action: str(row[AFFECTATION_HISTO_COL.action]) || 'Affecter',
    matricule,
    nom: str(row[AFFECTATION_HISTO_COL.nom]),
    numeroVilla: str(row[AFFECTATION_HISTO_COL.numeroVilla]),
    typeMaison: str(row[AFFECTATION_HISTO_COL.typeMaison]),
    ancienNumero: str(row[AFFECTATION_HISTO_COL.ancienNumero]),
    raison: str(row[AFFECTATION_HISTO_COL.raison]),
    commentaire: str(row[AFFECTATION_HISTO_COL.commentaire]),
  };
}

export async function readAffectationHistory(): Promise<VillageAffectationHistoryEntry[]> {
  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    ensureHistoSheet(wb);
    const block = getSheetBlock(wb, AFFECTATION_HISTO_SHEET, AFFECTATION_HISTO_DATA_START, {
      keyCol: 0,
    });
    return block.dataRows
      .map(rowToEntry)
      .filter((e): e is VillageAffectationHistoryEntry => Boolean(e))
      .reverse();
  });
}

export async function appendAffectationHistory(
  entries: Array<Partial<VillageAffectationHistoryEntry> & { matricule: string; action: string }>,
): Promise<void> {
  if (!entries.length) return;

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    const ws = ensureHistoSheet(wb);
    const block = getSheetBlock(wb, AFFECTATION_HISTO_SHEET, AFFECTATION_HISTO_DATA_START, {
      keyCol: 0,
    });

    for (const entry of entries) {
      const row: AoaRow = [
        entry.date || nowDisplay(),
        entry.action,
        entry.matricule,
        entry.nom ?? '',
        entry.numeroVilla ?? '',
        entry.typeMaison ?? '',
        entry.ancienNumero ?? '',
        entry.raison ?? '',
        entry.commentaire ?? '',
      ];
      writeRowValues(ws, AFFECTATION_HISTO_DATA_START + block.dataRows.length, row);
      block.dataRows.push(row);
    }

    await saveWorkbook(wb, EXCEL_PATH);
  });
}
