import 'server-only';

import JSZip from 'jszip';
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
  'Département',
  'Mois',
] as const;

const VOYAGE_LAST_COL = HEADERS.length - 1;
const MONTH_FORMULA_LIST = MONTHS.map((label) => `"${label}"`).join(',');
const NATURE_COLUMN: Record<string, string> = {
  ticketAvion: 'F',
  coutHotel: 'M',
  goPass: 'I',
  visaVolant: 'G',
  lettreLegaliser: 'H',
  transfert: 'J',
  appartement: 'O',
  autresCharges: 'P',
};

const MONEY_COLUMNS = new Set([5, 6, 7, 8, 9, 10, 12, 14, 15, 16]);
const INT_COLUMNS = new Set([11]);

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

function formulaCell(formula: string, style: object, format?: string): ExportCell {
  return format ? { f: formula, t: 'n', z: format, s: style } : { f: formula, s: style };
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

function isoToExcelSerial(iso: string): number {
  const date = new Date(`${iso}T00:00:00Z`);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.round((date.getTime() - epoch) / 86_400_000);
}

const FILTER_STYLE = {
  font: { bold: true, color: { rgb: '0F2744' }, sz: 11 },
  fill: { fgColor: { rgb: 'FDE68A' } },
  alignment: { horizontal: 'center', vertical: 'center' },
  border: BORDER,
};

interface SummaryChartSpec {
  filterCell: string;
  listRange: string;
  catRange: string;
  valRange: string;
  fromRow: number;
  toRow: number;
}

function bodyStyle(column: number, zebra: boolean): object {
  const money = MONEY_COLUMNS.has(column);
  const numeric = money || INT_COLUMNS.has(column) || column === 1;
  return {
    font: { sz: 10, color: { rgb: '0F172A' }, bold: column === 16 },
    fill: { fgColor: { rgb: zebra ? 'F8FAFC' : 'FFFFFF' } },
    alignment: { horizontal: column === 1 ? 'center' : numeric ? 'right' : 'left', vertical: 'center' },
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

interface VoyageSource {
  sheet: XLSX.WorkSheet;
  firstRow: number;
  lastRow: number;
}

function blankRow(length = 12): ExportCell[] {
  return Array.from({ length }, () => '');
}

function buildVoyagesSheet(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery,
  departmentOf: (item: ProtocolVoyageCout) => string,
  now = new Date(),
): VoyageSource {
  const search = query.q?.trim();
  const period = protocolVoyageSummaryLabel(query, now);
  const subtitle = search
    ? `${period} · source des formules · filtre « ${search} » · montants en USD`
    : `${period} · source des formules de la synthèse · montants en USD`;
  const rows: ExportCell[][] = [
    [textCell('Gestion de voyage', TITLE_STYLE)],
    [textCell(subtitle, SUBTITLE_STYLE)],
    HEADERS.map((label) => textCell(label, HEADER_STYLE)),
  ];
  const firstDataRow = 4;

  items.forEach((item, index) => {
    const excelRow = firstDataRow + index;
    const zebra = index % 2 === 1;
    const styleAt = (column: number) => bodyStyle(column, zebra);
    rows.push([
      textCell(item.numero, styleAt(0)),
      numberCell(isoToExcelSerial(item.date), styleAt(1), 'DD/MM/YYYY'),
      textCell(item.voyageur, styleAt(2)),
      textCell(item.voyageurMatricule, styleAt(3)),
      textCell(item.destination, styleAt(4)),
      numberCell(item.ticketAvion, styleAt(5), '#,##0.00'),
      numberCell(item.visaVolant, styleAt(6), '#,##0.00'),
      numberCell(item.lettreLegaliser, styleAt(7), '#,##0.00'),
      numberCell(item.goPass, styleAt(8), '#,##0.00'),
      numberCell(item.transfert, styleAt(9), '#,##0.00'),
      numberCell(item.hotelNuit, styleAt(10), '#,##0.00'),
      numberCell(item.nbreNuits, styleAt(11), '#,##0'),
      formulaCell(`K${excelRow}*L${excelRow}`, styleAt(12), '#,##0.00'),
      textCell(item.categorieHotel, styleAt(13)),
      numberCell(item.appartement, styleAt(14), '#,##0.00'),
      numberCell(item.autresCharges, styleAt(15), '#,##0.00'),
      formulaCell(`F${excelRow}+G${excelRow}+H${excelRow}+I${excelRow}+J${excelRow}+M${excelRow}+O${excelRow}+P${excelRow}`, styleAt(16), '#,##0.00'),
      textCell(departmentOf(item).trim() || 'Non rattaché', styleAt(17)),
      formulaCell(`CHOOSE(MONTH(B${excelRow}),${MONTH_FORMULA_LIST})`, styleAt(18)),
    ]);
  });

  const lastDataRow = items.length ? firstDataRow + items.length - 1 : firstDataRow - 1;
  const totalStyleLeft = { ...TOTAL_STYLE, alignment: { horizontal: 'left', vertical: 'center' } };
  rows.push(HEADERS.map((_, column) => {
    if (column === 0) return textCell('Total', totalStyleLeft);
    if (column < 5 || column === 13 || column >= 17) return textCell('', TOTAL_STYLE);
    const letter = colLetter(column);
    const format = INT_COLUMNS.has(column) ? '#,##0' : '#,##0.00';
    if (!items.length) return numberCell(0, TOTAL_STYLE, format);
    return formulaCell(`SUBTOTAL(109,${letter}${firstDataRow}:${letter}${lastDataRow})`, TOTAL_STYLE, format);
  }));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [12, 12, 32, 14, 36, 14, 14, 18, 12, 14, 14, 10, 14, 18, 14, 16, 16, 22, 14].map((wch) => ({ wch }));
  ws['!rows'] = [{ hpt: 24 }, { hpt: 18 }, { hpt: 30 }];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: VOYAGE_LAST_COL } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: VOYAGE_LAST_COL } },
  ];
  ws['!autofilter'] = { ref: `A3:S${Math.max(lastDataRow, 3)}` };
  return { sheet: ws, firstRow: firstDataRow, lastRow: lastDataRow };
}

