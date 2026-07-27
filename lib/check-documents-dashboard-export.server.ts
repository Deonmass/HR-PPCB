import 'server-only';

import ExcelJS from 'exceljs';
import {
  calcCellAggregateStats,
  calcDocumentCompletion,
  calcGlobalStats,
  DOCUMENT_FIELDS,
  normalizeDocStatus,
} from './documents';
import { buildExportDateStamp, buildExportSuffix, type EmployeeFilters } from './employee-filters';
import type { Employee } from './types';

const COLORS = {
  navy: 'FF0F2744',
  navyMid: 'FF1E3A5F',
  cyan: 'FF0891B2',
  green: 'FF059669',
  greenSoft: 'FFD1FAE5',
  red: 'FFDC2626',
  redSoft: 'FFFEE2E2',
  amber: 'FFD97706',
  amberSoft: 'FFFEF3C7',
  slate: 'FF64748B',
  slateSoft: 'FFF1F5F9',
  white: 'FFFFFFFF',
  border: 'FFCBD5E1',
  barTrack: 'FFE2E8F0',
  barY: 'FF10B981',
  barNa: 'FF64748B',
  barN: 'FFEF4444',
  barRate: 'FF2563EB',
};

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: COLORS.border } };
  return { top: edge, bottom: edge, left: edge, right: edge };
}

function headerFill(): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.navyMid } };
}

function solid(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function calcDepartmentRows(employees: Employee[]) {
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
        y: d.y,
        na: d.na,
        n: d.n,
        yPct: d.y / totalCells,
        naPct: d.na / totalCells,
        nPct: d.n / totalCells,
        rate: d.sumPct / d.count / 100,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.total - a.total);
}

function styleTitle(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 18, color: { argb: COLORS.white }, name: 'Calibri' };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

