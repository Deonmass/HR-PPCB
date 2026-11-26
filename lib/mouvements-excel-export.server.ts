import 'server-only';

import ExcelJS from 'exceljs';
import { listMouvements } from './mouvements-store';
import type { Mouvement } from './mouvements-types';

const FONT = 'Aptos Narrow';
const HEADER_FILL = 'FFDCEDD5';
const SEPARATOR_FILL = 'FFFBE3D6';
const YEAR_COLOR = 'FFFFC000';
const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const thin = { style: 'thin' as const, color: { argb: 'FFBFBFBF' } };
const grid = { top: thin, left: thin, bottom: thin, right: thin };

function ordinalDay(day: number): string {
  const teen = day % 100;
  if (teen >= 11 && teen <= 13) return `${day}th`;
  if (day % 10 === 1) return `${day}st`;
  if (day % 10 === 2) return `${day}nd`;
  if (day % 10 === 3) return `${day}rd`;
  return `${day}th`;
}

/** « 1st April », comme la colonne Month du fichier source. */
function monthText(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  const month = MONTHS[Number(match[2]) - 1] || match[2];
  return `${ordinalDay(Number(match[3]))} ${month}`;
}

function promotionText(item: Mouvement): string {
  if (item.promotionLabel) return item.promotionLabel;
  return item.type === 'promotion' ? 'Y' : 'N';
}

function sheetOrder(name: string): number {
  const match = /FY(\d+)/i.exec(name);
  return match ? Number(match[1]) : 1000;
}

function safeSheetName(name: string): string {
  const cleaned = name.replace(/[\\/?*[\]:]/g, ' ').trim() || 'Mouvements';
  return cleaned.slice(0, 31);
}

function paint(cell: ExcelJS.Cell, value: ExcelJS.CellValue, font: Partial<ExcelJS.Font>) {
  cell.value = value;
  cell.font = { name: FONT, size: 11, color: { argb: 'FF000000' }, ...font };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.border = grid;
}

function writeSheet(wb: ExcelJS.Workbook, name: string, items: Mouvement[]) {
  const ws = wb.addWorksheet(safeSheetName(name), {
    views: [{ state: 'frozen', ySplit: 2, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
    },
  });
  ws.columns = [
    { width: 6 },
    { width: 10 },
    { width: 16 },
    { width: 18 },
    { width: 34 },
    { width: 16 },
    { width: 14 },
    { width: 32 },
    { width: 34 },
    { width: 28 },
  ];

  const header = ws.getRow(2);
  header.height = 32.5;
  [
    '',
    'Year',
    'Month',
    'Employee number',
    'Name of employee',
    'Previous grade',
    'New Grade',
    'Previous position',
    'New position',
    'Promotion',
  ].forEach((label, index) => {
    const cell = header.getCell(index + 1);
    if (!label) return;
    paint(cell, label, { bold: true, size: 12 });
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  });

  const ordered = [...items].sort((a, b) => {
    const date = a.date.localeCompare(b.date);
    if (date !== 0) return date;
    return a.agentNom.localeCompare(b.agentNom, 'fr', { sensitivity: 'base' });
  });

  let rowIndex = 3;
  let sequence = 0;
  let year = 0;
  let monthKey = '';

  const separator = () => {
    const row = ws.getRow(rowIndex);
    row.height = 16;
    for (let col = 2; col <= 10; col += 1) {
      const cell = row.getCell(col);
      cell.border = grid;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: SEPARATOR_FILL } };
    }
    rowIndex += 1;
  };

  for (const item of ordered) {
    const itemYear = Number(item.date.slice(0, 4)) || item.annee;
    const itemMonth = item.date.slice(0, 7);
    if (itemYear !== year) {
      if (year) separator();
      year = itemYear;
      monthKey = '';
      const row = ws.getRow(rowIndex);
      row.height = 18;
      for (let col = 2; col <= 10; col += 1) {
        paint(row.getCell(col), col === 2 ? itemYear : null, { bold: true, size: 12 });
      }
      row.getCell(2).font = { name: FONT, bold: true, size: 12, color: { argb: YEAR_COLOR } };
      rowIndex += 1;
    } else if (itemMonth !== monthKey) {
      separator();
    }

    sequence += 1;
    const row = ws.getRow(rowIndex);
    const note = promotionText(item);
    row.height = note.length > 24 || item.agentNom.length > 32 ? 36 : 22;
    const values: ExcelJS.CellValue[] = [
      sequence,
      itemYear,
      monthText(item.date),
      item.agentMatricule,
      item.agentNom,
      item.gradeAvant || null,
      item.gradeApres || null,
      item.posteAvant || null,
      item.posteActuel || null,
      note,
    ];
    values.forEach((value, index) => {
      if (index === 0) {
        const cell = row.getCell(1);
        cell.value = value;
        cell.font = { name: FONT, size: 11 };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        return;
      }
      paint(row.getCell(index + 1), value, {});
    });
    monthKey = itemMonth;
    rowIndex += 1;
  }

  ws.pageSetup.printTitlesRow = '2:2';
  ws.headerFooter.oddFooter = '&LEmployee mvt — promotions&R&P';
}

export async function buildMouvementsExcelBuffer(): Promise<{ buffer: Buffer; filename: string }> {
  const mouvements = await listMouvements();
  const groups = new Map<string, Mouvement[]>();
  for (const item of mouvements) {
    const key = item.sourceSheet?.trim() || 'Mouvements';
    const list = groups.get(key) || [];
    list.push(item);
    groups.set(key, list);
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = 'RH PPCB';
  wb.created = new Date();
  const names = [...groups.keys()].sort((a, b) => sheetOrder(a) - sheetOrder(b) || a.localeCompare(b));
  if (names.length === 0) {
    writeSheet(wb, 'Mouvements', []);
  } else {
    for (const name of names) writeSheet(wb, name, groups.get(name) || []);
  }

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: 'Employee-mvt-promotions.xlsx' };
}
