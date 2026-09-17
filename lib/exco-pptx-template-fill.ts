import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import JSZip from 'jszip';
import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { metricToKpiCard, type ExcoKpiCard } from './exco-kpi-format';
import { EXCO_KPI_SUMMARY_KEYS } from './exco-kpi-layout';
import { buildTrainingSlideData, buildGouvernanceSlideData } from './exco-dashboard-slides-data';
import { buildInternalAuditRows, summarizeInternalAudit } from './exco-audit-internal';
import { fillTemplateDataSlides } from './exco-pptx-template-tables';

/** Template officiel — disposition Aug-26 ; seules les données du mois exporté changent. */
const TEMPLATE_REL = path.join('templates', 'exco', 'EXCO_HR_REPORT_Aug-26.pptx');

const BASELINE_PERIOD = 'Aug-26';
const BASELINE_COVER =
  'EXCO MEETING HELD ON 31 AUGUST 2026 HELD ON AUG-26, IN ZAMBA';

/**
 * Cartes KPI Summary (slide 6) — libellé template → clé rapport.
 * `hasDelta` = le template a une forme dédiée entre valeur et prev.
 */
const KPI_SLIDE_CARDS: Array<{ label: string; key: string; hasDelta: boolean }> = [
  { label: 'Headcount', key: 'headcount', hasDelta: true },
  { label: 'Gender Ratio', key: 'genderRatio', hasDelta: false },
  { label: 'Average Age', key: 'averageAge', hasDelta: true },
  { label: 'Length of Service (years)', key: 'seniority', hasDelta: false },
  { label: 'Onboarding Survey', key: 'onboardingSurvey', hasDelta: true },
  { label: 'Hires', key: 'hires', hasDelta: true },
  { label: 'Exits', key: 'exits', hasDelta: true },
  { label: 'Turnover %', key: 'turnover', hasDelta: true },
  { label: 'Attrition rate %', key: 'attrition', hasDelta: true },
  { label: 'Succession Coverage', key: 'succession', hasDelta: true },
  { label: 'Leave Balance (avg days)', key: 'leaveBalance', hasDelta: true },
  { label: 'Leave COST', key: 'leaveCost', hasDelta: true },
  { label: 'Staff cost', key: 'staffCost', hasDelta: true },
  { label: 'Overtime cost', key: 'overtimeCost', hasDelta: true },
  { label: 'Revenue / emp', key: 'revenuePerEmp', hasDelta: true },
  { label: 'Volume / emp', key: 'volumePerEmp', hasDelta: true },
  { label: 'Training Cost', key: 'trainingCost', hasDelta: true },
  { label: 'Training Hours', key: 'trainingHours', hasDelta: true },
  { label: 'Employee Engagement', key: 'climateSurvey', hasDelta: true },
  { label: 'Competencies Gap Coverage', key: 'competencyGap', hasDelta: true },
];

const DELTA_GREEN = '15803D';
const DELTA_RED = 'B91C1C';
const DELTA_MUTED = '64748B';