const SUMMARY_HEADERS = [
  'Libellé',
  'Voyages',
  'Nuits',
  ...PROTOCOL_VOYAGE_COST_NATURES.map((nature) => nature.label),
  'Coût total',
];
const SUMMARY_LAST_COL = SUMMARY_HEADERS.length - 1;
const CHART_LABEL_COL = 13;
const CHART_VALUE_COL = 14;

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

function colRange(column: string, first: number, last: number): string {
  return `Voyages!$${column}$${first}:$${column}$${last}`;
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

function provenRow(
  label: string,
  zebra: boolean,
  formulaFor: (column: string | 'count') => string,
): ExportCell[] {
  const cells: ExportCell[] = [
    textCell(label, summaryTextStyle(zebra, true)),
    formulaCell(formulaFor('count'), summaryNumberStyle(zebra), '#,##0'),
    formulaCell(formulaFor('L'), summaryNumberStyle(zebra), '#,##0'),
  ];
  for (const nature of PROTOCOL_VOYAGE_COST_NATURES) {
    cells.push(formulaCell(formulaFor(NATURE_COLUMN[nature.id]), summaryNumberStyle(zebra), '#,##0.00'));
  }
  cells.push(formulaCell(formulaFor('Q'), summaryNumberStyle(zebra, true), '#,##0.00'));
  return cells;
}

function monthFormula(column: string | 'count', labelCell: string, first: number, last: number): string {
  const months = colRange('S', first, last);
  if (column === 'count') return `COUNTIF(${months},${labelCell})`;
  return `SUMIF(${months},${labelCell},${colRange(column, first, last)})`;
}

function departmentFormula(column: string | 'count', labelCell: string, first: number, last: number): string {
  const departments = colRange('R', first, last);
  if (column === 'count') return `COUNTIF(${departments},${labelCell})`;
  return `SUMIF(${departments},${labelCell},${colRange(column, first, last)})`;
}

function monthDepartmentFormula(
  column: string | 'count',
  monthCell: string,
  labelCell: string,
  first: number,
  last: number,
): string {
  const months = colRange('S', first, last);
  const departments = colRange('R', first, last);
  if (column === 'count') return `COUNTIFS(${months},${monthCell},${departments},${labelCell})`;
  return `SUMIFS(${colRange(column, first, last)},${months},${monthCell},${departments},${labelCell})`;
}

function chartValueFormula(row: number, filterCell: string, first: number, last: number): string {
  const proven = `IF(${filterCell}="Tous",${departmentFormula('Q', `A${row}`, first, last)},${monthDepartmentFormula('Q', filterCell, `A${row}`, first, last)})`;
  return `IF(${proven}=0,NA(),${proven})`;
}

function buildSummarySheet(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery,
  departmentOf: (item: ProtocolVoyageCout) => string,
  source: VoyageSource,
  now = new Date(),
): { sheet: XLSX.WorkSheet; chart: SummaryChartSpec | null } {
  const range = protocolVoyageSummaryRange(query, now);
  const months = MONTHS.slice(range.fromMonth - 1, range.toMonth);
  const search = query.q?.trim();
  const subtitle = search
    ? `${protocolVoyageSummaryLabel(query, now)} · formules sur la feuille Voyages · filtre « ${search} » · montants en USD`
    : `${protocolVoyageSummaryLabel(query, now)} · formules sur la feuille Voyages · montants en USD`;
  const hasSource = source.lastRow >= source.firstRow;
  const first = hasSource ? source.firstRow : 4;
  const last = hasSource ? source.lastRow : 3;
  const rows: ExportCell[][] = [
    [textCell('Synthèse — gestion de voyage', TITLE_STYLE)],
    [textCell(subtitle, SUBTITLE_STYLE)],
    blankRow(),
    [textCell('Par mois', SECTION_STYLE)],
    SUMMARY_HEADERS.map((label, index) => textCell(index === 0 ? 'Mois' : label, HEADER_STYLE)),
  ];
  const monthHeaderExcelRow = rows.length;
  const monthFirstExcelRow = monthHeaderExcelRow + 1;
  months.forEach((label, index) => {
    const excelRow = monthFirstExcelRow + index;
    if (!hasSource) {
      rows.push(provenRow(label, index % 2 === 1, () => '0'));
      return;
    }
    rows.push(provenRow(label, index % 2 === 1, (column) => monthFormula(column, `A${excelRow}`, first, last)));
  });
  const monthLastExcelRow = rows.length;
  rows.push(summaryTotalRow(monthFirstExcelRow, monthLastExcelRow));

  rows.push(blankRow());
  const departmentTitleRow = blankRow(CHART_VALUE_COL + 1);
  departmentTitleRow[0] = textCell('Par département', SECTION_STYLE);
  departmentTitleRow[CHART_LABEL_COL] = textCell('Filtre du graphique', summaryTextStyle(false, true));
  departmentTitleRow[CHART_VALUE_COL] = textCell('Tous', FILTER_STYLE);
  rows.push(departmentTitleRow);
  const filterExcelRow = rows.length;
  const departmentHeader = SUMMARY_HEADERS.map((label, index) => textCell(index === 0 ? 'Département' : label, HEADER_STYLE));
  while (departmentHeader.length <= CHART_VALUE_COL) departmentHeader.push('');
  departmentHeader[CHART_LABEL_COL] = textCell('Département', HEADER_STYLE);
  departmentHeader[CHART_VALUE_COL] = textCell('Coût filtré', HEADER_STYLE);
  rows.push(departmentHeader);
  const departmentHeaderExcelRow = rows.length;

  const grouped = new Map<string, number>();
  for (const item of items) {
    const department = departmentOf(item).trim() || 'Non rattaché';
    grouped.set(department, (grouped.get(department) ?? 0) + item.coutTotal);
  }
  const departments = [...grouped.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr', { sensitivity: 'base' }))
    .map(([department]) => department);

  const departmentFirstExcelRow = departmentHeaderExcelRow + 1;
  departments.forEach((department, index) => {
    const excelRow = departmentFirstExcelRow + index;
    const row = hasSource
      ? provenRow(department, index % 2 === 1, (column) => departmentFormula(column, `A${excelRow}`, first, last))
      : provenRow(department, index % 2 === 1, () => '0');
    while (row.length <= CHART_VALUE_COL) row.push('');
    row[CHART_LABEL_COL] = formulaCell(`A${excelRow}`, summaryTextStyle(index % 2 === 1, true));
    row[CHART_VALUE_COL] = hasSource
      ? formulaCell(chartValueFormula(excelRow, `$O$${filterExcelRow}`, first, last), summaryNumberStyle(index % 2 === 1, true), '#,##0.00')
      : numberCell(0, summaryNumberStyle(index % 2 === 1, true), '#,##0.00');
    rows.push(row);
  });
  const departmentLastExcelRow = departments.length ? rows.length : departmentHeaderExcelRow;
  rows.push(summaryTotalRow(departmentFirstExcelRow, departmentLastExcelRow));

  rows.push(blankRow());
  rows.push([textCell('Détail par mois et par département', SECTION_STYLE)]);
  const detailTitleExcelRow = rows.length;
  const monthTitleRows: number[] = [];
  months.forEach((month) => {
    rows.push(blankRow());
    const title = blankRow();
    title[0] = textCell(month, SECTION_STYLE);
    rows.push(title);
    const monthTitleExcelRow = rows.length;
    monthTitleRows.push(monthTitleExcelRow);
    rows.push(SUMMARY_HEADERS.map((label, index) => textCell(index === 0 ? 'Département' : label, HEADER_STYLE)));
    const blockFirst = rows.length + 1;
    departments.forEach((department, index) => {
      const excelRow = blockFirst + index;
      if (!hasSource) {
        rows.push(provenRow(department, index % 2 === 1, () => '0'));
        return;
      }
      rows.push(provenRow(
        department,
        index % 2 === 1,
        (column) => monthDepartmentFormula(column, `$A$${monthTitleExcelRow}`, `A${excelRow}`, first, last),
      ));
    });
    const blockLast = departments.length ? rows.length : monthTitleExcelRow;
    rows.push(summaryTotalRow(blockFirst, blockLast));
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const list = ['Tous', ...months];
  list.forEach((label, index) => {
    ws[`AA${index + 1}`] = { t: 's', v: label };
  });
  const decoded = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  decoded.e.c = Math.max(decoded.e.c, 26);
  decoded.e.r = Math.max(decoded.e.r, Math.max(list.length - 1, rows.length - 1));
  ws['!ref'] = XLSX.utils.encode_range(decoded);
  ws['!cols'] = [28, 12, 12, 16, 14, 14, 16, 18, 14, 16, 16, 16, 3, 24, 16].concat(Array.from({ length: 11 }, () => ({ wch: 3 })));
  ws['!cols'][26] = { hidden: true, wch: 16 };
  const rowHeights: { hpt: number }[] = [];
  rowHeights[0] = { hpt: 24 };
  rowHeights[1] = { hpt: 18 };
  rowHeights[3] = { hpt: 20 };
  rowHeights[filterExcelRow - 1] = { hpt: 22 };
  rowHeights[detailTitleExcelRow - 1] = { hpt: 22 };
  monthTitleRows.forEach((excelRow) => {
    rowHeights[excelRow - 1] = { hpt: 20 };
  });
  ws['!rows'] = rowHeights;
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: SUMMARY_LAST_COL } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: SUMMARY_LAST_COL } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: SUMMARY_LAST_COL } },
    { s: { r: filterExcelRow - 1, c: 0 }, e: { r: filterExcelRow - 1, c: SUMMARY_LAST_COL } },
    { s: { r: detailTitleExcelRow - 1, c: 0 }, e: { r: detailTitleExcelRow - 1, c: SUMMARY_LAST_COL } },
    ...monthTitleRows.map((excelRow) => ({
      s: { r: excelRow - 1, c: 0 },
      e: { r: excelRow - 1, c: SUMMARY_LAST_COL },
    })),
  ];

  const chart = departments.length && hasSource
    ? {
      filterCell: `O${filterExcelRow}`,
      listRange: `'Synthèse'!$AA$1:$AA$${list.length}`,
      catRange: `'Synthèse'!$N$${departmentFirstExcelRow}:$N$${departmentLastExcelRow}`,
      valRange: `'Synthèse'!$O$${departmentFirstExcelRow}:$O$${departmentLastExcelRow}`,
      fromRow: filterExcelRow - 1,
      toRow: departmentLastExcelRow + 1,
    }
    : null;
  return { sheet: ws, chart };
}

