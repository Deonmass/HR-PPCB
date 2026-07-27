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
  MAISON_COL,
  MAISON_DATA_START,
  MAISON_HEADERS,
  MAISON_SHEET,
  TAILLE_COL,
  TAILLE_DATA_START,
  TAILLE_HEADERS,
  TAILLE_SHEET,
} from './village-columns';
import type {
  VillageMaison,
  VillageMaisonFormData,
  VillageTaille,
  VillageTailleFormData,
} from './village-types';
import { compareMaisonNumero } from './table-sort';

const EXCEL_PATH = process.env.EMPLOYEE_XLSX || path.join(process.cwd(), 'Excel', 'EMPLOYEE.xlsx');

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function numOrNull(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureSheetWithHeaders(
  wb: XLSX.WorkBook,
  sheetName: string,
  headers: readonly string[],
): { ws: XLSX.WorkSheet; created: boolean } {
  if (wb.Sheets[sheetName]) return { ws: wb.Sheets[sheetName]!, created: false };
  const ws = XLSX.utils.aoa_to_sheet([headers.slice()]);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return { ws, created: true };
}

function rowToTaille(row: AoaRow): VillageTaille | null {
  const code = str(row[TAILLE_COL.code]);
  if (!code) return null;
  return {
    code,
    label: str(row[TAILLE_COL.label]) || code,
    capacite: numOrNull(row[TAILLE_COL.capacite]),
    commentaires: str(row[TAILLE_COL.commentaires]),
  };
}

function rowToMaison(row: AoaRow): VillageMaison | null {
  const numero = str(row[MAISON_COL.numero]);
  if (!numero) return null;
  const taille = str(row[MAISON_COL.taille]);
  const typeMaison = str(row[MAISON_COL.typeMaison]) || taille;
  return {
    numero,
    taille,
    typeMaison,
    commentaires: str(row[MAISON_COL.commentaires]),
    occupantExterne: str(row[MAISON_COL.occupantExterne]),
  };
}

function tailleToRow(data: VillageTailleFormData): AoaRow {
  return [
    data.code.trim(),
    (data.label ?? data.code).trim(),
    data.capacite ?? '',
    data.commentaires?.trim() || '',
  ];
}

function maisonToRow(data: VillageMaisonFormData): AoaRow {
  return [
    data.numero.trim(),
    data.taille.trim(),
    data.typeMaison?.trim() || '',
    data.commentaires?.trim() || '',
    data.occupantExterne?.trim() || '',
  ];
}

export async function readVillageCatalog(): Promise<{
  tailles: VillageTaille[];
  maisons: VillageMaison[];
}> {
  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    const tailleSheet = ensureSheetWithHeaders(wb, TAILLE_SHEET, TAILLE_HEADERS);
    const maisonSheet = ensureSheetWithHeaders(wb, MAISON_SHEET, MAISON_HEADERS);

    if (tailleSheet.created || maisonSheet.created) {
      await saveWorkbook(wb, EXCEL_PATH);
    }

    const tailleBlock = getSheetBlock(wb, TAILLE_SHEET, TAILLE_DATA_START, { keyCol: 0 });
    const maisonBlock = getSheetBlock(wb, MAISON_SHEET, MAISON_DATA_START, { keyCol: 0 });

    const tailles = tailleBlock.dataRows
      .map(rowToTaille)
      .filter((item): item is VillageTaille => Boolean(item))
      .sort((a, b) => a.code.localeCompare(b.code, 'fr'));

    const maisons = maisonBlock.dataRows
      .map(rowToMaison)
      .filter((item): item is VillageMaison => Boolean(item))
      .sort((a, b) => compareMaisonNumero(a.numero, b.numero));

    return { tailles, maisons };
  });
}

export async function upsertTaille(data: VillageTailleFormData): Promise<VillageTaille> {
  const code = data.code.trim();
  if (!code) throw new Error('Code taille requis');

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    const { ws } = ensureSheetWithHeaders(wb, TAILLE_SHEET, TAILLE_HEADERS);
    const block = getSheetBlock(wb, TAILLE_SHEET, TAILLE_DATA_START, { keyCol: 0 });
    const row = tailleToRow({ ...data, code });
    const idx = block.dataRows.findIndex((r) => str(r[TAILLE_COL.code]).toLowerCase() === code.toLowerCase());

    if (idx >= 0) {
      writeRowValues(ws, TAILLE_DATA_START + idx, row);
      block.dataRows[idx] = row;
    } else {
      writeRowValues(ws, TAILLE_DATA_START + block.dataRows.length, row);
      block.dataRows.push(row);
    }

    await saveWorkbook(wb, EXCEL_PATH);
    const saved = rowToTaille(row);
    if (!saved) throw new Error('Impossible d’enregistrer la taille');
    return saved;
  });
}

