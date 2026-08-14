import 'server-only';

import fs from 'fs';
import path from 'path';
import XlsxPopulate from 'xlsx-populate';
import { enrichAuditAction } from './audit-hr-compute';
import type { AuditHrAction } from './audit-hr-types';
import { AUDIT_HR_EXPORT_TEMPLATE_PATH } from './excel-export-template-paths';

const ACTIONS_SHEET = 'Actions';
const DASHBOARD_SHEET = 'Dashboard';
const REF_SHEET = '_Ref';
const FIRST_DATA_ROW = 2;
const MAX_CLEAR_ROWS = 500;

/** Colonnes saisie (formules F/G/K/L/M laissées au template). */
const COL = {
  owner: 1,
  action: 2,
  issueCreationDate: 3,
  dueDate: 4,
  closingDate: 5,
  confirmationAudit: 8,
  commentaire: 9,
  severity: 10,
} as const;

function parseIso(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value || '')) return null;
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function excelDate(value: string): Date | null {
  return parseIso(value);
}

function clearCell(
  sheet: { cell(row: number, col: number): { value(v?: unknown): unknown } },
  row: number,
  col: number,
): void {
  sheet.cell(row, col).value(null);
}

function resolveTemplatePath(): string {
  const candidates = [
    AUDIT_HR_EXPORT_TEMPLATE_PATH,
    path.join(process.cwd(), 'templates', 'audit', 'Audit_HR_template.xlsm'),
    path.join(process.cwd(), 'Excel', 'templates', 'audit', 'Audit_HR_template.xlsm'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `Template Audit introuvable. Placez Audit_HR_template.xlsm dans Excel/templates/audit/.`,
  );
}

export async function buildAuditHrExportBuffer(
  actions: AuditHrAction[],
  asOfIso: string,
): Promise<Buffer> {
  const templatePath = resolveTemplatePath();
  const workbook = await XlsxPopulate.fromFileAsync(templatePath);
  const sheet = workbook.sheet(ACTIONS_SHEET);
  if (!sheet) throw new Error('Feuille Actions introuvable dans le template');

  const asOf = parseIso(asOfIso) || new Date();
  const sorted = [...actions].sort((a, b) => {
    const o = a.owner.localeCompare(b.owner, 'fr');
    if (o !== 0) return o;
    return a.action.localeCompare(b.action, 'fr');
  });

  for (let row = FIRST_DATA_ROW; row < FIRST_DATA_ROW + MAX_CLEAR_ROWS; row += 1) {
    const actionVal = sheet.cell(row, COL.action).value();
    const ownerVal = sheet.cell(row, COL.owner).value();
    if (
      (actionVal == null || String(actionVal).trim() === '') &&
      (ownerVal == null || String(ownerVal).trim() === '') &&
      row > FIRST_DATA_ROW + 5
    ) {
      break;
    }
    for (let col = 1; col <= 13; col += 1) {
      clearCell(sheet, row, col);
    }
  }

  for (let i = 0; i < sorted.length; i += 1) {
    const row = FIRST_DATA_ROW + i;
    const a = sorted[i];
    sheet.cell(row, COL.owner).value(a.owner || null);
    sheet.cell(row, COL.action).value(a.action || null);
    const issue = excelDate(a.issueCreationDate);
    const due = excelDate(a.dueDate);
    const closing = excelDate(a.closingDate);
    if (issue) sheet.cell(row, COL.issueCreationDate).value(issue);
    else clearCell(sheet, row, COL.issueCreationDate);
    if (due) sheet.cell(row, COL.dueDate).value(due);
    else clearCell(sheet, row, COL.dueDate);
    if (closing) sheet.cell(row, COL.closingDate).value(closing);
    else clearCell(sheet, row, COL.closingDate);
    sheet.cell(row, COL.confirmationAudit).value(a.confirmationAudit || 'Non');
    sheet.cell(row, COL.commentaire).value(a.commentaire || null);
    sheet.cell(row, COL.severity).value(a.severity || null);

    const view = enrichAuditAction(a, asOf);
    sheet.cell(row, 6).value(view.daysOverdue);
    sheet.cell(row, 7).value(view.status);
    sheet.cell(row, 11).value(view.annee);
    sheet.cell(row, 12).value(view.moisCloture || null);
    sheet.cell(row, 13).value(view.filtreMois);
  }

  const ref = workbook.sheet(REF_SHEET);
  if (ref) {
    ref.cell('E2').value(asOf);
  }

  const dash = workbook.sheet(DASHBOARD_SHEET);
  if (dash) {
    const owners = [...new Set(sorted.map((a) => a.owner.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'fr'),
    );
    for (let i = 0; i < 30; i += 1) {
      const row = 12 + i;
      if (i < owners.length) {
        dash.cell(row, 6).value(owners[i]);
      } else {
        const existing = dash.cell(row, 6).value();
        if (existing == null || String(existing).trim() === '') break;
        clearCell(dash, row, 6);
        for (let c = 7; c <= 13; c += 1) {
          clearCell(dash, row, c);
        }
      }
    }
  }

  const out = await workbook.outputAsync();
  return Buffer.from(out);
}

export function buildAuditHrExportFilename(asOfIso: string): string {
  const stamp = (asOfIso || '').slice(0, 10) || 'export';
  return `Audit_HR_${stamp}.xlsm`;
}