function pieChartXml(catRange: string, valRange: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="fr-FR" sz="1200" b="1"/><a:t>Coût par département</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:plotArea>
      <c:layout/>
      <c:pieChart>
        <c:varyColors val="1"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>Coût filtré</c:v></c:tx>
          <c:cat><c:strRef><c:f>${catRange}</c:f></c:strRef></c:cat>
          <c:val><c:numRef><c:f>${valRange}</c:f></c:numRef></c:val>
          <c:dLbls>
            <c:showLegendKey val="0"/>
            <c:showVal val="0"/>
            <c:showCatName val="1"/>
            <c:showPercent val="1"/>
            <c:showSerName val="0"/>
          </c:dLbls>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    <c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend>
    <c:plotVisOnly val="1"/>
  </c:chart>
</c:chartSpace>`;
}

function drawingXml(fromRow: number, toRow: number): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <xdr:twoCellAnchor>
    <xdr:from><xdr:col>16</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${fromRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
    <xdr:to><xdr:col>24</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${toRow}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>
    <xdr:graphicFrame macro="">
      <xdr:nvGraphicFramePr>
        <xdr:cNvPr id="2" name="Graphique départements"/>
        <xdr:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></xdr:cNvGraphicFramePr>
      </xdr:nvGraphicFramePr>
      <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
      <a:graphic>
        <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
          <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId1"/>
        </a:graphicData>
      </a:graphic>
    </xdr:graphicFrame>
    <xdr:clientData/>
  </xdr:twoCellAnchor>
</xdr:wsDr>`;
}

