import 'server-only';

import * as XLSX from 'xlsx-js-style';
import {
  PROTOCOL_VOYAGE_COST_NATURES,
  type ProtocolVoyageCout,
} from './protocol-voyage-types';

const MONTHS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

const HEADERS = [
  'N°',
  'Date',
  'Voyageur',
  'Matricule',
  'Destination',
  'Ticket avion',
  'Visa volant',
  'Lettre à légaliser',
  'Go Pass',
  'Transfert',
  'Hôtel / nuit',
  'Nuits',
  'Coût hôtel',
  'Catégorie hôtel',
  'Appartement',
  'Autres charges',
  'Coût total',
] as const;

const MONEY_COLUMNS = new Set([5, 6, 7, 8, 9, 10, 12, 14, 15, 16]);
const INT_COLUMNS = new Set([11]);
const LAST_COL = HEADERS.length - 1;

const BORDER = {
  top: { style: 'thin', color: { rgb: 'D6DEE8' } },
  bottom: { style: 'thin', color: { rgb: 'D6DEE8' } },
  left: { style: 'thin', color: { rgb: 'D6DEE8' } },
  right: { style: 'thin', color: { rgb: 'D6DEE8' } },
};

const TITLE_STYLE = {
  font: { bold: true, sz: 16, color: { rgb: '0F2744' } },
  alignment: { vertical: 'center' },
};

const SUBTITLE_STYLE = {
  font: { sz: 10, color: { rgb: '475569' } },
  alignment: { vertical: 'center' },
};

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  fill: { fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: BORDER,
};

const TOTAL_STYLE = {
  font: { bold: true, color: { rgb: '0F2744' }, sz: 10 },
  fill: { fgColor: { rgb: 'E8EEF6' } },
  alignment: { horizontal: 'right', vertical: 'center' },
  border: BORDER,
};

const LABEL_STYLE = {
  font: { bold: true, color: { rgb: '0F2744' }, sz: 10 },
  fill: { fgColor: { rgb: 'F8FAFC' } },
  alignment: { horizontal: 'left', vertical: 'center' },
  border: BORDER,
};

export interface ProtocolVoyageExportQuery {
  year?: number;
  month?: number;
  q?: string;
}

type ExportCell = string | number | { v?: string | number; f?: string; t?: string; z?: string; s?: object };

function textCell(value: string, style: object): ExportCell {
  return { v: value, t: 's', s: style };
}

function numberCell(value: number, style: object, format: string): ExportCell {
  return { v: value, t: 'n', z: format, s: style };
}

function formulaCell(formula: string, style: object, format: string): ExportCell {
  return { f: formula, t: 'n', z: format, s: style };
}

