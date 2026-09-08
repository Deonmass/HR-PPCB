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
  resolveCsrHighlights,
  stripCsrUpdateMarkup,
} from './exco-csr-fy27';
import { resolveRecruitment } from './exco-recruitment-fy27';
import {
  buildInternalAuditRows,
  summarizeInternalAudit,
  type InternalAuditRow,
} from './exco-audit-internal';
import type { ExcoCahierHighlight, ExcoRecruitmentRow } from './exco-types';

export type ExcoSlidesPayload = {
  periodLabel: string;
  year: number;
  month: number;
  csr: {
    summary: ExcoCsrSlideData;
    highlights: ExcoCahierHighlight[];
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
  const csrHighlights = resolveCsrHighlights(report.overlays).map((row) => ({
    ...row,
    title: stripCsrUpdateMarkup(row.title),
    body: stripCsrUpdateMarkup(row.body),
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
      highlights: csrHighlights,
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
