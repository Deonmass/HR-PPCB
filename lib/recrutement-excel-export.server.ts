import 'server-only';

import ExcelJS from 'exceljs';
import { buildExportDateStamp } from './employee-filters';
import { getRecrutementBundle } from './recrutement-store';
import { sortRecrutementByLocation } from './recrutement-location-groups';
import type { RecrutementRowEnriched } from './recrutement-types';

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE30613' },
  };
  row.alignment = { vertical: 'middle', wrapText: true };
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 40) {
  ws.columns.forEach((col) => {
    let width = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length + 2;
      if (len > width) width = Math.min(max, len);
    });
    col.width = width;
  });
}

function writeRows(ws: ExcelJS.Worksheet, rows: RecrutementRowEnriched[]) {
  for (const r of rows) {
    ws.addRow([
      r.category === 'replacement' ? 'Replacements' : 'New positions',
      r.position,
      r.grade,
      r.status,
      r.comments,
      r.budgeted,
      r.department,
      r.location,
      r.contractType,
      r.filledAt || r.recruitmentDates[0] || '',
      r.catalogTitle || '',
      r.catalogMatch ? 'Yes' : 'No',
      r.occupants.length,
    ]);
  }
}

/**
 * Recruitment Excel export — detail sheet + Dashboard with COUNTIF / COUNTA formulas.
 */
export async function buildRecrutementExcelBuffer(): Promise<{ buffer: Buffer; filename: string }> {
  const bundle = await getRecrutementBundle();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RH PPCB';
  wb.created = new Date();

  const detail = wb.addWorksheet('Recruitment', { views: [{ state: 'frozen', ySplit: 1 }] });
  detail.addRow([
    'Category',
    'Position',
    'Grade',
    'Status',
    'Comments',
    'Budgeted',
    'Department',
    'Location',
    'Contract',
    'Recruitment date',
    'Classification',
    'Linked to classification',
    'Occupants',
  ]);
  styleHeader(detail.getRow(1));
  const ordered = [
    ...sortRecrutementByLocation(bundle.rows.filter((r) => r.category === 'replacement')),
    ...sortRecrutementByLocation(bundle.rows.filter((r) => r.category === 'new')),
  ];
  writeRows(detail, ordered);
  autoWidth(detail, 10, 42);

  const last = Math.max(2, bundle.rows.length + 1);
  const dash = wb.addWorksheet('Dashboard');
  dash.getCell('A1').value = 'Recruitment indicators';
  dash.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFE30613' } };
  dash.getCell('A2').value = 'Totals below use Excel formulas (COUNTA / COUNTIF).';
  dash.getCell('A2').font = { italic: true, size: 10, color: { argb: 'FF6B6B7A' } };

  const labels: Array<[string, string]> = [
    ['Total rows', `=COUNTA(Recruitment!B2:B${last})`],
    ['Replacements', `=COUNTIF(Recruitment!A2:A${last},"Replacements")`],
    ['New positions', `=COUNTIF(Recruitment!A2:A${last},"New positions")`],
    ['Ongoing', `=COUNTIF(Recruitment!D2:D${last},"Ongoing")`],
    ['Started', `=COUNTIF(Recruitment!D2:D${last},"Started")`],
    ['Done', `=COUNTIF(Recruitment!D2:D${last},"Done")`],
    ['Not started', `=COUNTIF(Recruitment!D2:D${last},"Not started")`],
    ['Budgeted Yes', `=COUNTIF(Recruitment!F2:F${last},"Yes")`],
    ['Linked to classification', `=COUNTIF(Recruitment!L2:L${last},"Yes")`],
  ];

  dash.getCell('A4').value = 'Indicator';
  dash.getCell('B4').value = 'Value';
  styleHeader(dash.getRow(4));
  labels.forEach(([label, formula], i) => {
    const row = 5 + i;
    dash.getCell(`A${row}`).value = label;
    dash.getCell(`B${row}`).value = { formula };
  });
  dash.getColumn(1).width = 28;
  dash.getColumn(2).width = 14;

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  const filename = `RECRUTEMENT_${buildExportDateStamp()}.xlsx`;
  return { buffer, filename };
}
