import 'server-only';

import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { buildModernExcoContentPptx } from './exco-pptx-modern';

export function buildExcoPptxFilename(year: number, month: number): string {
  const label = formatExcoPeriodLabel(year, month).replace(/\s+/g, '_');
  return `EXCO_HR_REPORT_${label}.pptx`;
}

/**
 * Export PowerPoint — slides générés depuis le rapport du mois
 * (`report.kpiSummary`, IN/OUT, trends, narrative, etc.).
 * Ne réutilise pas le template Jul-26 figé (sinon Hires/Exits/KPI restaient sur juillet).
 */
export async function buildExcoPptxBuffer(report: ExcoReportPayload): Promise<Buffer> {
  return buildModernExcoContentPptx(report);
}
