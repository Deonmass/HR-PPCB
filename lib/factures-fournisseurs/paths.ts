import 'server-only';

import fs from 'fs';
import path from 'path';

const EXCEL_DIR = path.join(process.cwd(), 'Excel');
const MODULE_DIR = path.join(EXCEL_DIR, 'factures-fournisseurs');

export function getFacturesFournisseursDirectory(): string {
  if (process.env.FACTURES_FOURNISSEURS_DIR?.trim()) {
    return path.resolve(process.env.FACTURES_FOURNISSEURS_DIR.trim());
  }
  return MODULE_DIR;
}

/**
 * Live workbook (Factures + Fournisseurs sheets).
 * Prefers Excel/factures-fournisseurs/, falls back to Excel/ root (legacy).
 */
export function resolveFacturesFournisseursWorkbookPath(): string {
  if (process.env.FACTURES_FOURNISSEURS_XLSX?.trim()) {
    return path.resolve(process.env.FACTURES_FOURNISSEURS_XLSX.trim());
  }

  const preferred = path.join(getFacturesFournisseursDirectory(), 'FACTURES_FOURNISSEURS.xlsx');
  if (fs.existsSync(preferred)) return preferred;

  const legacy = path.join(EXCEL_DIR, 'FACTURES_FOURNISSEURS.xlsx');
  if (fs.existsSync(legacy)) return legacy;

  return preferred;
}

export const FACTURES_FOURNISSEURS_XLSX_PATH = resolveFacturesFournisseursWorkbookPath();

export const FACTURES_SUIVI_EXPORT_TEMPLATE_FILE = 'FACTURES_SUIVI_EXPORT_TEMPLATE.xlsx';

/**
 * Export template with Dashboard charts + Factures formulas.
 */
export function resolveFacturesSuiviExportTemplatePath(): string {
  if (process.env.FACTURES_SUIVI_EXPORT_TEMPLATE_XLSX?.trim()) {
    return path.resolve(process.env.FACTURES_SUIVI_EXPORT_TEMPLATE_XLSX.trim());
  }

  const preferred = path.join(
    getFacturesFournisseursDirectory(),
    FACTURES_SUIVI_EXPORT_TEMPLATE_FILE,
  );
  if (fs.existsSync(preferred)) return preferred;

  const exportTemplates = path.join(EXCEL_DIR, 'export-templates', FACTURES_SUIVI_EXPORT_TEMPLATE_FILE);
  if (fs.existsSync(exportTemplates)) return exportTemplates;

  return preferred;
}

export const FACTURES_SUIVI_EXPORT_TEMPLATE_PATH = resolveFacturesSuiviExportTemplatePath();
