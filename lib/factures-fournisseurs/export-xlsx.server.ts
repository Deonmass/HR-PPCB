import 'server-only';

import fs from 'fs';
import XlsxPopulate from 'xlsx-populate';
import type { FactureSuivi } from '@/lib/factures-fournisseurs/types';
import { FACTURE_STAGE_COMMENTS, FACTURE_STAGE_LABELS } from '@/lib/factures-fournisseurs/types';
import { FACTURES_SUIVI_EXPORT_TEMPLATE_PATH } from '@/lib/factures-fournisseurs/paths';
import { parseDisplayDate, normalizePaymentValue } from '@/lib/factures-fournisseurs/utils';

type PopulateWorkbook = Awaited<ReturnType<typeof XlsxPopulate.fromBlankAsync>>;
type PopulateSheet = ReturnType<PopulateWorkbook['sheet']>;

const SHEET_DATA = 'Factures';
const SHEET_DASH = 'Dashboard';
const SHEET_HELP = 'Guide';

export const FACTURES_EXPORT_MAX_ROWS = 500;
const TITLE_ROW = 1;
const HEADER_ROW = 2;
const DATA_START_ROW = 3;
const LAST_DATA_ROW = DATA_START_ROW + FACTURES_EXPORT_MAX_ROWS - 1;

const DATE_FMT = 'dd/mm/yyyy';

/**
 * Colonnes template :
 * A–K saisie pipeline, L payment, M DATE PYM, N STATUT, O COMMENTAIRE
 */
const COL = {
  date: 'A',
  societe: 'B',
  facture: 'C',
  montant: 'D',
  echeance: 'E',
  pr: 'F',
  datePr: 'G',
  po: 'H',
  datePo: 'I',
  grn: 'J',
  dateGrn: 'K',
  payment: 'L',
  datePym: 'M',
  statut: 'N',
  commentaire: 'O',
} as const;

const DATA_HEADERS = [
  'DATE',
  'SOCIETE',
  'FACTURE',
  'MONTANT',
  'ECHEANCE',
  'PR',
  'DATE PR',
  'P.O',
  'DATE PO',
  'GRN',
  'DATE GRN',
  'payment',
  'DATE PYM',
  'STATUT',
  'COMMENTAIRE',
] as const;

