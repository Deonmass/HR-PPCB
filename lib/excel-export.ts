import XLSX from 'xlsx-js-style';
import {
  DOCUMENT_FIELDS,
  calcDocumentCompletion,
  calcGlobalStats,
  calcInspectionFromEmployees,
  normalizeDocStatus,
} from './documents';
import { buildExportDateStamp, buildExportSuffix, type EmployeeFilters } from './employee-filters';
import type { Employee } from './types';

const SIMPLE_BORDER = {
  top: { style: 'thin', color: { rgb: 'CBD5E1' } },
  bottom: { style: 'thin', color: { rgb: 'CBD5E1' } },
  left: { style: 'thin', color: { rgb: 'CBD5E1' } },
  right: { style: 'thin', color: { rgb: 'CBD5E1' } },
};

const HEADER_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 },
  fill: { fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: {
    top: { style: 'thin', color: { rgb: 'CCCCCC' } },
    bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
    left: { style: 'thin', color: { rgb: 'CCCCCC' } },
    right: { style: 'thin', color: { rgb: 'CCCCCC' } },
  },
};

const TITLE_STYLE = {
  font: { bold: true, sz: 12, color: { rgb: '1E3A5F' } },
};

const CELL_Y = {
  font: { bold: true, color: { rgb: '065F46' } },
  fill: { fgColor: { rgb: 'D1FAE5' } },
  alignment: { horizontal: 'center' },
  border: SIMPLE_BORDER,
};

const CELL_N = {
  font: { bold: true, color: { rgb: '991B1B' } },
  fill: { fgColor: { rgb: 'FEE2E2' } },
  alignment: { horizontal: 'center' },
  border: SIMPLE_BORDER,
};

const CELL_NA = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '5C6573' } },
  alignment: { horizontal: 'center' },
  border: SIMPLE_BORDER,
};

const CRITERIA_COUNT = DOCUMENT_FIELDS.length;
/** Après JOB TITLE : date d'embauche, puis localisation, puis critères. */
const DOC_COL_START = 7;
const DOC_COL_END = DOC_COL_START + CRITERIA_COUNT - 1;
const COL_Y = DOC_COL_END + 1;
const COL_NA = COL_Y + 1;
const COL_N = COL_NA + 1;
const COL_RATE = COL_N + 1;

const SUMMARY_LABEL_STYLE = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '1E3A5F' } },
  alignment: { horizontal: 'left' },
};

type ExportCell = string | number | { v?: string | number; f?: string; t?: string; z?: string; s?: object };
type ExportRow = ExportCell[];

function colLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function docRange(row: number): string {
  return `${colLetter(DOC_COL_START)}${row}:${colLetter(DOC_COL_END)}${row}`;
}

function formulaCell(formula: string, style?: object): ExportCell {
  return { f: formula, t: 'n', s: style ?? {} };
}

function formulaPctCell(formula: string, style?: object): ExportCell {
  return { f: formula, t: 'n', z: '0"%"', s: style ?? {} };
}

function rowCountFormulas(row: number) {
  const range = docRange(row);
  const yRef = `${colLetter(COL_Y)}${row}`;
  const naRef = `${colLetter(COL_NA)}${row}`;
  return {
    y: formulaCell(`COUNTIF(${range},"Y")`, CELL_Y),
    na: formulaCell(`COUNTIF(${range},"NA")`, CELL_NA),
    n: formulaCell(`COUNTIF(${range},"N")`, CELL_N),
    rate: formulaPctCell(
      `IFERROR(ROUND((${yRef}+${naRef})/${CRITERIA_COUNT}*100,0),0)`,
      { alignment: { horizontal: 'center' }, font: { bold: true } },
    ),
  };
}

function styledCell(value: string | number, style?: object): ExportCell {
  return { v: value, t: typeof value === 'number' ? 'n' : 's', s: style ?? {} };
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws['!cols'] = widths.map((wch) => ({ wch }));
}

function downloadWorkbook(wb: XLSX.WorkBook, filename: string) {
  XLSX.writeFile(wb, filename);
}

function calcDepartmentExportRows(employees: Employee[]) {
  const byDept: Record<string, { y: number; n: number; na: number; count: number; sumPct: number }> = {};

  for (const emp of employees) {
    const dept = emp.departement || 'Non assigné';
    if (!byDept[dept]) byDept[dept] = { y: 0, n: 0, na: 0, count: 0, sumPct: 0 };
    byDept[dept].count++;
    byDept[dept].sumPct += calcDocumentCompletion(emp).pct;

    for (const field of DOCUMENT_FIELDS) {
      const val = normalizeDocStatus(String(emp.documents?.[field.key] || ''));
      if (val === 'Y') byDept[dept].y++;
      else if (val === 'NA') byDept[dept].na++;
      else byDept[dept].n++;
    }
  }

  return Object.entries(byDept)
    .map(([name, d]) => {
      const totalCells = d.y + d.n + d.na || 1;
      return {
        name,
        total: d.count,
        y: d.y / totalCells,
        na: d.na / totalCells,
        n: d.n / totalCells,
        rate: d.sumPct / d.count / 100,
      };
    })
    .sort((a, b) => b.total - a.total);
}

