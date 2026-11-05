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

export interface ProtocolVoyageSummaryRange {
  year: number;
  fromMonth: number;
  toMonth: number;
}

export function protocolVoyageSummaryRange(
  query: ProtocolVoyageExportQuery,
  now = new Date(),
): ProtocolVoyageSummaryRange {
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const year = query.year && query.year > 1900 ? query.year : currentYear;
  let toMonth = 12;
  if (year === currentYear) toMonth = currentMonth;
  else if (year > currentYear) {
    toMonth = query.month && query.month >= 1 && query.month <= 12 ? query.month : 12;
  }
  return { year, fromMonth: 1, toMonth };
}

export function protocolVoyageSummaryLabel(query: ProtocolVoyageExportQuery, now = new Date()): string {
  const { year, fromMonth, toMonth } = protocolVoyageSummaryRange(query, now);
  if (fromMonth === toMonth) return `${MONTHS[fromMonth - 1]} ${year}`;
  return `${MONTHS[fromMonth - 1]} – ${MONTHS[toMonth - 1]} ${year}`;
}

export function filterProtocolVoyagesForSummary(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery,
  now = new Date(),
): ProtocolVoyageCout[] {
  const { year, toMonth } = protocolVoyageSummaryRange(query, now);
  const yearText = String(year);
  const q = query.q?.trim().toLowerCase() ?? '';
  return items.filter((item) => {
    if (!item.date.startsWith(yearText)) return false;
    const month = Number(item.date.slice(5, 7));
    if (!Number.isFinite(month) || month < 1 || month > toMonth) return false;
    if (!q) return true;
    return [
      item.numero,
      item.voyageur,
      item.destination,
      item.categorieHotel,
    ].join(' ').toLowerCase().includes(q);
  });
}

function normalizePersonName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(mr|mme|mlle|ms|mrs|dr|m)\s+/, '');
}

export function buildProtocolVoyageDepartmentLookup(
  people: { matricule?: string; nom?: string; departement?: string }[],
): (item: ProtocolVoyageCout) => string {
  const byMatricule = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const person of people) {
    const department = person.departement?.trim() ?? '';
    if (!department) continue;
    const matricule = person.matricule?.trim() ?? '';
    if (matricule && !byMatricule.has(matricule)) byMatricule.set(matricule, department);
    const name = normalizePersonName(person.nom ?? '');
    if (name && !byName.has(name)) byName.set(name, department);
  }
  return (item) => {
    const matricule = item.voyageurMatricule.trim();
    if (matricule && byMatricule.has(matricule)) return byMatricule.get(matricule) ?? 'Non rattaché';
    const name = normalizePersonName(item.voyageur);
    if (name && byName.has(name)) return byName.get(name) ?? 'Non rattaché';
    return 'Non rattaché';
  };
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

const SUMMARY_HEADERS = [
  'Libellé',
  'Voyages',
  'Nuits',
  ...PROTOCOL_VOYAGE_COST_NATURES.map((nature) => nature.label),
  'Coût total',
];
const SUMMARY_LAST_COL = SUMMARY_HEADERS.length - 1;

const SECTION_STYLE = {
  font: { bold: true, sz: 12, color: { rgb: '0F2744' } },
  alignment: { vertical: 'center' },
};

function summaryTextStyle(zebra: boolean, bold = false): object {
  return {
    font: { sz: 10, color: { rgb: '0F172A' }, bold },
    fill: { fgColor: { rgb: zebra ? 'F8FAFC' : 'FFFFFF' } },
    alignment: { horizontal: 'left', vertical: 'center' },
    border: BORDER,
  };
}

function summaryNumberStyle(zebra: boolean, bold = false): object {
  return {
    font: { sz: 10, color: { rgb: '0F172A' }, bold },
    fill: { fgColor: { rgb: zebra ? 'F8FAFC' : 'FFFFFF' } },
    alignment: { horizontal: 'right', vertical: 'center' },
    border: BORDER,
  };
}

function summaryMetricRow(label: string, items: ProtocolVoyageCout[], zebra: boolean): ExportCell[] {
  const cells: ExportCell[] = [
    textCell(label, summaryTextStyle(zebra, true)),
    numberCell(items.length, summaryNumberStyle(zebra), '#,##0'),
    numberCell(items.reduce((sum, item) => sum + item.nbreNuits, 0), summaryNumberStyle(zebra), '#,##0'),
  ];
  for (const nature of PROTOCOL_VOYAGE_COST_NATURES) {
    cells.push(numberCell(
      items.reduce((sum, item) => sum + item[nature.id], 0),
      summaryNumberStyle(zebra),
      '#,##0.00',
    ));
  }
  cells.push(numberCell(
    items.reduce((sum, item) => sum + item.coutTotal, 0),
    summaryNumberStyle(zebra, true),
    '#,##0.00',
  ));
  return cells;
}

