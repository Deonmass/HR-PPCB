import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { buildModernExcoContentPptx } from './exco-pptx-modern';

const TEMPLATE_REL = path.join('templates', 'exco', 'hr-report-template.pptx');

export function buildExcoPptxFilename(year: number, month: number): string {
  const label = formatExcoPeriodLabel(year, month).replace(/\s+/g, '_');
  return `EXCO_HR_REPORT_${label}.pptx`;
}

export async function resolveExcoTemplatePath(): Promise<string> {
  const primary = path.join(process.cwd(), TEMPLATE_REL);
  try {
    await fs.access(primary);
    return primary;
  } catch {
    throw new Error(
      `Template PowerPoint introuvable (${TEMPLATE_REL}). Placez hr-report-template.pptx dans templates/exco/.`,
    );
  }
}

/**
 * Export EXCO — fichier généré uniquement via pptxgenjs (OOXML valide).
 * Pas de fusion/greffe XML avec le template (cause des « Repair » PowerPoint).
 */
export async function buildExcoPptxBuffer(report: ExcoReportPayload): Promise<Buffer> {
  return buildModernExcoContentPptx(report);
}