/** Export CHECK DOCUMENTS BASE */
export function exportCheckDocumentsBase(employees: Employee[], filters: EmployeeFilters) {
  const rows: ExportCell[][] = [];
  rows.push([styledCell('EMPLOYEE FILE UPDATED', TITLE_STYLE)]);
  rows.push([]);
  rows.push([
    styledCell('MATRICULE', HEADER_STYLE),
    styledCell('COMPLET NAME', HEADER_STYLE),
    styledCell('DEPARTMENT', HEADER_STYLE),
    styledCell('GRADE', HEADER_STYLE),
    styledCell('JOB TITLE', HEADER_STYLE),
    styledCell("DATE D'EMBAUCHE", HEADER_STYLE),
    styledCell('LOCALISATION', HEADER_STYLE),
    ...DOCUMENT_FIELDS.map((f) => styledCell(f.label, HEADER_STYLE)),
    styledCell('Y', HEADER_STYLE),
    styledCell('NA', HEADER_STYLE),
    styledCell('N', HEADER_STYLE),
    styledCell('RATE %', HEADER_STYLE),
  ]);

  const sorted = [...employees].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const firstDataRow = 4;
  const lastDataRow = firstDataRow + sorted.length - 1;

  for (let i = 0; i < sorted.length; i++) {
    const emp = sorted[i];
    const excelRow = firstDataRow + i;
    const counts = rowCountFormulas(excelRow);
    rows.push([
      emp.matricule,
      emp.nom,
      emp.departement,
      emp.grade,
      emp.jobTitle,
      emp.appointmentDate || '',
      emp.localisation || '',
      ...DOCUMENT_FIELDS.map((f) => {
        const val = normalizeDocStatus(String(emp.documents?.[f.key] || ''));
        const style = val === 'Y' ? CELL_Y : val === 'NA' ? CELL_NA : CELL_N;
        return styledCell(val, style);
      }),
      counts.y,
      counts.na,
      counts.n,
      counts.rate,
    ]);
  }

  const sumRow = lastDataRow + 2;
  const pctRow = sumRow + 1;
  const yCol = colLetter(COL_Y);
  const naCol = colLetter(COL_NA);
  const nCol = colLetter(COL_N);
  const totalExpr = `${yCol}${sumRow}+${naCol}${sumRow}+${nCol}${sumRow}`;

  rows.push([]);
  rows.push([
    styledCell('Résumé global', SUMMARY_LABEL_STYLE),
    '', '', '', '', '', '',
    ...DOCUMENT_FIELDS.map(() => ''),
    formulaCell(`SUM(${yCol}${firstDataRow}:${yCol}${lastDataRow})`, CELL_Y),
    formulaCell(`SUM(${naCol}${firstDataRow}:${naCol}${lastDataRow})`, CELL_NA),
    formulaCell(`SUM(${nCol}${firstDataRow}:${nCol}${lastDataRow})`, CELL_N),
    '',
  ]);
  rows.push([
    styledCell('%', SUMMARY_LABEL_STYLE),
    '', '', '', '', '', '',
    ...DOCUMENT_FIELDS.map(() => ''),
    formulaPctCell(`IFERROR(ROUND(${yCol}${sumRow}/(${totalExpr})*100,0),0)`, CELL_Y),
    formulaPctCell(`IFERROR(ROUND(${naCol}${sumRow}/(${totalExpr})*100,0),0)`, CELL_NA),
    formulaPctCell(`IFERROR(ROUND(${nCol}${sumRow}/(${totalExpr})*100,0),0)`, CELL_N),
    formulaPctCell(`IFERROR(${yCol}${pctRow}+${naCol}${pctRow},0)`, {
      font: { bold: true, color: { rgb: '065F46' } },
      fill: { fgColor: { rgb: 'D1FAE5' } },
      alignment: { horizontal: 'center' },
      border: SIMPLE_BORDER,
    }),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [12, 28, 18, 8, 28, 14, 14, ...DOCUMENT_FIELDS.map(() => 14), 6, 6, 6, 10]);
  ws['!rows'] = [{ hpt: 22 }, { hpt: 8 }, { hpt: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'CHECK DOCUMENTS BASE');
  downloadWorkbook(wb, `CHECK_DOCUMENTS_BASE${buildExportSuffix(filters)}_${buildExportDateStamp()}.xlsx`);
}

/** Export INSPECTIONS */
export function exportInspections(employees: Employee[], filters: EmployeeFilters) {
  const inspections = calcInspectionFromEmployees(employees);
  const rows: ExportCell[][] = [];

  rows.push([styledCell('INSPECTIONS', TITLE_STYLE)]);
  rows.push([]);
  rows.push([
    styledCell('STATUS', HEADER_STYLE),
    styledCell('COUNT', HEADER_STYLE),
    styledCell('CRITERIAL', HEADER_STYLE),
    styledCell('TOTAL', HEADER_STYLE),
    styledCell('N', HEADER_STYLE),
    styledCell('Y', HEADER_STYLE),
    styledCell('NA', HEADER_STYLE),
    styledCell('CONFORMITÉ %', HEADER_STYLE),
    styledCell('NON-CONFORMITÉ %', HEADER_STYLE),
  ]);

  inspections.forEach((row, i) => {
    const total = Number(row.total) || 1;
    const y = Number(row.y);
    const n = Number(row.n);
    const na = Number(row.na);
    const excelRow = 4 + i;

    rows.push([
      1,
      i + 1,
      row.critere,
      total,
      styledCell(n, CELL_N),
      styledCell(y, CELL_Y),
      styledCell(na, CELL_NA),
      formulaPctCell(`IFERROR(ROUND((F${excelRow}+G${excelRow})/D${excelRow}*100,0),0)`),
      formulaPctCell(`IFERROR(ROUND(E${excelRow}/D${excelRow}*100,0),0)`),
    ]);
  });

  const lastInspRow = 3 + inspections.length;
  const sumRow = lastInspRow + 2;
  const pctRow1 = sumRow + 1;
  const pctRow2 = sumRow + 2;
  rows.push([]);
  rows.push([
    '', '', '',
    formulaCell(`E${sumRow}+F${sumRow}+G${sumRow}`),
    formulaCell(`SUM(E4:E${lastInspRow})`, CELL_N),
    formulaCell(`SUM(F4:F${lastInspRow})`, CELL_Y),
    formulaCell(`SUM(G4:G${lastInspRow})`, CELL_NA),
    '', '',
  ]);
  rows.push([
    '', '', '', 1,
    formulaPctCell(`IFERROR(E${sumRow}/D${sumRow},0)`),
    formulaPctCell(`IFERROR(F${sumRow}/D${sumRow},0)`),
    formulaPctCell(`IFERROR(G${sumRow}/D${sumRow},0)`),
    formulaPctCell(`IFERROR(F${pctRow1}+G${pctRow1},0)`),
    formulaPctCell(`IFERROR(E${pctRow1},0)`),
  ]);
  rows.push([
    '', '', '', 1,
    formulaPctCell(`IFERROR(E${sumRow}/D${sumRow},0)`),
    formulaPctCell(`IFERROR((F${sumRow}+G${sumRow})/D${sumRow},0)`),
    formulaPctCell(`IFERROR(G${sumRow}/D${sumRow},0)`),
    formulaPctCell(`IFERROR(F${pctRow2}+G${pctRow2},0)`),
    formulaPctCell(`IFERROR(E${pctRow2},0)`),
  ]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [8, 8, 52, 10, 8, 8, 8, 14, 16]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'INSPECTIONS');
  downloadWorkbook(wb, `INSPECTIONS${buildExportSuffix(filters)}_${buildExportDateStamp()}.xlsx`);
}

/** Export DASHBOARD (statistiques) */
export function exportDashboard(employees: Employee[], filters: EmployeeFilters) {
  const stats = calcGlobalStats(employees);
  const deptRows = calcDepartmentExportRows(employees);
  const rows: ExportCell[][] = [];

  rows.push([]);
  rows.push([styledCell('EMPLOYEE FILE UPDATED DASHBOARD', TITLE_STYLE)]);
  rows.push([]);
  rows.push([]);
  rows.push([
    styledCell('TOTAL EMPLOYEE', HEADER_STYLE),
    styledCell('CONFORME RATE', HEADER_STYLE),
    styledCell('NO CONFORME RATE', HEADER_STYLE),
    '',
    styledCell('DEPARTMENTS', HEADER_STYLE),
    styledCell('Total employee', HEADER_STYLE),
    styledCell('Y', HEADER_STYLE),
    styledCell('NA', HEADER_STYLE),
    styledCell('N', HEADER_STYLE),
    styledCell('RATE', HEADER_STYLE),
  ]);

  const conformeRate = stats.conformeRate / 100;
  const nonConformeRate = stats.noConformeRate / 100;

  deptRows.forEach((d, i) => {
    rows.push([
      i === 0 ? stats.total : '',
      i === 0 ? conformeRate : '',
      i === 0 ? nonConformeRate : '',
      '',
      d.name,
      d.total,
      d.y,
      d.na,
      d.n,
      d.rate,
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  setColWidths(ws, [14, 14, 16, 4, 22, 14, 10, 10, 10, 10]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DASHBOARD');
  downloadWorkbook(wb, `DASHBOARD${buildExportSuffix(filters)}_${buildExportDateStamp()}.xlsx`);
}