function summaryTotalRow(firstExcelRow: number, lastExcelRow: number): ExportCell[] {
  const totalStyleLeft = { ...TOTAL_STYLE, alignment: { horizontal: 'left', vertical: 'center' } };
  return SUMMARY_HEADERS.map((_, column) => {
    if (column === 0) return textCell('Total', totalStyleLeft);
    const format = column <= 2 ? '#,##0' : '#,##0.00';
    if (lastExcelRow < firstExcelRow) return numberCell(0, TOTAL_STYLE, format);
    return formulaCell(
      `SUM(${colLetter(column)}${firstExcelRow}:${colLetter(column)}${lastExcelRow})`,
      TOTAL_STYLE,
      format,
    );
  });
}

function buildSummarySheet(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery,
  departmentOf: (item: ProtocolVoyageCout) => string,
  now = new Date(),
): XLSX.WorkSheet {
  const range = protocolVoyageSummaryRange(query, now);
  const search = query.q?.trim();
  const subtitle = search
    ? `${protocolVoyageSummaryLabel(query, now)} · filtre « ${search} » · montants en USD`
    : `${protocolVoyageSummaryLabel(query, now)} · montants en USD`;
  const rows: ExportCell[][] = [
    [textCell('Synthèse — gestion de voyage', TITLE_STYLE)],
    [textCell(subtitle, SUBTITLE_STYLE)],
    [],
    [textCell('Par mois', SECTION_STYLE)],
    SUMMARY_HEADERS.map((label, index) => textCell(index === 0 ? 'Mois' : label, HEADER_STYLE)),
  ];
  const monthHeaderExcelRow = rows.length;
  const monthFirstExcelRow = monthHeaderExcelRow + 1;
  for (let month = range.fromMonth; month <= range.toMonth; month += 1) {
    const prefix = `${range.year}-${String(month).padStart(2, '0')}`;
    const monthItems = items.filter((item) => item.date.startsWith(prefix));
    rows.push(summaryMetricRow(MONTHS[month - 1], monthItems, month % 2 === 0));
  }
  const monthLastExcelRow = rows.length;
  rows.push(summaryTotalRow(monthFirstExcelRow, monthLastExcelRow));

  rows.push([]);
  rows.push([textCell('Par département', SECTION_STYLE)]);
  rows.push(SUMMARY_HEADERS.map((label, index) => textCell(index === 0 ? 'Département' : label, HEADER_STYLE)));
  const departmentHeaderExcelRow = rows.length;
  const grouped = new Map<string, ProtocolVoyageCout[]>();
  for (const item of items) {
    const department = departmentOf(item).trim() || 'Non rattaché';
    const list = grouped.get(department) ?? [];
    list.push(item);
    grouped.set(department, list);
  }
  const departments = [...grouped.entries()].sort((a, b) => {
    const totalA = a[1].reduce((sum, item) => sum + item.coutTotal, 0);
    const totalB = b[1].reduce((sum, item) => sum + item.coutTotal, 0);
    if (totalB !== totalA) return totalB - totalA;
    return a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' });
  });
  const departmentFirstExcelRow = departmentHeaderExcelRow + 1;
  departments.forEach(([department, departmentItems], index) => {
    rows.push(summaryMetricRow(department, departmentItems, index % 2 === 1));
  });
  const departmentLastExcelRow = departments.length ? rows.length : departmentHeaderExcelRow;
  rows.push(summaryTotalRow(departmentFirstExcelRow, departmentLastExcelRow));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [24, 12, 12, 16, 14, 14, 16, 18, 14, 16, 16, 16].map((wch) => ({ wch }));
  const rowHeights: { hpt: number }[] = [];
  rowHeights[0] = { hpt: 24 };
  rowHeights[1] = { hpt: 18 };
  rowHeights[3] = { hpt: 20 };
  rowHeights[departmentHeaderExcelRow - 2] = { hpt: 20 };
  ws['!rows'] = rowHeights;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: SUMMARY_LAST_COL } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: SUMMARY_LAST_COL } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: SUMMARY_LAST_COL } },
    { s: { r: departmentHeaderExcelRow - 2, c: 0 }, e: { r: departmentHeaderExcelRow - 2, c: SUMMARY_LAST_COL } },
  ];
  return ws;
}

export function buildProtocolVoyageExportBuffer(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery = {},
  options?: {
    summaryItems?: ProtocolVoyageCout[];
    departmentOf?: (item: ProtocolVoyageCout) => string;
    now?: Date;
  },
): Buffer {
  const now = options?.now ?? new Date();
  const summaryItems = options?.summaryItems ?? filterProtocolVoyagesForSummary(items, query, now);
  const departmentOf = options?.departmentOf ?? (() => 'Non rattaché');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildVoyagesSheet(items, query), 'Voyages');
  XLSX.utils.book_append_sheet(wb, buildSummarySheet(summaryItems, query, departmentOf, now), 'Synthèse');
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
}
