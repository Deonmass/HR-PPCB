import 'server-only';

import fs from 'fs';
import path from 'path';

const EXCEL_DIR = path.join(process.cwd(), 'Excel');
const EXPORT_TEMPLATES_DIR = path.join(EXCEL_DIR, 'export-templates');

export function getExportTemplatesDirectory(): string {
  return process.env.EXPORT_TEMPLATES_DIR?.trim()
    ? path.resolve(process.env.EXPORT_TEMPLATES_DIR.trim())
    : EXPORT_TEMPLATES_DIR;
}

export const EXPORT_TEMPLATE_FILES = {
  checkDocuments: 'CHECK_DOCUMENTS_EXPORT_TEMPLATE.xlsx',
  employeesHr: 'EMPLOYEES_HR_EXPORT_TEMPLATE.xlsx',
  dependants: 'DEPENDANTS_EXPORT_TEMPLATE.xlsx',
  village: 'VILLAGE_EXPORT_TEMPLATE.xlsx',
  serviceAttestation: 'Attestation de service .docx',
  facturesSuivi: 'FACTURES_SUIVI_EXPORT_TEMPLATE.xlsx',
} as const;

/**
 * Résout un template d'export :
 * 1. override env (chemin absolu/relatif)
 * 2. Excel/export-templates/<file>
 * 3. fallback legacy Excel/<file> (compat)
 */
export function resolveExportTemplate(fileName: string, envOverride?: string): string {
  if (envOverride?.trim()) return path.resolve(envOverride.trim());

  const preferred = path.join(getExportTemplatesDirectory(), fileName);
  if (fs.existsSync(preferred)) return preferred;

  const legacy = path.join(EXCEL_DIR, fileName);
  if (fs.existsSync(legacy)) return legacy;

  return preferred;
}

export const CHECK_DOCUMENTS_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.checkDocuments,
  process.env.CHECK_DOCUMENTS_EXPORT_TEMPLATE_XLSX,
);

export const EMPLOYEES_HR_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.employeesHr,
  process.env.EMPLOYEES_HR_EXPORT_TEMPLATE_XLSX,
);

export const DEPENDANTS_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.dependants,
  process.env.DEPENDANTS_EXPORT_TEMPLATE_XLSX,
);

export const VILLAGE_EXPORT_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.village,
  process.env.VILLAGE_EXPORT_TEMPLATE_XLSX,
);

export { OVERTIMES_TIMESHEET_TEMPLATE_PATH as TIMESHEET_TEMPLATE_PATH } from './excel-overtimes-paths';

export const SERVICE_ATTESTATION_TEMPLATE_PATH = resolveExportTemplate(
  EXPORT_TEMPLATE_FILES.serviceAttestation,
  process.env.SERVICE_ATTESTATION_TEMPLATE_DOCX,
);

/** Prefer Excel/factures-fournisseurs/; falls back to export-templates / Excel root. */
export { FACTURES_SUIVI_EXPORT_TEMPLATE_PATH } from '@/lib/factures-fournisseurs/paths';
