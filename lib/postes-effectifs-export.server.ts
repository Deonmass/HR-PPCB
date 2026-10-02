import 'server-only';

import ExcelJS from 'exceljs';
import type { ContractantAccessScope } from './auth-types';
import { loadCapitalHrPosteCapHrMap } from './capital-hr-poste-caphr';
import { listClassificationPostes } from './classification-store';
import { filterContractantsByScope } from './contractant-scope';
import { listContractants } from './contractants-store';
import { buildExportDateStamp } from './employee-filters';
import { readEmployeesBundle } from './employees-json-store';
import { buildPostesEffectifs, type PostesEffectifsPayload } from './postes-effectifs';

const RED = 'FFE30613';
const INK = 'FF111827';
const MUTED = 'FF6B7280';
const HEADER_BG = 'FFF8D7C4';
const ZEBRA = 'FFF3F7FB';
const TOTAL_BG = 'FF111827';

export type PostesEffectifsExportSelection = {
  includePpc: boolean;
  /** Ids contractants à inclure (Capital HR + autres). */
  contractantIds: string[];
};

function sheetNameSafe(name: string): string {
  return name.replace(/[\\/?*[\]]/g, ' ').trim().slice(0, 31) || 'Sheet';
}

function uniqueSheetName(base: string, used: Set<string>): string {
  let name = sheetNameSafe(base);
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  let i = 2;
  while (used.has(`${name.slice(0, 28)} ${i}`.toLowerCase())) i += 1;
  name = `${name.slice(0, 28)} ${i}`.trim();
  used.add(name.toLowerCase());
  return name;
}

function styleTitle(cell: ExcelJS.Cell, text: string) {
  cell.value = text;
  cell.font = { bold: true, size: 16, color: { argb: RED } };
  cell.alignment = { vertical: 'middle' };
}

function styleSubtitle(cell: ExcelJS.Cell, text: string) {
  cell.value = text;
  cell.font = { italic: true, size: 10, color: { argb: MUTED } };
}

function styleColHeader(cell: ExcelJS.Cell, text: string) {
  cell.value = text;
  cell.font = { bold: true, size: 11, color: { argb: INK } };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
}

function styleDataCell(cell: ExcelJS.Cell, zebra: boolean) {
  cell.font = { size: 10, color: { argb: INK } };
  cell.alignment = { vertical: 'middle', wrapText: true };
  if (zebra) {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
  }
}

function autoWidth(ws: ExcelJS.Worksheet, min = 12, max = 42) {
  ws.columns.forEach((col) => {
    let width = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const raw =
        typeof cell.value === 'object' && cell.value && 'formula' in cell.value
          ? String((cell.value as { result?: unknown }).result ?? '')
          : String(cell.value ?? '');
      const len = raw.length + 2;
      if (len > width) width = Math.min(max, len);
    });
    col.width = width;
  });
}

function clearBorders(ws: ExcelJS.Worksheet) {
  ws.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {};
    });
  });
}