function escapeFormulaText(value: string): string {
  return value.replace(/"/g, '""');
}

/**
 * STATUT : unpaid (payment vide) | paid (payment renseigné)
 */
export function factureRowFormulas(row: number): {
  statut: string;
  commentaire: string;
} {
  const unpaid = escapeFormulaText(FACTURE_STAGE_LABELS.unpaid);
  const paid = escapeFormulaText(FACTURE_STAGE_LABELS.paid);
  const cUnpaid = escapeFormulaText(FACTURE_STAGE_COMMENTS.unpaid);
  const cPaid = escapeFormulaText(FACTURE_STAGE_COMMENTS.paid);

  return {
    statut:
      `IF(${COL.facture}${row}="","",` +
      `IF(${COL.payment}${row}="","${unpaid}","${paid}"))`,
    commentaire:
      `IF(${COL.facture}${row}="","",` +
      `IF(${COL.payment}${row}="","${cUnpaid}","${cPaid}"))`,
  };
}

function overdueCountFormula(): string {
  const paid = escapeFormulaText(FACTURE_STAGE_LABELS.paid);
  return (
    `SUMPRODUCT((${SHEET_DATA}!$${COL.facture}$${DATA_START_ROW}:$${COL.facture}$${LAST_DATA_ROW}<>"")` +
    `*(${SHEET_DATA}!$${COL.statut}$${DATA_START_ROW}:$${COL.statut}$${LAST_DATA_ROW}<>"${paid}")` +
    `*(${SHEET_DATA}!$${COL.echeance}$${DATA_START_ROW}:$${COL.echeance}$${LAST_DATA_ROW}<>"")` +
    `*(${SHEET_DATA}!$${COL.echeance}$${DATA_START_ROW}:$${COL.echeance}$${LAST_DATA_ROW}<TODAY()))`
  );
}

function overdueAmountFormula(): string {
  const paid = escapeFormulaText(FACTURE_STAGE_LABELS.paid);
  return (
    `SUMPRODUCT((${SHEET_DATA}!$${COL.facture}$${DATA_START_ROW}:$${COL.facture}$${LAST_DATA_ROW}<>"")` +
    `*(${SHEET_DATA}!$${COL.statut}$${DATA_START_ROW}:$${COL.statut}$${LAST_DATA_ROW}<>"${paid}")` +
    `*(${SHEET_DATA}!$${COL.echeance}$${DATA_START_ROW}:$${COL.echeance}$${LAST_DATA_ROW}<>"")` +
    `*(${SHEET_DATA}!$${COL.echeance}$${DATA_START_ROW}:$${COL.echeance}$${LAST_DATA_ROW}<TODAY())` +
    `*(${SHEET_DATA}!$${COL.montant}$${DATA_START_ROW}:$${COL.montant}$${LAST_DATA_ROW}))`
  );
}

function repairDashboardFormulas(sheet: PopulateSheet): void {
  const paid = escapeFormulaText(FACTURE_STAGE_LABELS.paid);
  const unpaid = escapeFormulaText(FACTURE_STAGE_LABELS.unpaid);
  const statutRange = `${SHEET_DATA}!$${COL.statut}$${DATA_START_ROW}:$${COL.statut}$${LAST_DATA_ROW}`;
  const montantRange = `${SHEET_DATA}!$${COL.montant}$${DATA_START_ROW}:$${COL.montant}$${LAST_DATA_ROW}`;
  const factureRange = `${SHEET_DATA}!$${COL.facture}$${DATA_START_ROW}:$${COL.facture}$${LAST_DATA_ROW}`;

  sheet.cell('B6').formula(`COUNTA(${factureRange})`);
  sheet.cell('C6').formula(`SUM(${montantRange})`);
  sheet.cell('B7').formula(`COUNTIF(${statutRange},"${unpaid}")`);
  sheet.cell('C7').formula(`SUMIF(${statutRange},"${unpaid}",${montantRange})`);
  sheet.cell('B8').formula(overdueCountFormula());
  sheet.cell('C8').formula(overdueAmountFormula());
  sheet.cell('B9').formula(`COUNTIF(${statutRange},"${paid}")`);
  sheet.cell('C9').formula(`SUMIF(${statutRange},"${paid}",${montantRange})`);

  sheet.cell('E6').value(unpaid);
  sheet.cell('F6').formula(`COUNTIF(${statutRange},"${unpaid}")`);
  sheet.cell('G6').formula('IFERROR(F6/$B$6,0)');
  sheet.cell('H6').formula(`SUMIF(${statutRange},"${unpaid}",${montantRange})`);

  sheet.cell('E7').value(paid);
  sheet.cell('F7').formula(`COUNTIF(${statutRange},"${paid}")`);
  sheet.cell('G7').formula('IFERROR(F7/$B$6,0)');
  sheet.cell('H7').formula(`SUMIF(${statutRange},"${paid}",${montantRange})`);

  for (const addr of ['E8', 'F8', 'G8', 'H8', 'E9', 'F9', 'G9', 'H9', 'E10', 'F10', 'G10', 'H10']) {
    sheet.cell(addr).value(null);
  }
}

function writeFacturesFormulas(
  sheet: PopulateSheet,
  fromRow = DATA_START_ROW,
  count = FACTURES_EXPORT_MAX_ROWS,
): void {
  const rows = Math.min(count, FACTURES_EXPORT_MAX_ROWS);
  for (let i = 0; i < rows; i += 1) {
    const row = fromRow + i;
    const f = factureRowFormulas(row);
    sheet.cell(`${COL.statut}${row}`).formula(f.statut);
    sheet.cell(`${COL.commentaire}${row}`).formula(f.commentaire);
  }
}

function ensureFacturesHeaders(sheet: PopulateSheet): void {
  const title = String(sheet.cell(`A${TITLE_ROW}`).value() ?? '');
  if (!title.includes('Suivi des factures')) {
    sheet.range(`A${TITLE_ROW}:O${TITLE_ROW}`).merged(true);
    sheet.cell(`A${TITLE_ROW}`).value('Suivi des factures fournisseurs');
  }
  DATA_HEADERS.forEach((label, i) => sheet.cell(HEADER_ROW, i + 1).value(label));
}

async function createWorkbookFromScratch(): Promise<PopulateWorkbook> {
  const workbook = await XlsxPopulate.fromBlankAsync();
  const data = workbook.sheet(0);
  data.name(SHEET_DATA);

  data.range(`A${TITLE_ROW}:O${TITLE_ROW}`).merged(true);
  data.cell(`A${TITLE_ROW}`).value('Suivi des factures fournisseurs');
  data.range(`A${TITLE_ROW}:O${TITLE_ROW}`).style({
    bold: true,
    fontSize: 16,
    fontColor: 'FFFFFF',
    fill: '0F172A',
    verticalAlignment: 'center',
  });
  data.row(TITLE_ROW).height(32);

  DATA_HEADERS.forEach((label, i) => data.cell(HEADER_ROW, i + 1).value(label));
  data.range(`A${HEADER_ROW}:O${HEADER_ROW}`).style({
    bold: true,
    fontColor: 'FFFFFF',
    fill: '1E3A5F',
    horizontalAlignment: 'center',
    border: true,
  });
  writeFacturesFormulas(data);

  const widths = [12, 22, 14, 12, 12, 12, 12, 12, 12, 12, 12, 14, 12, 18, 48];
  widths.forEach((w, i) => data.column(i + 1).width(w));
  data.freezePanes(0, HEADER_ROW);

  const dash = workbook.addSheet(SHEET_DASH, 0);
  dash.cell('A1').value('Dashboard — Suivi des factures fournisseurs');
  dash.cell('A4').value('KPI');
  dash.cell('E4').value('PIPELINE');
  dash.cell('A5').value('Indicateur');
  dash.cell('B5').value('Nb');
  dash.cell('C5').value('Montant ($)');
  dash.cell('E5').value('Étape');
  dash.cell('F5').value('Nb factures');
  dash.cell('G5').value('% factures');
  dash.cell('H5').value('Montant ($)');
  dash.cell('A6').value('TOTAL FACTURES');
  dash.cell('A7').value('MONTANT DÛ');
  dash.cell('A8').value('EN RETARD (ÉCHÉANCE)');
  dash.cell('A9').value('POSTED AND UNPAID');
  repairDashboardFormulas(dash);

  const guide = workbook.addSheet(SHEET_HELP);
  writeGuideSheet(guide);

  workbook.activeSheet(SHEET_DASH);
  return workbook;
}

function writeGuideSheet(sheet: PopulateSheet): void {
  sheet.name(SHEET_HELP);
  sheet.cell('A1').value('Guide — gestion Excel du suivi factures');
  sheet.cell('A1').style({ bold: true, fontSize: 13, fill: '0F172A', fontColor: 'FFFFFF' });
  sheet.range('A1:B1').merged(true);

  const lines: Array<[string, string]> = [
    ['Pipeline', 'Facture reçue → unpaid (PR/PO) → Posted and unpaid (GRN) → paid (payment)'],
    ['Règle PR', '1 PR peut regrouper plusieurs factures'],
    ['Règle PO', '1 PO peut regrouper plusieurs PR'],
    ['Règle GRN', '1 GRN est lié à un seul PO'],
    [
      'Saisie',
      'DATE, SOCIETE, FACTURE, MONTANT, ECHEANCE, PR, DATE PR, P.O, DATE PO, GRN, DATE GRN, payment, DATE PYM',
    ],
    ['Calculé', 'STATUT et COMMENTAIRE (ne pas écraser)'],
    ['Statuts', 'unpaid = PR ou PO renseigné ; Posted and unpaid = GRN ; paid = payment'],
  ];
  lines.forEach((pair, i) => {
    sheet.cell(`A${i + 3}`).value(pair[0]).style({ bold: true });
    sheet.cell(`B${i + 3}`).value(pair[1]);
  });
  sheet.column('A').width(22);
  sheet.column('B').width(95);
}

async function loadTemplateOrBlank(): Promise<PopulateWorkbook> {
  if (fs.existsSync(FACTURES_SUIVI_EXPORT_TEMPLATE_PATH)) {
    return XlsxPopulate.fromFileAsync(FACTURES_SUIVI_EXPORT_TEMPLATE_PATH);
  }
  return createWorkbookFromScratch();
}

function clearInputCells(sheet: PopulateSheet, fromRow: number, toRow: number): void {
  const inputCols = [
    COL.date,
    COL.societe,
    COL.facture,
    COL.montant,
    COL.echeance,
    COL.pr,
    COL.datePr,
    COL.po,
    COL.datePo,
    COL.grn,
    COL.dateGrn,
    COL.payment,
    COL.datePym,
  ];
  for (let row = fromRow; row <= toRow; row += 1) {
    for (const col of inputCols) {
      sheet.cell(`${col}${row}`).value(null);
    }
  }
}

function writeDateCell(sheet: PopulateSheet, address: string, value: string): void {
  const parsed = parseDisplayDate(value);
  if (parsed) {
    sheet.cell(address).value(parsed);
    sheet.cell(address).style('numberFormat', DATE_FMT);
    return;
  }
  sheet.cell(address).value(value || null);
}

function fillFactureData(sheet: PopulateSheet, factures: FactureSuivi[]): void {
  ensureFacturesHeaders(sheet);

  const needed = Math.max(factures.length + 20, 50);
  const formulaRows = Math.min(needed, FACTURES_EXPORT_MAX_ROWS);

  writeFacturesFormulas(sheet, DATA_START_ROW, formulaRows);
  clearInputCells(sheet, DATA_START_ROW, DATA_START_ROW + formulaRows - 1);

  factures.forEach((f, index) => {
    const row = DATA_START_ROW + index;
    writeDateCell(sheet, `${COL.date}${row}`, f.date);
    sheet.cell(`${COL.societe}${row}`).value(f.societe || null);
    sheet.cell(`${COL.facture}${row}`).value(f.facture || null);
    sheet.cell(`${COL.montant}${row}`).value(f.montant ?? null);
    if (f.montant != null) sheet.cell(`${COL.montant}${row}`).style('numberFormat', '#,##0.00');
    writeDateCell(sheet, `${COL.echeance}${row}`, f.echeance);
    sheet.cell(`${COL.pr}${row}`).value(f.pr || null);
    writeDateCell(sheet, `${COL.datePr}${row}`, f.datePr);
    sheet.cell(`${COL.po}${row}`).value(f.po || null);
    writeDateCell(sheet, `${COL.datePo}${row}`, f.datePo);
    sheet.cell(`${COL.grn}${row}`).value(f.grn || null);
    writeDateCell(sheet, `${COL.dateGrn}${row}`, f.dateGrn);
    sheet.cell(`${COL.payment}${row}`).value(normalizePaymentValue(f.payment) || null);
    writeDateCell(sheet, `${COL.datePym}${row}`, f.datePym);
  });

  if (factures.length > 0) {
    const last = DATA_START_ROW + factures.length - 1;
    sheet.range(`A${DATA_START_ROW}:O${last}`).style({
      border: true,
      verticalAlignment: 'center',
    });
  }
}

function refreshDashboardTimestamp(sheet: PopulateSheet): void {
  try {
    const stamp = new Date().toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    if (sheet.cell('H2').value() != null || String(sheet.cell('A2').value() ?? '').includes('énér')) {
      sheet.cell('H2').value(stamp);
    } else {
      sheet.cell('B2').value(stamp);
    }
  } catch {
    // ignore
  }
}

export async function buildFacturesSuiviWorkbookBuffer(factures: FactureSuivi[]): Promise<Buffer> {
  const workbook = await loadTemplateOrBlank();

  let dataSheet = workbook.sheet(SHEET_DATA);
  if (!dataSheet) {
    dataSheet = workbook.addSheet(SHEET_DATA);
  }

  let dashSheet = workbook.sheet(SHEET_DASH);
  if (dashSheet) {
    refreshDashboardTimestamp(dashSheet);
    repairDashboardFormulas(dashSheet);
  }

  if (!workbook.sheet(SHEET_HELP)) {
    writeGuideSheet(workbook.addSheet(SHEET_HELP));
  }

  fillFactureData(dataSheet, factures);

  try {
    workbook.activeSheet(SHEET_DASH);
  } catch {
    // ignore
  }

  return workbook.outputAsync() as Promise<Buffer>;
}

export async function patchFacturesSuiviExportTemplate(): Promise<void> {
  if (!fs.existsSync(FACTURES_SUIVI_EXPORT_TEMPLATE_PATH)) {
    const wb = await createWorkbookFromScratch();
    await wb.toFileAsync(FACTURES_SUIVI_EXPORT_TEMPLATE_PATH);
    return;
  }

  const workbook = await XlsxPopulate.fromFileAsync(FACTURES_SUIVI_EXPORT_TEMPLATE_PATH);
  const factures = workbook.sheet(SHEET_DATA);
  if (factures) {
    ensureFacturesHeaders(factures);
    writeFacturesFormulas(factures);
  }
  const dash = workbook.sheet(SHEET_DASH);
  if (dash) {
    repairDashboardFormulas(dash);
  }
  const guide = workbook.sheet(SHEET_HELP);
  if (guide) {
    writeGuideSheet(guide);
  }
  await workbook.toFileAsync(FACTURES_SUIVI_EXPORT_TEMPLATE_PATH);
}

export async function buildFacturesSuiviExportTemplateBuffer(): Promise<Buffer> {
  const workbook = await createWorkbookFromScratch();
  return workbook.outputAsync() as Promise<Buffer>;
}
