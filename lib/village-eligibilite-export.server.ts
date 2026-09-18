import 'server-only';

import ExcelJS from 'exceljs';
import { buildExportDateStamp } from './employee-filters';
import {
  ELIGIBILITE_CRITERIA,
  ELIGIBILITE_MAX_TOTAL,
  type VillageEligibiliteRow,
} from './village-eligibilite';

export function villageEligibiliteExportFilename(): string {
  return `VILLAGE_ELIGIBILITE_KIMPESE_${buildExportDateStamp()}.xlsx`;
}

export interface VillageEligibiliteFamilyBaseRow {
  matricule: string;
  nom: string;
  dependantsCount: number;
  enfantsCount: number;
  dependantsNames: string;
}

export interface VillageEligibiliteFamilyDetailRow {
  matriculeAgent: string;
  nomAgent: string;
  matriculeDependant: string;
  nomDependant: string;
  statut: string;
  sexe: string;
  age: string;
}

const PPC_RED = 'FFE30613';
const HEADER_BG = 'FFF1F5F9';
const CRIT_BG = 'FFEEF2FF';
const TITLE_BG = 'FF0F172A';
const BASE_SHEET = 'Base agents';
const DETAIL_SHEET = 'Détail famille';

/** Colonnes : A N° … H Dépendants, I–M critères, N % élig., O Note */
const COL = {
  n: 1,
  matricule: 2,
  nom: 3,
  fonction: 4,
  departement: 5,
  grade: 6,
  anciennete: 7,
  dependants: 8,
  critStart: 9,
  family: 13,
  total: 14,
  note: 15,
} as const;

function colLetter(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function styleHeaderRow(ws: ExcelJS.Worksheet, row: number, colCount: number, critFrom?: number, critTo?: number) {
  for (let i = 1; i <= colCount; i += 1) {
    const cell = ws.getCell(row, i);
    cell.font = { bold: true, size: 10 };
    cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
    const inCrit = critFrom != null && critTo != null && i >= critFrom && i <= critTo;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: inCrit ? CRIT_BG : HEADER_BG },
    };
    cell.border = {
      bottom: { style: 'thin', color: { argb: PPC_RED } },
    };
  }
  ws.getRow(row).height = 28;
}

function writeBaseAgentsSheet(
  wb: ExcelJS.Workbook,
  baseRows: VillageEligibiliteFamilyBaseRow[],
): { sheetName: string; dataStart: number; dataEnd: number } {
  const ws = wb.addWorksheet(BASE_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const headers = ['Matricule', 'Nom agent', 'Nb dépendants', 'Nb enfants', 'Noms dépendants'];
  headers.forEach((h, i) => {
    ws.getCell(1, i + 1).value = h;
  });
  styleHeaderRow(ws, 1, headers.length);

  baseRows.forEach((row, index) => {
    const r = index + 2;
    ws.getCell(r, 1).value = row.matricule;
    ws.getCell(r, 2).value = row.nom;
    ws.getCell(r, 3).value = row.dependantsCount;
    ws.getCell(r, 3).alignment = { horizontal: 'center' };
    ws.getCell(r, 4).value = row.enfantsCount;
    ws.getCell(r, 4).alignment = { horizontal: 'center' };
    ws.getCell(r, 5).value = row.dependantsNames || '';
  });

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 28;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 48;

  if (baseRows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: baseRows.length + 1, column: headers.length },
    };
  }

  return {
    sheetName: BASE_SHEET,
    dataStart: 2,
    dataEnd: Math.max(2, baseRows.length + 1),
  };
}

function writeFamilyDetailSheet(
  wb: ExcelJS.Workbook,
  detailRows: VillageEligibiliteFamilyDetailRow[],
) {
  const ws = wb.addWorksheet(DETAIL_SHEET, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  const headers = [
    'Matricule agent',
    'Nom agent',
    'Matricule dépendant',
    'Nom dépendant',
    'Statut',
    'Sexe',
    'Âge',
  ];
  headers.forEach((h, i) => {
    ws.getCell(1, i + 1).value = h;
  });
  styleHeaderRow(ws, 1, headers.length);

  detailRows.forEach((row, index) => {
    const r = index + 2;
    ws.getCell(r, 1).value = row.matriculeAgent;
    ws.getCell(r, 2).value = row.nomAgent;
    ws.getCell(r, 3).value = row.matriculeDependant || '';
    ws.getCell(r, 4).value = row.nomDependant;
    ws.getCell(r, 5).value = row.statut;
    ws.getCell(r, 6).value = row.sexe;
    ws.getCell(r, 7).value = row.age;
  });

  const widths = [14, 26, 16, 26, 14, 8, 8];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  if (detailRows.length > 0) {
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: detailRows.length + 1, column: headers.length },
    };
  }
}

