import 'server-only';

import type { ExcoReportPayload } from './exco-types';
import {
  buildCsrSlideData,
  buildGouvernanceSlideData,
  type ExcoCsrSlideData,
  type ExcoGouvernanceSlideData,
} from './exco-dashboard-slides-data';
import {
  resolveCahierHighlights,
  resolveCsrFy27Rows,
  stripCsrUpdateMarkup,
} from './exco-csr-fy27';
import { resolveRecruitment } from './exco-recruitment-fy27';
import {
  buildInternalAuditRows,
  summarizeInternalAudit,
  type InternalAuditRow,
} from './exco-audit-internal';
import type { ExcoCahierHighlight, ExcoCsrFy27Row, ExcoRecruitmentRow } from './exco-types';

export type ExcoSlidesPayload = {
  periodLabel: string;
  year: number;
  month: number;
  csr: {
    summary: ExcoCsrSlideData;
    fy27Rows: ExcoCsrFy27Row[];
  };
  cahier: {
    highlights: ExcoCahierHighlight[];
  };
  recruitment: {
    replacements: ExcoRecruitmentRow[];
    newPositions: ExcoRecruitmentRow[];
  };
  audit: {
    rows: InternalAuditRow[];
    summary: ReturnType<typeof summarizeInternalAudit>;
  };
  gouvernance: ExcoGouvernanceSlideData;
  thankYou: {
    title: string;
    subtitle: string;
    periodLabel: string;
  };
};

export function buildExcoSlidesPayload(report: ExcoReportPayload): ExcoSlidesPayload {
  const fy27Rows = resolveCsrFy27Rows(report.overlays).map((row) => ({
    ...row,
    objective: stripCsrUpdateMarkup(row.objective),
    progress: stripCsrUpdateMarkup(row.progress),
    risks: stripCsrUpdateMarkup(row.risks),
    nextSteps: stripCsrUpdateMarkup(row.nextSteps),
  }));
  const recruitment = resolveRecruitment(report.overlays).map((row) => ({
    ...row,
    status: stripCsrUpdateMarkup(row.status),
    comments: stripCsrUpdateMarkup(row.comments),
  }));
  const auditRows = buildInternalAuditRows(report);

  return {
    periodLabel: report.periodLabel,
    year: report.year,
    month: report.month,
    csr: {
      summary: buildCsrSlideData(report),
      fy27Rows,
    },
    cahier: {
      highlights: resolveCahierHighlights(report.overlays),
    },
    recruitment: {
      replacements: recruitment.filter((r) => r.category === 'replacement'),
      newPositions: recruitment.filter((r) => r.category === 'new'),
    },
    audit: {
      rows: auditRows,
      summary: summarizeInternalAudit(auditRows),
    },
    gouvernance: buildGouvernanceSlideData(report),
    thankYou: {
      title: report.overlays.narrative?.thankYouTitle?.trim() || 'Et merci',
      subtitle: report.overlays.narrative?.thankYouMessage?.trim() || 'Thank You',
      periodLabel: report.periodLabel,
    },
  };
}