function colLetter(index1: number): string {
  let n = index1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function filterPayload(
  payload: PostesEffectifsPayload,
  selection: PostesEffectifsExportSelection,
): PostesEffectifsPayload {
  const includePpc = selection.includePpc !== false;
  const ids = new Set(selection.contractantIds || []);
  const capitalId = payload.meta.capitalHrContractantId;
  const includeCapital = Boolean(capitalId && ids.has(capitalId));
  const autresCols = payload.meta.autresContractants.filter((c) => ids.has(c.id));
  const autresIdSet = new Set(autresCols.map((c) => c.id));

  const ppc = includePpc ? payload.ppc : [];
  const capitalHr = includeCapital ? payload.capitalHr : [];
  const autres = payload.autres.filter((r) => autresIdSet.has(r.contractantId));

  const resume = payload.resume
    .map((row) => {
      const autresCounts: Record<string, number> = {};
      for (const col of autresCols) {
        autresCounts[col.id] = row.autresCounts[col.id] || 0;
      }
      return {
        ...row,
        ppcCount: includePpc ? row.ppcCount : 0,
        capitalHrCount: includeCapital ? row.capitalHrCount : 0,
        autresCounts,
      };
    })
    .filter((row) => {
      const autresSum = Object.values(row.autresCounts).reduce((s, n) => s + n, 0);
      return row.ppcCount > 0 || row.capitalHrCount > 0 || autresSum > 0;
    });

  return {
    ppc,
    capitalHr,
    autres,
    resume,
    meta: {
      ...payload.meta,
      autresContractants: autresCols,
      ppcTotal: ppc.length,
      capitalHrTotal: capitalHr.length,
      autresTotal: autres.length,
      postesTotal: resume.length,
      contractantNom: includeCapital ? payload.meta.contractantNom : payload.meta.contractantNom,
    },
  };
}

export async function buildPostesEffectifsExcelBuffer(
  scope: ContractantAccessScope,
  selection?: PostesEffectifsExportSelection,
): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const [{ employees }, classification, allContractants, posteCapHrMap] = await Promise.all([
    readEmployeesBundle(),
    listClassificationPostes(),
    listContractants(),
    loadCapitalHrPosteCapHrMap(),
  ]);
  const contractants = filterContractantsByScope(allContractants, scope);
  const full = buildPostesEffectifs({
    employees,
    classification,
    contractants,
    capitalHrPosteById: posteCapHrMap,
  });

  const defaultIds = [
    ...(full.meta.capitalHrContractantId ? [full.meta.capitalHrContractantId] : []),
    ...full.meta.autresContractants.map((c) => c.id),
  ];
  const sel: PostesEffectifsExportSelection = selection || {
    includePpc: true,
    contractantIds: defaultIds,
  };
  if (!sel.includePpc && (!sel.contractantIds || sel.contractantIds.length === 0)) {
    throw new Error('Sélectionnez au moins PPC ou un contractant');
  }

  const payload = filterPayload(full, sel);
  const capitalLabel = full.meta.contractantNom || 'Capital HR';
  const includeCapital = Boolean(
    full.meta.capitalHrContractantId
    && sel.contractantIds.includes(full.meta.capitalHrContractantId),
  );
  const usedNames = new Set<string>();

  const wb = new ExcelJS.Workbook();
  wb.creator = 'RH PPCB';
  wb.created = new Date();

  const summaryColCount = 3 + (sel.includePpc ? 1 : 0) + (includeCapital ? 1 : 0) + payload.meta.autresContractants.length;

  const summary = wb.addWorksheet('Summary', {
    views: [{ state: 'frozen', ySplit: 4, showGridLines: false }],
    properties: { defaultRowHeight: 20 },
  });

  type SourceMeta = { key: string; label: string; sheetName: string; lastRow: number; fonctionCol: string };

  const sources: SourceMeta[] = [];

  // —— PPC ——
  if (sel.includePpc) {
    usedNames.add('ppc');
    const ppc = wb.addWorksheet('PPC', {
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
      properties: { defaultRowHeight: 18 },
    });
    styleTitle(ppc.getCell('A1'), 'PPC employees');
    styleSubtitle(ppc.getCell('A2'), `${payload.ppc.length} employees · source sheet for Summary formulas`);
    ppc.mergeCells('A1:G1');
    ppc.mergeCells('A2:G2');

    const ppcHeaders = [
      'Nom',
      'Matricule',
      'Poste',
      'Classification',
      'Grade',
      'Département',
      'Localisation',
    ];
    ppcHeaders.forEach((label, i) => styleColHeader(ppc.getCell(3, i + 1), label));
    payload.ppc.forEach((row, idx) => {
      const r = 4 + idx;
      const zebra = idx % 2 === 1;
      const values = [
        row.nom,
        row.matricule,
        row.poste,
        row.classification,
        row.grade,
        row.department,
        row.localisation,
      ];
      values.forEach((value, i) => {
        const cell = ppc.getCell(r, i + 1);
        cell.value = value === '—' ? '' : value;
        styleDataCell(cell, zebra);
      });
    });
    const ppcLast = Math.max(4, 3 + payload.ppc.length);
    autoWidth(ppc, 12, 36);
    clearBorders(ppc);
    sources.push({
      key: 'ppc',
      label: 'Employés PPC',
      sheetName: 'PPC',
      lastRow: ppcLast,
      fonctionCol: 'C',
    });
  }

  // —— Capital HR ——
  let capitalSheetName = '';
  if (includeCapital) {
    capitalSheetName = uniqueSheetName(capitalLabel, usedNames);
    const chr = wb.addWorksheet(capitalSheetName, {
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
      properties: { defaultRowHeight: 18 },
    });
    styleTitle(chr.getCell('A1'), `${capitalLabel} agents`);
    styleSubtitle(
      chr.getCell('A2'),
      `${payload.capitalHr.length} agents — base effectif (Zamba + Kinshasa, hors Fleur KADIMA) · Poste CapHR = fichier paie`,
    );
    chr.mergeCells('A1:F1');
    chr.mergeCells('A2:F2');

    const chrHeaders = [
      'Nom',
      'Poste CapHR',
      'Fonction',
      'Classification',
      'Département',
      'Affectation',
    ];
    chrHeaders.forEach((label, i) => styleColHeader(chr.getCell(3, i + 1), label));
    payload.capitalHr.forEach((row, idx) => {
      const r = 4 + idx;
      const zebra = idx % 2 === 1;
      const values = [
        row.nom,
        row.posteCapHr,
        row.fonction,
        row.classification,
        row.department,
        row.lieuAffectation,
      ];
      values.forEach((value, i) => {
        const cell = chr.getCell(r, i + 1);
        cell.value = value === '—' ? '' : value;
        styleDataCell(cell, zebra);
      });
    });
    const chrLast = Math.max(4, 3 + payload.capitalHr.length);
    autoWidth(chr, 14, 40);
    clearBorders(chr);
    sources.push({
      key: 'capital',
      label: `Employés ${capitalLabel}`,
      sheetName: capitalSheetName,
      lastRow: chrLast,
      fonctionCol: 'C',
    });
  }

  // —— Autres contractants ——
  for (const col of payload.meta.autresContractants) {
    const rows = payload.autres.filter((r) => r.contractantId === col.id);
    const sheetName = uniqueSheetName(col.nom, usedNames);
    const ws = wb.addWorksheet(sheetName, {
      views: [{ state: 'frozen', ySplit: 3, showGridLines: false }],
      properties: { defaultRowHeight: 18 },
    });
    styleTitle(ws.getCell('A1'), `${col.nom} agents`);
    styleSubtitle(ws.getCell('A2'), `${rows.length} agents actifs · source sheet for Summary formulas`);
    ws.mergeCells('A1:E1');
    ws.mergeCells('A2:E2');

    const headers = ['Nom', 'Fonction', 'Classification', 'Département', 'Affectation'];
    headers.forEach((label, i) => styleColHeader(ws.getCell(3, i + 1), label));
    rows.forEach((row, idx) => {
      const r = 4 + idx;
      const zebra = idx % 2 === 1;
      const values = [
        row.nom,
        row.fonction,
        row.classification,
        row.department,
        row.lieuAffectation,
      ];
      values.forEach((value, i) => {
        const cell = ws.getCell(r, i + 1);
        cell.value = value === '—' ? '' : value;
        styleDataCell(cell, zebra);
      });
    });
    const lastRow = Math.max(4, 3 + rows.length);
    autoWidth(ws, 14, 40);
    clearBorders(ws);
    sources.push({
      key: col.id,
      label: col.nom,
      sheetName,
      lastRow,
      fonctionCol: 'B',
    });
  }

  // —— Summary ——
  styleTitle(summary.getCell('A1'), 'Headcount by position');
  styleSubtitle(
    summary.getCell('A2'),
    'Counts use COUNTIF / COUNTA formulas linked to the selected source sheets.',
  );
  summary.mergeCells(`A1:${colLetter(summaryColCount)}1`);
  summary.mergeCells(`A2:${colLetter(summaryColCount)}2`);

  styleColHeader(summary.getCell('A4'), 'Poste');
  styleColHeader(summary.getCell('B4'), 'Department');
  styleColHeader(summary.getCell('C4'), 'Location');
  sources.forEach((src, i) => {
    const cell = summary.getCell(4, 4 + i);
    styleColHeader(cell, src.label);
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });

  payload.resume.forEach((row, idx) => {
    const r = 5 + idx;
    const zebra = idx % 2 === 1;

    const posteCell = summary.getCell(r, 1);
    posteCell.value = row.poste;
    styleDataCell(posteCell, zebra);
    posteCell.font = { bold: true, size: 10, color: { argb: INK } };

    const deptCell = summary.getCell(r, 2);
    deptCell.value = row.department === '—' ? '' : row.department;
    styleDataCell(deptCell, zebra);

    const locCell = summary.getCell(r, 3);
    locCell.value = row.location === '—' ? '' : row.location;
    styleDataCell(locCell, zebra);

    sources.forEach((src, i) => {
      const cell = summary.getCell(r, 4 + i);
      const range = `'${src.sheetName}'!$${src.fonctionCol}$4:$${src.fonctionCol}$${src.lastRow}`;
      cell.value = { formula: `COUNTIF(${range},A${r})` };
      styleDataCell(cell, zebra);
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
  });

  const lastData = Math.max(5, 4 + payload.resume.length);
  const totalRow = lastData + 1;
  summary.getCell(totalRow, 1).value = 'Total';
  summary.getCell(totalRow, 2).value = '';
  summary.getCell(totalRow, 3).value = '';
  sources.forEach((src, i) => {
    summary.getCell(totalRow, 4 + i).value = {
      formula: `COUNTA('${src.sheetName}'!$A$4:$A$${src.lastRow})`,
    };
  });
  for (let col = 1; col <= summaryColCount; col += 1) {
    const cell = summary.getCell(totalRow, col);
    cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } };
    cell.alignment = {
      vertical: 'middle',
      horizontal: col <= 3 ? 'left' : 'right',
    };
  }

  summary.getCell(totalRow + 2, 1).value =
    'Tip: change a Poste/Fonction on the source sheets and Summary recalculates automatically.';
  summary.getCell(totalRow + 2, 1).font = { italic: true, size: 9, color: { argb: MUTED } };
  summary.mergeCells(totalRow + 2, 1, totalRow + 2, Math.max(3, summaryColCount));

  summary.getColumn(1).width = 36;
  summary.getColumn(2).width = 22;
  summary.getColumn(3).width = 16;
  sources.forEach((src, i) => {
    summary.getColumn(4 + i).width = Math.min(22, Math.max(14, src.label.length + 2));
  });
  clearBorders(summary);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const stamp = buildExportDateStamp();
  return {
    buffer,
    filename: `POSTES_EFFECTIFS_${stamp}.xlsx`,
  };
}