export async function buildVillageEligibiliteWorkbookBuffer(
  rows: VillageEligibiliteRow[],
  familyBase: VillageEligibiliteFamilyBaseRow[] = [],
  familyDetail: VillageEligibiliteFamilyDetailRow[] = [],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RH PPCB';
  wb.created = new Date();

  const ws = wb.addWorksheet('Eligibilité Kimpese', {
    views: [{ state: 'frozen', ySplit: 4 }],
  });

  // Base + détail (référencés par VLOOKUP / liste famille)
  const baseMeta = writeBaseAgentsSheet(wb, familyBase);
  writeFamilyDetailSheet(wb, familyDetail);

  const lastCol = COL.note;
  const stamp = new Date().toLocaleString('fr-FR');

  ws.mergeCells(1, 1, 1, lastCol);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = 'Éligibilité au village — Agents à Kimpese';
  titleCell.font = { bold: true, size: 16, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  ws.getRow(1).height = 28;

  ws.mergeCells(2, 1, 2, lastCol);
  const sub = ws.getCell(2, 1);
  sub.value = `${rows.length} agent(s) · Export ${stamp} · Dépendants = RECHERCHEV vers « ${BASE_SHEET} » · Family auto (0–3 dép. ×3 pts, dès 4 = 20) · Total max ${ELIGIBILITE_MAX_TOTAL}`;
  sub.font = { size: 10, italic: true, color: { argb: 'FF64748B' } };
  sub.alignment = { vertical: 'middle', wrapText: true };
  ws.getRow(2).height = 22;
  ws.getRow(3).height = 8;

  const headerRow = 4;
  const headers = [
    'N°',
    'Matricule',
    'Nom',
    'Fonction',
    'Département',
    'Grade',
    'Ancienneté',
    'Dépendants',
    ...ELIGIBILITE_CRITERIA.map((c) => `${c.short} /${c.max}`),
    `% éligibilité`,
    'Note',
  ];
  headers.forEach((h, i) => {
    ws.getCell(headerRow, i + 1).value = h;
  });
  styleHeaderRow(ws, headerRow, headers.length, COL.critStart, COL.family);

  const dataStart = headerRow + 1;
  const vlookupRange = `'${baseMeta.sheetName}'!$A$${baseMeta.dataStart}:$D$${baseMeta.dataEnd}`;
  const matColL = colLetter(COL.matricule);
  const depColL = colLetter(COL.dependants);
  const critStartL = colLetter(COL.critStart);
  const familyL = colLetter(COL.family);

  rows.forEach((row, index) => {
    const r = dataStart + index;

    ws.getCell(r, COL.n).value = row.n;
    ws.getCell(r, COL.matricule).value = row.matricule;
    ws.getCell(r, COL.nom).value = row.nom;
    ws.getCell(r, COL.fonction).value = row.fonction;
    ws.getCell(r, COL.departement).value = row.departement;
    ws.getCell(r, COL.grade).value = row.grade;
    ws.getCell(r, COL.anciennete).value = row.anciennete;

    // Nb dépendants via RECHERCHEV sur Base agents (col 3)
    const depCell = ws.getCell(r, COL.dependants);
    depCell.value = {
      formula: `IFERROR(VLOOKUP(${matColL}${r},${vlookupRange},3,FALSE),0)`,
    };
    depCell.alignment = { horizontal: 'center' };

    ELIGIBILITE_CRITERIA.forEach((c, ci) => {
      const col = COL.critStart + ci;
      const cell = ws.getCell(r, col);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: CRIT_BG },
      };
      cell.alignment = { horizontal: 'center' };
      if (c.key === 'familyComposition') {
        // Family auto : Nb dépendants — 0–3 × 3 pts ; dès 4 → 20
        cell.value = {
          formula: `IF(MAX(0,${depColL}${r})>3,20,MAX(0,${depColL}${r})*3)`,
        };
      } else {
        const v = row.scores[c.key];
        cell.value = typeof v === 'number' ? v : null;
      }
    });

    const totalCell = ws.getCell(r, COL.total);
    totalCell.value = {
      formula: `IF(COUNTA(${critStartL}${r}:${familyL}${r})=0,0,ROUND(SUM(${critStartL}${r}:${familyL}${r})/${ELIGIBILITE_MAX_TOTAL}*100,1))`,
    };
    totalCell.numFmt = '0.0"%"';
    totalCell.font = { bold: true, color: { argb: PPC_RED } };
    totalCell.alignment = { horizontal: 'center' };

    ws.getCell(r, COL.note).value = row.note || '';
  });

  const dataEnd = dataStart + Math.max(rows.length, 1) - 1;

  if (rows.length > 0) {
    const avgRow = dataEnd + 2;
    ws.getCell(avgRow, COL.nom).value = 'Moyenne % éligibilité';
    ws.getCell(avgRow, COL.nom).font = { bold: true };
    const avgCell = ws.getCell(avgRow, COL.total);
    avgCell.value = {
      formula: `IFERROR(ROUND(AVERAGE(${colLetter(COL.total)}${dataStart}:${colLetter(COL.total)}${dataEnd}),1),0)`,
    };
    avgCell.numFmt = '0.0"%"';
    avgCell.font = { bold: true, color: { argb: PPC_RED } };
  }

  const widths = [5, 12, 26, 20, 14, 8, 12, 11, 10, 10, 10, 10, 10, 11, 14];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  if (rows.length > 0) {
    ws.autoFilter = {
      from: { row: headerRow, column: 1 },
      to: { row: dataEnd, column: lastCol },
    };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