async function attachSummaryChart(buffer: Buffer, chart: SummaryChartSpec): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !relsXml) return buffer;
  const sheetMatch = /<sheet[^>]*name="Synthèse"[^>]*r:id="([^"]+)"/.exec(workbookXml);
  const relMatch = sheetMatch
    ? new RegExp(`Id="${sheetMatch[1]}"[^>]*Target="([^"]+)"`).exec(relsXml)
    : null;
  const target = relMatch?.[1];
  if (!target) return buffer;
  const sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\//, '')}`;
  const normalizedSheetPath = sheetPath.replace(/^xl\/xl\//, 'xl/');
  const sheetFile = zip.file(normalizedSheetPath);
  if (!sheetFile) return buffer;
  let sheetXml = await sheetFile.async('string');
  const validation = `<dataValidations count="1"><dataValidation type="list" allowBlank="0" showErrorMessage="1" showDropDown="0" sqref="${chart.filterCell}"><formula1>${chart.listRange}</formula1></dataValidation></dataValidations>`;
  const drawing = '<drawing r:id="rIdChart1"/>';
  if (!sheetXml.includes('<drawing ')) {
    if (sheetXml.includes('<ignoredErrors')) {
      sheetXml = sheetXml.replace('<ignoredErrors', `${validation}<ignoredErrors`);
      sheetXml = sheetXml.replace('</ignoredErrors>', `</ignoredErrors>${drawing}`);
    } else {
      sheetXml = sheetXml.replace('</worksheet>', `${validation}${drawing}</worksheet>`);
    }
    zip.file(normalizedSheetPath, sheetXml);
  }
  const relPath = normalizedSheetPath.replace(/worksheets\/([^/]+)$/, 'worksheets/_rels/$1.rels');
  const existingRels = zip.file(relPath);
  const relBody = existingRels
    ? (await existingRels.async('string')).replace(
      '</Relationships>',
      '<Relationship Id="rIdChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
    )
    : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdChart1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`;
  zip.file(relPath, relBody);
  zip.file('xl/drawings/drawing1.xml', drawingXml(chart.fromRow, chart.toRow));
  zip.file('xl/drawings/_rels/drawing1.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart1.xml"/></Relationships>`);
  zip.file('xl/charts/chart1.xml', pieChartXml(chart.catRange, chart.valRange));
  const contentPath = '[Content_Types].xml';
  let content = await zip.file(contentPath)?.async('string') || '';
  if (!content.includes('/xl/charts/chart1.xml')) {
    content = content.replace(
      '</Types>',
      '<Override PartName="/xl/charts/chart1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/><Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>',
    );
  }
  zip.file(contentPath, content);
  let workbook = workbookXml;
  if (!workbook.includes('fullCalcOnLoad')) {
    workbook = workbook.includes('<calcPr')
      ? workbook.replace('<calcPr', '<calcPr fullCalcOnLoad="1"')
      : workbook.replace('</workbook>', '<calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>');
    zip.file('xl/workbook.xml', workbook);
  }
  return zip.generateAsync({ type: 'nodebuffer' });
}

export async function buildProtocolVoyageExportBuffer(
  items: ProtocolVoyageCout[],
  query: ProtocolVoyageExportQuery = {},
  options?: {
    summaryItems?: ProtocolVoyageCout[];
    departmentOf?: (item: ProtocolVoyageCout) => string;
    now?: Date;
  },
): Promise<Buffer> {
  const now = options?.now ?? new Date();
  const departmentOf = options?.departmentOf ?? (() => 'Non rattaché');
  const summaryItems = options?.summaryItems ?? filterProtocolVoyagesForSummary(items, query, now);
  const source = buildVoyagesSheet(summaryItems, query, departmentOf, now);
  const summary = buildSummarySheet(summaryItems, query, departmentOf, source, now);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, source.sheet, 'Voyages');
  XLSX.utils.book_append_sheet(wb, summary.sheet, 'Synthèse');
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer;
  if (!summary.chart) return buffer;
  return attachSummaryChart(buffer, summary.chart);
}
