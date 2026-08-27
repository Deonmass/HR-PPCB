import 'server-only';

import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { buildExcoPptxFromTemplate } from './exco-pptx-template-fill';

export function buildExcoPptxFilename(year: number, month: number): string {
  const label = formatExcoPeriodLabel(year, month).replace(/\s+/g, '_');
  return `EXCO_HR_REPORT_${label}.pptx`;
}

/**
 * Export PowerPoint — peuplement du template
 * `templates/exco/Updated EXCO_HR_REPORT_Jul-26.pptx`.
 */
export async function buildExcoPptxBuffer(report: ExcoReportPayload): Promise<Buffer> {
  return buildExcoPptxFromTemplate(report);
}
