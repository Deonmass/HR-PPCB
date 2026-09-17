import 'server-only';

import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { buildExcoPptxFromTemplate } from './exco-pptx-template-fill';
import { buildModernExcoContentPptx } from './exco-pptx-modern';

export function buildExcoPptxFilename(year: number, month: number): string {
  const label = formatExcoPeriodLabel(year, month).replace(/\s+/g, '_');
  return `EXCO_HR_REPORT_${label}.pptx`;
}

/**
 * Export PowerPoint — disposition = template Aug-26 ;
 * données = rapport du mois sélectionné (`report.year` / `report.month`).
 * Fallback moderne si le template est absent ou le fill échoue.
 */
export async function buildExcoPptxBuffer(report: ExcoReportPayload): Promise<Buffer> {
  try {
    return await buildExcoPptxFromTemplate(report);
  } catch (err) {
    console.warn('[exco-pptx] template fill failed, falling back to modern builder:', err);
    return buildModernExcoContentPptx(report);
  }
}