export async function deleteTaille(code: string): Promise<boolean> {
  const key = code.trim().toLowerCase();
  if (!key) return false;

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    if (!wb.Sheets[TAILLE_SHEET]) return false;
    const block = getSheetBlock(wb, TAILLE_SHEET, TAILLE_DATA_START, { keyCol: 0 });
    const idx = block.dataRows.findIndex((r) => str(r[TAILLE_COL.code]).toLowerCase() === key);
    if (idx < 0) return false;

    block.dataRows.splice(idx, 1);
    const aoa = [TAILLE_HEADERS.slice(), ...block.dataRows.map((r) => [
      str(r[0]), str(r[1]), r[2] ?? '', str(r[3]),
    ])];
    wb.Sheets[TAILLE_SHEET] = XLSX.utils.aoa_to_sheet(aoa);
    await saveWorkbook(wb, EXCEL_PATH);
    return true;
  });
}

export async function upsertMaison(data: VillageMaisonFormData): Promise<VillageMaison> {
  const saved = await upsertManyMaisons([data]);
  const first = saved[0];
  if (!first) throw new Error('Impossible d’enregistrer la maison');
  return first;
}

/** Upsert groupé des maisons (un seul verrou Excel). */
export async function upsertManyMaisons(
  items: VillageMaisonFormData[],
): Promise<VillageMaison[]> {
  if (!items.length) return [];

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    const { ws } = ensureSheetWithHeaders(wb, MAISON_SHEET, MAISON_HEADERS);
    const block = getSheetBlock(wb, MAISON_SHEET, MAISON_DATA_START, { keyCol: 0 });
    const saved: VillageMaison[] = [];

    for (const data of items) {
      const numero = data.numero.trim();
      if (!numero) continue;
      const idx = block.dataRows.findIndex(
        (r) => str(r[MAISON_COL.numero]).toLowerCase() === numero.toLowerCase(),
      );
      const existingExterne =
        idx >= 0 ? str(block.dataRows[idx]![MAISON_COL.occupantExterne]) : '';
      const row = maisonToRow({
        ...data,
        numero,
        occupantExterne:
          data.occupantExterne !== undefined ? data.occupantExterne : existingExterne,
      });
      if (idx >= 0) {
        writeRowValues(ws, MAISON_DATA_START + idx, row);
        block.dataRows[idx] = row;
      } else {
        writeRowValues(ws, MAISON_DATA_START + block.dataRows.length, row);
        block.dataRows.push(row);
      }
      const item = rowToMaison(row);
      if (item) saved.push(item);
    }

    await saveWorkbook(wb, EXCEL_PATH);
    return saved;
  });
}

export async function deleteMaison(numero: string): Promise<boolean> {
  const key = numero.trim().toLowerCase();
  if (!key) return false;

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    if (!wb.Sheets[MAISON_SHEET]) return false;
    const block = getSheetBlock(wb, MAISON_SHEET, MAISON_DATA_START, { keyCol: 0 });
    const idx = block.dataRows.findIndex((r) => str(r[MAISON_COL.numero]).toLowerCase() === key);
    if (idx < 0) return false;

    block.dataRows.splice(idx, 1);
    const aoa = [
      MAISON_HEADERS.slice(),
      ...block.dataRows.map((r) => [
        str(r[0]),
        str(r[1]),
        str(r[2]),
        str(r[3]),
        str(r[4]),
      ]),
    ];
    wb.Sheets[MAISON_SHEET] = XLSX.utils.aoa_to_sheet(aoa);
    await saveWorkbook(wb, EXCEL_PATH);
    return true;
  });
}

/** Affecte ou libère un occupant hors effectif (colonne Occupant externe). */
export async function setMaisonOccupantExterne(
  numero: string,
  occupantExterne: string,
): Promise<VillageMaison> {
  const key = numero.trim().toLowerCase();
  if (!key) throw new Error('Numéro de maison requis');

  return withExcelLock(EXCEL_PATH, async () => {
    const wb = await readWorkbook(EXCEL_PATH);
    const { ws } = ensureSheetWithHeaders(wb, MAISON_SHEET, MAISON_HEADERS);
    ws['E1'] = { t: 's', v: 'Occupant externe' };
    const block = getSheetBlock(wb, MAISON_SHEET, MAISON_DATA_START, { keyCol: 0 });
    const idx = block.dataRows.findIndex(
      (r) => str(r[MAISON_COL.numero]).toLowerCase() === key,
    );
    if (idx < 0) throw new Error(`Maison « ${numero} » introuvable`);

    const prev = block.dataRows[idx]!;
    const row: AoaRow = [
      str(prev[MAISON_COL.numero]),
      str(prev[MAISON_COL.taille]),
      str(prev[MAISON_COL.typeMaison]),
      str(prev[MAISON_COL.commentaires]),
      occupantExterne.trim(),
    ];
    writeRowValues(ws, MAISON_DATA_START + idx, row);
    block.dataRows[idx] = row;
    await saveWorkbook(wb, EXCEL_PATH);
    const item = rowToMaison(row);
    if (!item) throw new Error('Maison invalide après enregistrement');
    return item;
  });
}
