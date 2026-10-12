import 'server-only';

import ExcelJS from 'exceljs';
import { buildExportDateStamp } from './employee-filters';
import type { AirtimeAssignment } from './airtime-types';

const HEADERS = [
  'Matricule',
  'Nom',
  'Compagnie',
  'Grade',
  'Département',
  'Centre de coût',
  'Position',
  'Lieu',
  'Quota',
  'Quota actuel',
  'Écart',
  'Numéro',
  'Statut',
] as const;

function companyLabel(value: string): string {
  const folded = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (folded.includes('ppc barnet') || folded === 'ppc') return 'PPC';
  return value;
}

function statusLabel(row: AirtimeAssignment): string {
  return row.msisdn ? 'Attribué' : 'Non attribué';
}

function rowValues(row: AirtimeAssignment): Array<string | number | null> {
  return [
    row.matricule || '',
    row.nom || '',
    companyLabel(row.compagnie || ''),
    row.grade || '',
    row.departement || '',
    row.centreCout || '',
    row.position || '',
    row.localisation || '',
    row.quotaAirtime,
    row.actualAirtime,
    row.ecart,
    row.msisdn || '',
    statusLabel(row),
  ];
}

function byName(a: AirtimeAssignment, b: AirtimeAssignment): number {
  return (a.nom || '').localeCompare(b.nom || '', 'fr', { sensitivity: 'base' })
    || (a.matricule || '').localeCompare(b.matricule || '', 'fr', { numeric: true });
}

function addSheet(wb: ExcelJS.Workbook, name: string, headerColor: string, rows: AirtimeAssignment[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  const header = ws.addRow([...HEADERS]);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  header.height = 22;
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerColor } };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
  const sorted = rows.slice().sort(byName);
  for (const row of sorted) {
    const added = ws.addRow(rowValues(row));
    added.getCell(9).numFmt = '#,##0.00';
    added.getCell(10).numFmt = '#,##0.00';
    added.getCell(11).numFmt = '#,##0.00';
  }
  const widths = [14, 32, 22, 10, 24, 16, 28, 18, 12, 14, 12, 16, 14];
  widths.forEach((width, index) => {
    ws.getColumn(index + 1).width = width;
  });
  ws.autoFilter = { from: 'A1', to: 'M1' };
}

export async function buildAirtimeExcelBuffer(
  rows: AirtimeAssignment[],
): Promise<{ buffer: Buffer; filename: string }> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RH PPCB';
  wb.created = new Date();
  addSheet(wb, 'PPC', 'FFE30613', rows.filter((row) => row.matched));
  addSheet(wb, 'Contractants', 'FF5B21B6', rows.filter((row) => row.contractantMatched));
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return {
    buffer,
    filename: `Airtime_PPC_Contractants_${buildExportDateStamp()}.xlsx`,
  };
}