function colLetter(index: number): string {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

function formatDate(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

function bodyStyle(column: number, zebra: boolean): object {
  const money = MONEY_COLUMNS.has(column);
  const numeric = money || INT_COLUMNS.has(column);
  return {
    font: { sz: 10, color: { rgb: '0F172A' }, bold: column === LAST_COL },
    fill: { fgColor: { rgb: zebra ? 'F8FAFC' : 'FFFFFF' } },
    alignment: { horizontal: numeric ? 'right' : 'left', vertical: 'center' },
    border: BORDER,
  };
}

export function protocolVoyagePeriodLabel(query: ProtocolVoyageExportQuery): string {
  const year = query.year && query.year > 1900 ? query.year : 0;
  const month = query.month && query.month >= 1 && query.month <= 12 ? query.month : 0;
  if (year && month) return `${MONTHS[month - 1]} ${year}`;
  if (year) return `Année ${year}`;
  return 'Tous les voyages';
}

export function buildProtocolVoyageExportFilename(query: ProtocolVoyageExportQuery): string {
  const year = query.year && query.year > 1900 ? query.year : 0;
  const month = query.month && query.month >= 1 && query.month <= 12 ? query.month : 0;
  if (year && month) return `gestion-voyage-${year}-${String(month).padStart(2, '0')}.xlsx`;
  if (year) return `gestion-voyage-${year}.xlsx`;
  return `gestion-voyage-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

export function filterProtocolVoyagesForExport(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery,
): ProtocolVoyageCout[] {
  const year = query.year && query.year > 1900 ? String(query.year) : '';
  const month = query.month && query.month >= 1 && query.month <= 12
    ? `${year}-${String(query.month).padStart(2, '0')}`
    : '';
  const q = query.q?.trim().toLowerCase() ?? '';
  return items.filter((item) => {
    if (year && !item.date.startsWith(year)) return false;
    if (month && !item.date.startsWith(month)) return false;
    if (!q) return true;
    return [
      item.numero,
      item.voyageur,
      item.destination,
      item.categorieHotel,
    ].join(' ').toLowerCase().includes(q);
  });
}

function buildVoyagesSheet(items: ProtocolVoyageCout[], query: ProtocolVoyageExportQuery): XLSX.WorkSheet {
  const period = protocolVoyagePeriodLabel(query);
  const search = query.q?.trim();
  const subtitle = search
    ? `${period} · ${items.length} voyage${items.length > 1 ? 's' : ''} · filtre « ${search} » · montants en USD`
    : `${period} · ${items.length} voyage${items.length > 1 ? 's' : ''} · montants en USD`;

  const rows: ExportCell[][] = [
    [textCell('Gestion de voyage', TITLE_STYLE)],
    [textCell(subtitle, SUBTITLE_STYLE)],
    HEADERS.map((label) => textCell(label, HEADER_STYLE)),
  ];

  items.forEach((item, index) => {
    const values: Array<string | number> = [
      item.numero,
      formatDate(item.date),
      item.voyageur,
      item.voyageurMatricule,
      item.destination,
      item.ticketAvion,
      item.visaVolant,
      item.lettreLegaliser,
      item.goPass,
      item.transfert,
      item.hotelNuit,
      item.nbreNuits,
      item.coutHotel,
      item.categorieHotel,
      item.appartement,
      item.autresCharges,
      item.coutTotal,
    ];
    const zebra = index % 2 === 1;
    rows.push(values.map((value, column) => {
      const style = bodyStyle(column, zebra);
      if (typeof value === 'number') {
        return numberCell(value, style, MONEY_COLUMNS.has(column) ? '#,##0.00' : '#,##0');
      }
      return textCell(value, style);
    }));
  });

  const headerExcelRow = 3;
  const firstDataRow = 4;
  const lastDataRow = items.length ? firstDataRow + items.length - 1 : headerExcelRow;
  const totalStyleLeft = { ...TOTAL_STYLE, alignment: { horizontal: 'left', vertical: 'center' } };
  rows.push(HEADERS.map((_, column) => {
    if (column === 0) return textCell('Total', totalStyleLeft);
    if (column < 5 || column === 13) return textCell('', TOTAL_STYLE);
    const letter = colLetter(column);
    const format = INT_COLUMNS.has(column) ? '#,##0' : '#,##0.00';
    if (!items.length) return numberCell(0, TOTAL_STYLE, format);
    return formulaCell(`SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})`, TOTAL_STYLE, format);
  }));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [12, 12, 32, 14, 36, 14, 14, 18, 12, 14, 14, 10, 14, 18, 14, 16, 16].map((wch) => ({ wch }));
  ws['!rows'] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 30 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: LAST_COL } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: LAST_COL } },
  ];
  ws['!autofilter'] = { ref: `A${headerExcelRow}:Q${lastDataRow}` };
  return ws;
}

function buildSummarySheet(items: ProtocolVoyageCout[], query: ProtocolVoyageExportQuery): XLSX.WorkSheet {
  const count = items.length;
  const sum = (pick: (item: ProtocolVoyageCout) => number) => items.reduce((acc, item) => acc + pick(item), 0);
  const total = sum((item) => item.coutTotal);
  const rows: ExportCell[][] = [
    [textCell('Synthèse — gestion de voyage', TITLE_STYLE)],
    [textCell(protocolVoyagePeriodLabel(query), SUBTITLE_STYLE)],
    [],
    [textCell('Indicateur', HEADER_STYLE), textCell('Valeur', HEADER_STYLE)],
    [textCell('Période', LABEL_STYLE), textCell(protocolVoyagePeriodLabel(query), bodyStyle(0, false))],
  ];
  if (query.q?.trim()) {
    rows.push([textCell('Recherche', LABEL_STYLE), textCell(query.q.trim(), bodyStyle(0, true))]);
  }
  rows.push(
    [textCell('Voyages', LABEL_STYLE), numberCell(count, bodyStyle(11, false), '#,##0')],
    [textCell('Nuits réservées', LABEL_STYLE), numberCell(sum((item) => item.nbreNuits), bodyStyle(11, true), '#,##0')],
  );
  PROTOCOL_VOYAGE_COST_NATURES.forEach((nature, index) => {
    rows.push([
      textCell(nature.label, LABEL_STYLE),
      numberCell(sum((item) => item[nature.id]), bodyStyle(5, index % 2 === 0), '#,##0.00'),
    ]);
  });
  rows.push(
    [textCell('Coût total', LABEL_STYLE), numberCell(total, { ...TOTAL_STYLE, alignment: { horizontal: 'right', vertical: 'center' } }, '#,##0.00')],
    [textCell('Coût moyen / voyage', LABEL_STYLE), numberCell(count ? total / count : 0, bodyStyle(5, false), '#,##0.00')],
  );

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 28 }, { wch: 36 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 1 } },
  ];
  ws['!rows'] = [{ hpt: 24 }, { hpt: 18 }];
  return ws;
}

export function buildProtocolVoyageExportBuffer(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery = {},
): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildVoyagesSheet(items, query), 'Voyages');
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(items, query), 'Synthèse');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