function styleKpiLabel(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 9, color: { argb: 'FF94A3B8' }, name: 'Calibri' };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function styleKpiValue(cell: ExcelJS.Cell, color: string) {
  cell.font = { bold: true, size: 22, color: { argb: color }, name: 'Calibri' };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function paintBar(
  sheet: ExcelJS.Worksheet,
  row: number,
  startCol: number,
  segments: Array<{ pct: number; color: string }>,
  maxBlocks = 20,
) {
  let cursor = startCol;
  for (const segment of segments) {
    const blocks = Math.max(0, Math.round(segment.pct * maxBlocks));
    for (let i = 0; i < blocks; i++) {
      const cell = sheet.getCell(row, cursor + i);
      cell.fill = solid(segment.color);
      cell.border = thinBorder();
    }
    cursor += blocks;
  }
  while (cursor < startCol + maxBlocks) {
    const cell = sheet.getCell(row, cursor);
    cell.fill = solid(COLORS.barTrack);
    cell.border = thinBorder();
    cursor++;
  }
}

export function buildDashboardExportFilename(filters: EmployeeFilters): string {
  return `DASHBOARD${buildExportSuffix(filters)}_${buildExportDateStamp()}.xlsx`;
}

export async function buildDashboardExportBuffer(
  employees: Employee[],
  filters: EmployeeFilters,
): Promise<Buffer> {
  const stats = calcGlobalStats(employees);
  const aggregate = calcCellAggregateStats(employees);
  const deptRows = calcDepartmentRows(employees);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HR RH App';
  workbook.created = new Date();

  const dash = workbook.addWorksheet('DASHBOARD', {
    views: [{ showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  });

  dash.columns = [
    { key: 'a', width: 3 },
    { key: 'b', width: 28 },
    { key: 'c', width: 12 },
    { key: 'd', width: 12 },
    { key: 'e', width: 12 },
    { key: 'f', width: 12 },
    { key: 'g', width: 3 },
    ...Array.from({ length: 20 }, (_, i) => ({ key: `bar${i}`, width: 2.2 })),
    { key: 'label', width: 12 },
  ];

  // ── Banner ──
  dash.mergeCells('B2:Z3');
  const title = dash.getCell('B2');
  title.value = 'EMPLOYEE FILE UPDATED — DASHBOARD';
  title.fill = solid(COLORS.navy);
  styleTitle(title);
  dash.getRow(2).height = 28;
  dash.getRow(3).height = 18;

  dash.mergeCells('B4:Z4');
  const subtitle = dash.getCell('B4');
  const filterBits = [
    filters.dept ? `Département : ${filters.dept}` : null,
    filters.search.trim() ? `Recherche : ${filters.search.trim()}` : null,
  ].filter(Boolean);
  subtitle.value = filterBits.length
    ? `Filtres actifs — ${filterBits.join(' · ')}`
    : `Export du ${new Date().toLocaleDateString('fr-FR')} — ${employees.length} employés`;
  subtitle.font = { size: 10, italic: true, color: { argb: COLORS.slate } };
  subtitle.alignment = { vertical: 'middle' };

  // ── KPI cards ──
  const kpis: Array<{ label: string; value: string | number; color: string; fill: string }> = [
    { label: 'TOTAL EMPLOYÉS', value: stats.total, color: COLORS.cyan, fill: 'FFECFEFF' },
    { label: 'TAUX CONFORME', value: `${aggregate.conformeRate}%`, color: COLORS.green, fill: COLORS.greenSoft },
    { label: 'TAUX NON CONFORME', value: `${aggregate.nonConformeRate}%`, color: COLORS.red, fill: COLORS.redSoft },
    { label: 'MOYENNE DOSSIERS', value: `${stats.conformeRate}%`, color: 'FF7C3AED', fill: 'FFF3E8FF' },
  ];

  const kpiCols = [2, 5, 8, 11] as const;
  kpis.forEach((kpi, index) => {
    const col = kpiCols[index];
    const endCol = col + 2;
    dash.mergeCells(6, col, 6, endCol);
    dash.mergeCells(7, col, 8, endCol);

    const labelCell = dash.getCell(6, col);
    labelCell.value = kpi.label;
    labelCell.fill = solid(kpi.fill);
    styleKpiLabel(labelCell);
    labelCell.border = thinBorder();

    const valueCell = dash.getCell(7, col);
    valueCell.value = kpi.value;
    valueCell.fill = solid(kpi.fill);
    styleKpiValue(valueCell, kpi.color);
    valueCell.border = thinBorder();
    dash.getCell(8, col).fill = solid(kpi.fill);
    dash.getCell(8, col).border = thinBorder();
  });
  dash.getRow(6).height = 18;
  dash.getRow(7).height = 22;
  dash.getRow(8).height = 16;

  // ── Aggregate base (formules / totaux cellules) ──
  dash.mergeCells('B10:F10');
  const baseTitle = dash.getCell('B10');
  baseTitle.value = 'BASE AGRÉGÉE — CELLULES DOCUMENTAIRES';
  baseTitle.font = { bold: true, size: 12, color: { argb: COLORS.white } };
  baseTitle.fill = solid(COLORS.navyMid);
  baseTitle.alignment = { vertical: 'middle' };

  const baseHeaders = ['Indicateur', 'Somme', 'Part', 'Formule'];
  baseHeaders.forEach((label, i) => {
    const cell = dash.getCell(11, 2 + i);
    cell.value = label;
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
    cell.fill = headerFill();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = thinBorder();
  });

  const baseRows = [
    { label: 'Y (conforme)', sum: aggregate.sumY, pct: aggregate.yPct / 100, formula: 'Σ cellules = Y', color: COLORS.barY },
    { label: 'NA (non applicable)', sum: aggregate.sumNa, pct: aggregate.naPct / 100, formula: 'Σ cellules = NA', color: COLORS.barNa },
    { label: 'N (non conforme)', sum: aggregate.sumN, pct: aggregate.nPct / 100, formula: 'Σ cellules = N', color: COLORS.barN },
    {
      label: 'Conformité (Y+NA)',
      sum: aggregate.sumY + aggregate.sumNa,
      pct: aggregate.conformeRate / 100,
      formula: '(ΣY + ΣNA) / Total',
      color: COLORS.barRate,
    },
  ];

  baseRows.forEach((row, index) => {
    const r = 12 + index;
    dash.getCell(r, 2).value = row.label;
    dash.getCell(r, 3).value = row.sum;
    dash.getCell(r, 4).value = row.pct;
    dash.getCell(r, 4).numFmt = '0.0%';
    dash.getCell(r, 5).value = row.formula;

    for (let c = 2; c <= 5; c++) {
      const cell = dash.getCell(r, c);
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: c === 2 || c === 5 ? 'left' : 'center' };
      cell.font = { size: 10 };
    }
    dash.getCell(r, 2).fill = solid(index % 2 === 0 ? COLORS.slateSoft : COLORS.white);
    dash.getCell(r, 3).font = { bold: true, color: { argb: row.color } };
  });

  // Visual distribution bar
  dash.mergeCells('B17:F17');
  dash.getCell('B17').value = 'RÉPARTITION VISUELLE Y / NA / N';
  dash.getCell('B17').font = { bold: true, size: 11, color: { argb: COLORS.navyMid } };

  paintBar(dash, 18, 2, [
    { pct: aggregate.yPct / 100, color: COLORS.barY },
    { pct: aggregate.naPct / 100, color: COLORS.barNa },
    { pct: aggregate.nPct / 100, color: COLORS.barN },
  ], 24);
  dash.getRow(18).height = 22;

  dash.getCell('B19').value = 'Y';
  dash.getCell('B19').font = { bold: true, color: { argb: COLORS.barY }, size: 9 };
  dash.getCell('C19').value = 'NA';
  dash.getCell('C19').font = { bold: true, color: { argb: COLORS.barNa }, size: 9 };
  dash.getCell('D19').value = 'N';
  dash.getCell('D19').font = { bold: true, color: { argb: COLORS.barN }, size: 9 };

  // ── Department chart table ──
  const deptStart = 21;
  dash.mergeCells(`B${deptStart}:Z${deptStart}`);
  const deptTitle = dash.getCell(`B${deptStart}`);
  deptTitle.value = 'GRAPHIQUE PAR DÉPARTEMENT — EFFECTIFS & TAUX';
  deptTitle.font = { bold: true, size: 12, color: { argb: COLORS.white } };
  deptTitle.fill = solid(COLORS.navyMid);
  deptTitle.alignment = { vertical: 'middle' };

  const deptHeaders = ['Département', 'Employés', 'Y', 'NA', 'N', 'Taux', 'Graphique taux de conformité'];
  deptHeaders.forEach((label, i) => {
    const cell = dash.getCell(deptStart + 1, 2 + i);
    cell.value = label;
    cell.font = { bold: true, color: { argb: COLORS.white }, size: 10 };
    cell.fill = headerFill();
    cell.alignment = { horizontal: i === 0 || i === 6 ? 'left' : 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
  // Merge header over bar columns
  dash.mergeCells(deptStart + 1, 8, deptStart + 1, 27);

  deptRows.forEach((dept, index) => {
    const r = deptStart + 2 + index;
    dash.getCell(r, 2).value = dept.name;
    dash.getCell(r, 3).value = dept.total;
    dash.getCell(r, 4).value = dept.y;
    dash.getCell(r, 5).value = dept.na;
    dash.getCell(r, 6).value = dept.n;
    dash.getCell(r, 7).value = dept.rate;
    dash.getCell(r, 7).numFmt = '0%';

    for (let c = 2; c <= 7; c++) {
      const cell = dash.getCell(r, c);
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: c === 2 ? 'left' : 'center' };
      cell.font = { size: 10 };
      if (index % 2 === 0) cell.fill = solid(COLORS.slateSoft);
    }
    dash.getCell(r, 7).font = {
      bold: true,
      size: 10,
      color: { argb: dept.rate >= 0.8 ? COLORS.green : dept.rate >= 0.6 ? COLORS.amber : COLORS.red },
    };

    paintBar(dash, r, 8, [{ pct: dept.rate, color: COLORS.barRate }], 20);
    dash.getCell(r, 28).value = dept.rate;
    dash.getCell(r, 28).numFmt = '0%';
    dash.getCell(r, 28).font = { size: 9, color: { argb: COLORS.slate } };
  });

  // ── Legend / formules ──
  const legendRow = deptStart + 3 + deptRows.length;
  dash.mergeCells(`B${legendRow}:F${legendRow}`);
  dash.getCell(`B${legendRow}`).value = 'FORMULES DE RÉFÉRENCE';
  dash.getCell(`B${legendRow}`).font = { bold: true, size: 11, color: { argb: COLORS.navyMid } };

  const formulas = [
    'Taux dossier = (nombre de Y + NA) / 19 critères',
    'Taux conforme global = (ΣY + ΣNA) / (ΣY + ΣNA + ΣN)',
    'Taux non conforme = ΣN / (ΣY + ΣNA + ΣN)',
    'Moyenne dossiers = moyenne des taux individuels par employé',
    'Graphique = barre proportionnelle au taux de conformité du département',
  ];
  formulas.forEach((text, i) => {
    const r = legendRow + 1 + i;
    dash.mergeCells(`B${r}:Z${r}`);
    dash.getCell(`B${r}`).value = `• ${text}`;
    dash.getCell(`B${r}`).font = { size: 9, color: { argb: COLORS.slate } };
  });

  // ── Second sheet: data base for charts / pivot ──
  const base = workbook.addWorksheet('BASE DEPARTEMENTS', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  base.columns = [
    { header: 'Département', key: 'name', width: 28 },
    { header: 'Employés', key: 'total', width: 12 },
    { header: 'Y', key: 'y', width: 10 },
    { header: 'NA', key: 'na', width: 10 },
    { header: 'N', key: 'n', width: 10 },
    { header: 'Part Y', key: 'yPct', width: 10 },
    { header: 'Part NA', key: 'naPct', width: 10 },
    { header: 'Part N', key: 'nPct', width: 10 },
    { header: 'Taux conformité', key: 'rate', width: 16 },
  ];

  base.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: COLORS.white } };
    cell.fill = headerFill();
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = thinBorder();
  });
  base.getRow(1).height = 28;

  deptRows.forEach((dept) => {
    const row = base.addRow({
      name: dept.name,
      total: dept.total,
      y: dept.y,
      na: dept.na,
      n: dept.n,
      yPct: dept.yPct,
      naPct: dept.naPct,
      nPct: dept.nPct,
      rate: dept.rate,
    });
    row.getCell('yPct').numFmt = '0.0%';
    row.getCell('naPct').numFmt = '0.0%';
    row.getCell('nPct').numFmt = '0.0%';
    row.getCell('rate').numFmt = '0.0%';
    row.eachCell((cell) => {
      cell.border = thinBorder();
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    row.getCell('name').alignment = { horizontal: 'left', vertical: 'middle' };
  });

  // Data bars on rate column
  if (deptRows.length > 0) {
    base.addConditionalFormatting({
      ref: `I2:I${deptRows.length + 1}`,
      rules: [
        {
          type: 'dataBar',
          priority: 1,
          cfvo: [
            { type: 'num', value: 0 },
            { type: 'num', value: 1 },
          ],
          showValue: true,
          gradient: true,
        } as ExcelJS.DataBarRuleType,
      ],
    });
  }

  // ── Third sheet: KPI form ──
  const form = workbook.addWorksheet('FICHE SYNTHESE');
  form.columns = [
    { width: 3 },
    { width: 32 },
    { width: 22 },
    { width: 40 },
  ];

  form.mergeCells('B2:D2');
  form.getCell('B2').value = 'FICHE DE SYNTHÈSE — CHECK DOCUMENTS';
  form.getCell('B2').font = { bold: true, size: 16, color: { argb: COLORS.white } };
  form.getCell('B2').fill = solid(COLORS.navy);
  form.getCell('B2').alignment = { vertical: 'middle' };
  form.getRow(2).height = 32;

  const formFields: Array<[string, string | number]> = [
    ['Date d\'export', new Date().toLocaleString('fr-FR')],
    ['Périmètre', filterBits.length ? filterBits.join(' · ') : 'Tous les employés'],
    ['Total employés', stats.total],
    ['Cellules Y', aggregate.sumY],
    ['Cellules NA', aggregate.sumNa],
    ['Cellules N', aggregate.sumN],
    ['Total cellules', aggregate.totalCells],
    ['Taux conforme (Y+NA)', `${aggregate.conformeRate}%`],
    ['Taux non conforme (N)', `${aggregate.nonConformeRate}%`],
    ['Moyenne dossiers live', `${stats.conformeRate}%`],
    ['Nombre de départements', deptRows.length],
  ];

  formFields.forEach(([label, value], index) => {
    const r = 4 + index;
    form.getCell(r, 2).value = label;
    form.getCell(r, 2).font = { bold: true, size: 10, color: { argb: COLORS.navyMid } };
    form.getCell(r, 2).fill = solid(COLORS.slateSoft);
    form.getCell(r, 2).border = thinBorder();
    form.getCell(r, 3).value = value;
    form.getCell(r, 3).border = thinBorder();
    form.getCell(r, 3).alignment = { horizontal: 'left', vertical: 'middle' };
    form.mergeCells(r, 3, r, 4);
  });

  form.getCell('B16').value = 'Notes';
  form.getCell('B16').font = { bold: true, size: 10, color: { argb: COLORS.navyMid } };
  form.mergeCells('B17:D20');
  form.getCell('B17').value = '';
  form.getCell('B17').border = thinBorder();
  form.getCell('B17').alignment = { vertical: 'top', wrapText: true };
  form.getCell('B17').fill = solid('FFFFFBEB');

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
