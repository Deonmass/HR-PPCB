import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { loadExcoPptxExtracted } from './exco-pptx-baseline';
import { resolveCahierHighlights, resolveCsrFy27Rows, stripCsrUpdateMarkup } from './exco-csr-fy27';
import { resolveRecruitment } from './exco-recruitment-fy27';
import { buildInternalAuditRows, summarizeInternalAudit } from './exco-audit-internal';
import { buildGouvernanceSlideData } from './exco-dashboard-slides-data';

const TEMPLATE_REL = path.join(
  'templates',
  'exco',
  'Updated EXCO_HR_REPORT_Jul-26.pptx',
);

export async function resolveExcoPptxTemplatePath(): Promise<string> {
  const primary = path.join(process.cwd(), TEMPLATE_REL);
  try {
    await fs.access(primary);
    return primary;
  } catch {
    throw new Error(
      `Template PowerPoint introuvable (${TEMPLATE_REL}). Placez Updated EXCO_HR_REPORT_Jul-26.pptx dans templates/exco/.`,
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function meetingDateLabel(raw: string | undefined): string {
  const value = (raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
  }
  return value || '—';
}

function buildCoverLine(report: ExcoReportPayload): string {
  const n = report.overlays.narrative || {};
  const title = (n.meetingTitle?.trim() || 'EXCO MEETING').toUpperCase();
  const date = meetingDateLabel(n.meetingDate).toUpperCase();
  const place = (n.meetingPlace?.trim() || 'KINSHASA').toUpperCase();
  return `${title} HELD ON ${date}, IN ${place}`;
}

/** Remplace le contenu exact d’un run `<a:t>…</a:t>`. */
function replaceTextRun(xml: string, from: string, to: string): string {
  if (!from || from === to) return xml;
  const candidates = [
    `<a:t>${escapeXml(from)}</a:t>`,
    `<a:t>${from}</a:t>`,
  ];
  const next = `<a:t>${escapeXml(to)}</a:t>`;
  let out = xml;
  for (const needle of candidates) {
    if (out.includes(needle)) out = out.split(needle).join(next);
  }
  return out;
}

function replaceAllRuns(xml: string, pairs: Array<[string, string]>): string {
  let out = xml;
  for (const [from, to] of pairs) {
    out = replaceTextRun(out, from, to);
  }
  return out;
}

async function buildReplacementPairs(
  report: ExcoReportPayload,
): Promise<Array<[string, string]>> {
  const period = formatExcoPeriodLabel(report.year, report.month);
  const pairs: Array<[string, string]> = [];
  const thankMsg =
    (report.overlays.narrative?.thankYouMessage || 'Thank You').trim() || 'Thank You';

  try {
    const extracted = await loadExcoPptxExtracted();
    if (!extracted) throw new Error('pptx extract missing');
    const baselinePeriod = extracted.periodLabel || 'Jul-26';
    pairs.push([baselinePeriod, period]);
    pairs.push(['Jul-26', period]);

    if (extracted.coverTitle?.trim()) {
      const cover = buildCoverLine(report);
      pairs.push([extracted.coverTitle.trim(), cover]);
      pairs.push([`${extracted.coverTitle.trim()} `, cover]);
    }

    const c = report.computed;
    if (c.headcount != null) {
      pairs.push(['175 employees', `${c.headcount} employees`]);
    }

    const auditRows = buildInternalAuditRows(report);
    const sum = summarizeInternalAudit(auditRows);
    const gov = buildGouvernanceSlideData(report);
    pairs.push([
      'Closed 12/23 (52%)  ·  +7 since last EXCO  ·  Overdue 7  ·  On going 1',
      `Closed ${sum.closed}/${sum.total} (${gov.auditClosedPct || sum.closedPct}%)  ·  Overdue ${sum.overdue}  ·  On going ${sum.ongoing}`,
    ]);

    const csrNow = resolveCsrFy27Rows(report.overlays);
    for (let i = 0; i < (extracted.csrFy27Rows || []).length; i += 1) {
      const old = extracted.csrFy27Rows[i];
      const neu = csrNow[i];
      if (!old || !neu) continue;
      if (old.name && neu.name && old.name !== neu.name) pairs.push([old.name, neu.name]);
      for (const f of ['objective', 'progress', 'risks', 'nextSteps'] as const) {
        const a = stripCsrUpdateMarkup(String(old[f] || '')).trim();
        const b = stripCsrUpdateMarkup(String(neu[f] || '')).trim();
        if (a && b && a !== b && a.length < 200 && !a.includes('\n')) {
          pairs.push([a, b]);
        }
      }
    }

    const cahierNow = resolveCahierHighlights(report.overlays);
    for (let i = 0; i < (extracted.cahierHighlights || []).length; i += 1) {
      const old = extracted.cahierHighlights[i];
      const neu = cahierNow[i];
      if (!old || !neu) continue;
      if (old.title?.trim() && neu.title?.trim() && old.title !== neu.title) {
        pairs.push([old.title.trim(), neu.title.trim()]);
      }
    }

    const recNow = resolveRecruitment(report.overlays);
    const oldRec = [
      ...(extracted.recruitment?.replacements || []),
      ...(extracted.recruitment?.newPositions || []),
    ];
    for (let i = 0; i < oldRec.length; i += 1) {
      const old = oldRec[i];
      const neu = recNow[i];
      if (!old || !neu) continue;
      if (old.position && neu.position && old.position !== neu.position) {
        pairs.push([old.position, neu.position]);
      }
      const a = stripCsrUpdateMarkup(old.status || '');
      const b = stripCsrUpdateMarkup(neu.status || '');
      if (a && b && a !== b && a.length < 120) pairs.push([a, b]);
    }

    if (thankMsg !== 'Thank You') {
      pairs.push(['Thank You', thankMsg]);
    }
  } catch {
    pairs.push(['Jul-26', period]);
    pairs.push(['EXCO MEETING HELD ON 31 JULY 2026', buildCoverLine(report)]);
    pairs.push(['EXCO MEETING HELD ON 31 JULY 2026 ', buildCoverLine(report)]);
    if (thankMsg !== 'Thank You') pairs.push(['Thank You', thankMsg]);
  }

  const uniq = new Map<string, string>();
  for (const [from, to] of pairs) {
    if (!from || !to || from === to) continue;
    if (!uniq.has(from)) uniq.set(from, to);
  }
  return [...uniq.entries()].sort((a, b) => b[0].length - a[0].length);
}

/**
 * Peuple `Updated EXCO_HR_REPORT_Jul-26.pptx` (période, cover, textes CSR/Cahier/recrutement/audit).
 * Conserve charts et layout — pas de reconstruction XML.
 */
export async function buildExcoPptxFromTemplate(report: ExcoReportPayload): Promise<Buffer> {
  const templatePath = await resolveExcoPptxTemplatePath();
  const raw = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(raw);
  const pairs = await buildReplacementPairs(report);
  const period = formatExcoPeriodLabel(report.year, report.month);

  const targets = Object.keys(zip.files).filter(
    (n) =>
      /ppt\/slides\/slide\d+\.xml$/.test(n)
      || /ppt\/notesSlides\/notesSlide\d+\.xml$/.test(n),
  );

  for (const name of targets) {
    const file = zip.file(name);
    if (!file) continue;
    let xml = await file.async('string');
    xml = replaceAllRuns(xml, pairs);
    xml = xml.replace(/>Jul-26</g, `>${escapeXml(period)}<`);
    zip.file(name, xml);
  }

  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return Buffer.from(out);
}
