import 'server-only';

import fs from 'fs';
import path from 'path';

const EXCEL_DIR = path.join(process.cwd(), 'Excel');
const FACTURES_TEMPLATES_DIR = path.join(EXCEL_DIR, 'templates', 'factures');

/** Optional seed path only — live workbook deleted. */
export function getFacturesFournisseursDirectory(): string {
  if (process.env.FACTURES_FOURNISSEURS_DIR?.trim()) {
    return path.resolve(process.env.FACTURES_FOURNISSEURS_DIR.trim());
  }
  return path.join(EXCEL_DIR, 'factures-fournisseurs');
}

export function resolveFacturesFournisseursWorkbookPath(): string {
  if (process.env.FACTURES_FOURNISSEURS_XLSX?.trim()) {
    return path.resolve(process.env.FACTURES_FOURNISSEURS_XLSX.trim());
  }
  return path.join(getFacturesFournisseursDirectory(), 'FACTURES_FOURNISSEURS.xlsx');
}

export const FACTURES_FOURNISSEURS_XLSX_PATH = resolveFacturesFournisseursWorkbookPath();

export const FACTURES_SUIVI_EXPORT_TEMPLATE_FILE = 'FACTURES_SUIVI_EXPORT_TEMPLATE.xlsx';

export function resolveFacturesSuiviExportTemplatePath(): string {
  if (process.env.FACTURES_SUIVI_EXPORT_TEMPLATE_XLSX?.trim()) {
    return path.resolve(process.env.FACTURES_SUIVI_EXPORT_TEMPLATE_XLSX.trim());
  }
  return path.join(FACTURES_TEMPLATES_DIR, FACTURES_SUIVI_EXPORT_TEMPLATE_FILE);
}

export const FACTURES_SUIVI_EXPORT_TEMPLATE_PATH = resolveFacturesSuiviExportTemplatePath();

export function facturesFournisseursWorkbookExists(): boolean {
  return fs.existsSync(FACTURES_FOURNISSEURS_XLSX_PATH);
}