export async function resolveExcoPptxTemplatePath(): Promise<string> {
  const full = path.join(process.cwd(), TEMPLATE_REL);
  try {
    await fs.access(full);
    return full;
  } catch {
    throw new Error(
      `Template PowerPoint introuvable (${TEMPLATE_REL}). Placez EXCO_HR_REPORT_Aug-26.pptx dans templates/exco/.`,
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

function meetingDateLabel(raw: string | undefined, year: number, month: number): string {
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
  if (value) return value;
  const end = new Date(year, month, 0);
  return end.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function prevPeriodLabel(year: number, month: number): string {
  if (month <= 1) return formatExcoPeriodLabel(year - 1, 12);
  return formatExcoPeriodLabel(year, month - 1);
}

function buildCoverLine(report: ExcoReportPayload): string {
  const n = report.overlays.narrative || {};
  const title = (n.meetingTitle?.trim() || 'EXCO MEETING').toUpperCase();
  const date = meetingDateLabel(n.meetingDate, report.year, report.month).toUpperCase();
  const place = (n.meetingPlace?.trim() || 'Zamba').toUpperCase();
  return `${title} HELD ON ${date}, IN ${place}`;
}

function replaceTextRun(xml: string, from: string, to: string): string {
  if (!from || from === to) return xml;
  const candidates = [`<a:t>${escapeXml(from)}</a:t>`, `<a:t>${from}</a:t>`];
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

function replaceLargestTxBody(xml: string, newPlain: string): string {
  const bodies = [...xml.matchAll(/<p:txBody>([\s\S]*?)<\/p:txBody>/g)];
  if (!bodies.length) return xml;
  let bestIdx = 0;
  let bestLen = 0;
  bodies.forEach((m, i) => {
    const text = [...m[1].matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
      .map((t) => t[1])
      .join('');
    if (text.length > bestLen) {
      bestLen = text.length;
      bestIdx = i;
    }
  });
  if (bestLen < 40) return xml;
  const oldBody = bodies[bestIdx][0];
  const lines = newPlain
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const paras = (lines.length ? lines : ['—'])
    .map(
      (line) =>
        `<a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>${escapeXml(line)}</a:t></a:r></a:p>`,
    )
    .join('');
  return xml.replace(oldBody, `<p:txBody><a:bodyPr/><a:lstStyle/>${paras}</p:txBody>`);
}

function shapePlainText(shapeXml: string): string {
  return [...shapeXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

/** Remplace le texte d’une forme (1er run) sans toucher au reste du slide. */
function setShapePlainText(shapeXml: string, text: string): string {
  let first = true;
  return shapeXml.replace(/<a:t([^>]*)>([^<]*)<\/a:t>/g, (_full, attrs: string) => {
    if (first) {
      first = false;
      return `<a:t${attrs}>${escapeXml(text)}</a:t>`;
    }
    return `<a:t${attrs}></a:t>`;
  });
}

function paintDeltaShape(shapeXml: string, tone: ExcoKpiCard['deltaTone']): string {
  const hex =
    tone === 'up' ? DELTA_GREEN : tone === 'down' ? DELTA_RED : DELTA_MUTED;
  let out = shapeXml.replace(
    /(<a:solidFill>\s*<a:srgbClr\s+val=")[0-9A-Fa-f]{6}(")/g,
    `$1${hex}$2`,
  );
  out = out.replace(
    /(<a:solidFill>\s*<a:schemeClr\s+val="[^"]+"\s*\/>\s*<\/a:solidFill>)/g,
    `<a:solidFill><a:srgbClr val="${hex}"/></a:solidFill>`,
  );
  return out;
}

function nextTextShapeIndex(shapes: string[], from: number): number {
  for (let i = from; i < shapes.length; i += 1) {
    if (/<a:t[^>]*>/.test(shapes[i])) return i;
  }
  return -1;
}

/**
 * Remplit le slide KPI Summary carte par carte (évite les collisions
 * quand une valeur live = une ancienne baseline Aug).
 */
function fillKpiSummarySlide(xml: string, report: ExcoReportPayload): string {
  const byKey = new Map((report.kpiSummary || []).map((k) => [k.key, k]));
  const cards = new Map<string, ExcoKpiCard>();
  for (const key of EXCO_KPI_SUMMARY_KEYS) {
    const metric = byKey.get(key);
    cards.set(
      key,
      metric
        ? metricToKpiCard(metric)
        : {
            key,
            label: key,
            value: null,
            delta: null,
            deltaTone: 'flat',
            prev: null,
          },
    );
  }

  const shapeMatches = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)];
  if (!shapeMatches.length) return xml;
  const shapes = shapeMatches.map((m) => m[0]);

  for (const conf of KPI_SLIDE_CARDS) {
    const labelIdx = shapes.findIndex((sp) => shapePlainText(sp) === conf.label);
    if (labelIdx < 0) continue;
    const card = cards.get(conf.key);
    if (!card) continue;

    const valueIdx = nextTextShapeIndex(shapes, labelIdx + 1);
    if (valueIdx < 0) continue;
    shapes[valueIdx] = setShapePlainText(shapes[valueIdx], card.value ?? '—');

    if (conf.hasDelta) {
      const deltaIdx = nextTextShapeIndex(shapes, valueIdx + 1);
      if (deltaIdx < 0) continue;
      const deltaText = card.delta || 'vs prev. —';
      shapes[deltaIdx] = paintDeltaShape(
        setShapePlainText(shapes[deltaIdx], deltaText),
        card.deltaTone || 'flat',
      );
      const prevIdx = nextTextShapeIndex(shapes, deltaIdx + 1);
      if (prevIdx >= 0) {
        shapes[prevIdx] = setShapePlainText(shapes[prevIdx], card.prev ?? '—');
      }
    } else {
      const prevIdx = nextTextShapeIndex(shapes, valueIdx + 1);
      if (prevIdx >= 0) {
        shapes[prevIdx] = setShapePlainText(shapes[prevIdx], card.prev ?? '—');
      }
    }
  }

  let last = 0;
  const parts: string[] = [];
  for (let i = 0; i < shapeMatches.length; i += 1) {
    const m = shapeMatches[i];
    const start = m.index ?? 0;
    parts.push(xml.slice(last, start));
    parts.push(shapes[i]);
    last = start + m[0].length;
  }
  parts.push(xml.slice(last));
  return parts.join('');
}

/** Remplacements sûrs (chaînes uniques) — hors cartes KPI Summary. */
function buildSafeReplacementPairs(report: ExcoReportPayload): Array<[string, string]> {
  const period = formatExcoPeriodLabel(report.year, report.month);
  const prevPeriod = prevPeriodLabel(report.year, report.month);
  const c = report.computed;
  const pairs: Array<[string, string]> = [];

  pairs.push([BASELINE_COVER, buildCoverLine(report)]);
  pairs.push(['Jul-26 → Aug-26', `${prevPeriod} → ${period}`]);
  pairs.push([`General Overview — ${BASELINE_PERIOD}`, `General Overview — ${period}`]);
  pairs.push([BASELINE_PERIOD, period]);

  if (c.averageAge != null) {
    pairs.push(['40.2 years old', `${Number(c.averageAge).toFixed(1)} years old`]);
  }
  if (c.averageSeniorityYears != null) {
    pairs.push([
      '5.81 years',
      `${Number(c.averageSeniorityYears).toFixed(2)} years`,
    ]);
  }

  const exits = (report.kpiSummary || []).find((k) => k.key === 'exits');
  if (exits?.value != null && c.headcount != null) {
    pairs.push([
      '4 Out this month · HC 175',
      `${exits.value} Out this month · HC ${c.headcount}`,
    ]);
  }

  const otHoursTotal = c.overtimeHoursTotal;
  const otHoursFmt =
    otHoursTotal != null && Number.isFinite(otHoursTotal)
      ? Number(otHoursTotal).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;
  if (otHoursFmt) {
    pairs.push(['1,034.02 hours', `${otHoursFmt} hours`]);
    pairs.push(['1,034.02', otHoursFmt]);
  }
  if (c.employeesWithOt != null) {
    pairs.push(['47 ', `${c.employeesWithOt} `]);
    if (c.headcount > 0) {
      pairs.push([
        '27%',
        `${Math.round((c.employeesWithOt / c.headcount) * 100)}%`,
      ]);
    }
    if (otHoursTotal != null && c.employeesWithOt > 0) {
      pairs.push([
        '22.00 h',
        `${(otHoursTotal / c.employeesWithOt).toFixed(2)} h`,
      ]);
    }
  }
  const otCostUsd = report.overlays.manualKpis?.overtimeCost ?? null;
  const staffCostUsd = report.overlays.manualKpis?.staffCost ?? null;
  if (otCostUsd != null) {
    const otCostFmt = `$${Math.round(otCostUsd).toLocaleString('en-US')}`;
    pairs.push(['$9,335 ', `${otCostFmt} `]);
  }
  if (otCostUsd != null && c.employeesWithOt > 0) {
    pairs.push([
      '$199',
      `$${Math.round(otCostUsd / c.employeesWithOt).toLocaleString('en-US')}`,
    ]);
  }
  if (otCostUsd != null && staffCostUsd != null && staffCostUsd > 0) {
    pairs.push([
      '1.08%',
      `${((otCostUsd / staffCostUsd) * 100).toFixed(2)}%`,
    ]);
  }
  try {
    const leaveMap = report.overlays.leaveBalanceByMatricule || {};
    const otRows = c.overtimeTopEmployees || [];
    const withLeave = otRows
      .map((row) => leaveMap[row.matricule] ?? row.leaveBalance)
      .filter((v): v is number => v != null && Number.isFinite(v));
    if (withLeave.length) {
      const avgLeave = withLeave.reduce((s, v) => s + v, 0) / withLeave.length;
      pairs.push(['15.69 days', `${avgLeave.toFixed(2)} days`]);
    }
  } catch {
    // ignore
  }

  const auditRows = buildInternalAuditRows(report);
  const sum = summarizeInternalAudit(auditRows);
  const gov = buildGouvernanceSlideData(report);
  const closedPctRaw = gov.auditClosedPct || sum.closedPct;
  const closedPct =
    typeof closedPctRaw === 'number'
      ? String(Math.round(closedPctRaw * 100) / 100)
      : String(closedPctRaw);
  pairs.push(['54.55%', `${closedPct}%`]);
  pairs.push([
    '12/22 points  ·  Overdue 9  ·  On going 1',
    `${sum.closed}/${sum.total} points  ·  Overdue ${sum.overdue}  ·  On going ${sum.ongoing}`,
  ]);

  try {
    const tr = buildTrainingSlideData(report);
    const baselineCovered = [
      'Trainee Pevid Luambo',
      'Trainee Kutu Medina',
      'Chartered management accountant training',
      'C.N.P.R.ITRAINING COURSE FEES',
    ];
    for (let i = 0; i < baselineCovered.length; i += 1) {
      const neu = tr.covered[i];
      if (neu && neu !== baselineCovered[i]) pairs.push([baselineCovered[i], neu]);
    }
    const baselineUpcoming = ['AI', 'Retirement preparation'];
    for (let i = 0; i < baselineUpcoming.length; i += 1) {
      const neu = tr.upcoming[i];
      if (neu && neu !== baselineUpcoming[i]) pairs.push([baselineUpcoming[i], neu]);
    }
  } catch {
    // ignore
  }

  const thankMsg =
    (report.overlays.narrative?.thankYouMessage || 'Thank You').trim() || 'Thank You';
  if (thankMsg !== 'Thank You') pairs.push(['Thank You', thankMsg]);

  const uniq = new Map<string, string>();
  for (const [from, to] of pairs) {
    if (!from || !to || from === to) continue;
    if (!uniq.has(from)) uniq.set(from, to);
  }
  return [...uniq.entries()].sort((a, b) => b[0].length - a[0].length);
}

/**
 * Disposition = template Aug-26 ; données = rapport du mois sélectionné.
 */
export async function buildExcoPptxFromTemplate(report: ExcoReportPayload): Promise<Buffer> {
  const templatePath = await resolveExcoPptxTemplatePath();
  const raw = await fs.readFile(templatePath);
  const zip = await JSZip.loadAsync(raw);
  const pairs = buildSafeReplacementPairs(report);
  const period = formatExcoPeriodLabel(report.year, report.month);
  const n = report.overlays.narrative || {};

  const slideFiles = Object.keys(zip.files)
    .filter((name) => /ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = Number(a.match(/slide(\d+)/)?.[1] || 0);
      const nb = Number(b.match(/slide(\d+)/)?.[1] || 0);
      return na - nb;
    });

  for (const name of slideFiles) {
    const file = zip.file(name);
    if (!file) continue;
    let xml = await file.async('string');
    const slideNo = Number(name.match(/slide(\d+)/)?.[1] || 0);

    if (slideNo === 3 && n.highlights?.trim()) {
      xml = replaceLargestTxBody(xml, n.highlights.trim());
    } else if (slideNo === 4 && n.lowlights?.trim()) {
      xml = replaceLargestTxBody(xml, n.lowlights.trim());
    } else if (slideNo === 5 && n.focus?.trim()) {
      xml = replaceLargestTxBody(xml, n.focus.trim());
    }

    if (slideNo === 6) {
      xml = fillKpiSummarySlide(xml, report);
    } else {
      xml = fillTemplateDataSlides(slideNo, xml, report);
    }

    xml = replaceAllRuns(xml, pairs);
    xml = xml.replace(/>Aug-26</g, `>${escapeXml(period)}<`);
    zip.file(name, xml);
  }

  for (const name of Object.keys(zip.files).filter((nm) =>
    /ppt\/notesSlides\/notesSlide\d+\.xml$/.test(nm),
  )) {
    const file = zip.file(name);
    if (!file) continue;
    let xml = await file.async('string');
    xml = replaceAllRuns(xml, pairs);
    xml = xml.replace(/>Aug-26</g, `>${escapeXml(period)}<`);
    zip.file(name, xml);
  }

  const out = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return Buffer.from(out);
}
