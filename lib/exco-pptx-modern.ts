import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import PptxGenJS from 'pptxgenjs';
import type { ExcoCahierHighlight, ExcoCsrFy27Row, ExcoMetricValue, ExcoReportPayload } from './exco-types';
import { groupExcoKpis, EXCO_PREVIEW_TOC } from './exco-preview-html';
import { buildMouvementsSlideData } from './exco-mouvements-slide-data';
import { buildOtSlideData, buildOtVsLeaveSlideData, formatOtHours, formatOtHoursShort, otChartDeptLabel } from './exco-ot-slide-data';
import {
  buildCsrSlideData,
  buildGouvernanceSlideData,
  buildTrainingSlideData,
} from './exco-dashboard-slides-data';
import { resolveCahierHighlights, resolveCsrFy27Rows, parseCsrUpdateMarkup, csrTextHasUpdate, csrSlideText, CSR_UPDATE_COLOR } from './exco-csr-fy27';
import { resolveRecruitment } from './exco-recruitment-fy27';
import {
  auditSeverityColor,
  auditStatusColor,
  auditStatusFill,
  buildInternalAuditRows,
  summarizeInternalAudit,
} from './exco-audit-internal';
import {
  buildTrendsSlideSections,
  type ExcoTrendTableSection,
} from './exco-trends-slide-data';

type Slide = ReturnType<PptxGenJS['addSlide']>;

const PPC = {
  red: 'E30613',
  redDark: 'B0050F',
  redSoft: 'FCE8E9',
  redTop: 'F8D0D3',
  black: '0A0A0A',
  ink: '16161E',
  muted: '6B6B7A',
  line: 'E0E0E6',
  panel: 'F7F7FA',
  white: 'FFFFFF',
  /** Fond slide (gris). */
  slide: 'E8E8EC',
  success: '166534',
  successSoft: 'DCFCE7',
  warning: 'B45309',
  danger: 'B91C1C',
  info: '1D4ED8',
} as const;

/** Police pro (Windows / Office). */
const FONT = 'Segoe UI';
const FONT_TITLE = 'Segoe UI';

const W = 13.333;
const H = 7.5;
const TABLE_BORDER = { pt: 0.4, color: PPC.line };

const TOC = EXCO_PREVIEW_TOC;

function money(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function num(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${n.toFixed(digits)}%`;
}

function fmtMetric(kpi: ExcoMetricValue): string {
  if (kpi.value == null || kpi.value === '') return '—';
  if (typeof kpi.value === 'number') {
    if (kpi.unit === 'USD') return money(kpi.value, kpi.key === 'leaveCost' ? 2 : 0);
    if (kpi.unit === '%') return pct(kpi.value, 1);
    if (kpi.unit === 'hrs' || kpi.unit === 'jours' || kpi.unit === 'ans') {
      const unitLabel =
        kpi.unit === 'jours' ? 'days' : kpi.unit === 'ans' ? 'yrs' : 'hrs';
      return `${num(kpi.value, kpi.unit === 'ans' ? 2 : 0)} ${unitLabel}`;
    }
    return num(kpi.value);
  }
  return String(kpi.value);
}

function deltaLabel(
  deltaPct: number | null | undefined,
  opts?: { current?: number | null; previous?: number | null },
): { text: string; color: string } {
  const cur = opts?.current;
  const prev = opts?.previous;
  let trend: 'up' | 'down' | '' = '';
  if (cur != null && prev != null && Number.isFinite(cur) && Number.isFinite(prev)) {
    if (cur > prev) trend = 'up';
    else if (cur < prev) trend = 'down';
  } else if (deltaPct != null && Number.isFinite(deltaPct) && deltaPct !== 0) {
    trend = deltaPct > 0 ? 'up' : 'down';
  }

  if (deltaPct == null || !Number.isFinite(deltaPct)) {
    return { text: 'vs prev. —', color: PPC.muted };
  }
  const pctVal = Math.round(deltaPct * 1000) / 10;
  const arrow = trend === 'up' || pctVal > 0 ? '▲' : trend === 'down' || pctVal < 0 ? '▼' : '•';
  const color =
    trend === 'up' ? PPC.success : trend === 'down' ? PPC.danger : PPC.muted;
  return { text: `${arrow} ${Math.abs(pctVal)}% vs prev.`, color };
}

export function meetingDateLabel(raw: string | undefined): string {
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

function addChrome(slide: Slide, title: string, subtitle: string, period: string, sectionNo?: string): void {
  slide.addShape('rect', {
    x: 0, y: 0, w: W, h: 0.07,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
  // Bandeau blanc translucide-like (header propre sur fond gris)
  slide.addShape('rect', {
    x: 0, y: 0.07, w: W, h: 0.62,
    fill: { color: PPC.white }, line: { color: PPC.white },
  });
  const badgeX = 0.32;
  const badgeY = 0.16;
  const badgeS = 0.4;
  if (sectionNo) {
    slide.addShape('roundRect', {
      x: badgeX, y: badgeY, w: badgeS, h: badgeS,
      fill: { color: PPC.red }, line: { color: PPC.red }, rectRadius: 0.06,
    });
    slide.addText(sectionNo, {
      x: badgeX, y: badgeY, w: badgeS, h: badgeS,
      fontSize: 12, bold: true, color: PPC.white, fontFace: FONT_TITLE,
      align: 'center', valign: 'middle',
    });
  }
  const textX = sectionNo ? 0.88 : 0.4;
  slide.addText('PPC · HR EXCO', {
    x: textX, y: 0.14, w: 5, h: 0.16,
    fontSize: 9, color: PPC.red, bold: true, fontFace: FONT,
  });
  slide.addText(title, {
    x: textX, y: 0.3, w: 8.2, h: 0.3,
    fontSize: 18, bold: true, color: PPC.ink, fontFace: FONT_TITLE, valign: 'middle',
  });
  slide.addText(period, {
    x: 9.4, y: 0.22, w: 3.5, h: 0.3,
    fontSize: 12, color: PPC.muted, align: 'right', fontFace: FONT, valign: 'middle',
  });
  // Pas de sous-titre sous le header (layout harmonisé)
  void subtitle;
  slide.addShape('rect', {
    x: 0, y: H - 0.09, w: W, h: 0.09,
    fill: { color: PPC.black }, line: { color: PPC.black },
  });
}

/** Fond gris + image fondue industrielle. */
async function paintSlideCanvas(
  slide: Slide,
  assetsDir: string,
): Promise<void> {
  slide.background = { color: PPC.slide };
  const fade = path.join(assetsDir, 'slide-fade.jpg');
  try {
    await fs.access(fade);
    slide.addImage({
      path: fade,
      x: 0,
      y: 0,
      w: W,
      h: H,
      sizing: { type: 'cover', w: W, h: H },
    });
  } catch {
    // fond uni déjà posé
  }
}

function whiteBlock(
  slide: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: PPC.white },
    line: { color: PPC.line, pt: 1 },
    rectRadius: 0.08,
  });
}

type TextRun = { text: string; options?: Record<string, unknown> };

/** Filtre les runs vides — cause fréquente de « Repair » PowerPoint. */
function safeTextRuns(runs: TextRun[], fallback = '—'): TextRun[] {
  const cleaned = runs
    .map((r) => ({ ...r, text: String(r.text ?? '') }))
    .filter((r) => r.text.length > 0);
  return cleaned.length ? cleaned : [{ text: fallback }];
}

const CSR_FY27_HEADER = '9B1B24';
const CSR_FY27_NAME = 'F4C4C8';
const CSR_FY27_ALT = 'FCE8E9';
const CSR_FY27_UPD = 'E8F0FE';
const CAHIER_GREEN = '2F7D32';
const CAHIER_PINK = 'F4C4C8';

const CAHIER_ICON_GLYPH: Record<ExcoCahierHighlight['icon'], string> = {
  scholarship: 'S',
  infrastructure: 'I',
  agriculture: 'A',
  leisure: 'L',
  electricity: 'E',
};

function recMarkupCell(text: string, fill: string, opts?: { bold?: boolean; align?: 'left' | 'center' }) {
  const runs = safeTextRuns(
    parseCsrUpdateMarkup(text || '').map((run) => ({
      text: run.text,
      options: {
        color: run.update ? CSR_UPDATE_COLOR : PPC.ink,
        bold: run.update ? false : Boolean(opts?.bold),
        fontSize: 7,
        fontFace: FONT,
      },
    })),
  );
  return {
    text: runs,
    options: {
      fill: { color: fill },
      valign: 'middle' as const,
      align: opts?.align || 'left',
      wrap: true,
      margin: [2, 3, 2, 3] as [number, number, number, number],
    },
  };
}

function recHeaderCell(text: string) {
  return {
    text,
    options: {
      fill: { color: CSR_FY27_HEADER },
      color: PPC.white,
      bold: true,
      fontSize: 8,
      align: 'center' as const,
      valign: 'middle' as const,
    },
  };
}

function fy27Cell(
  text: string,
  opts: { fill: string; bold?: boolean; color?: string; align?: 'left' | 'center' },
) {
  const shown = opts.color === PPC.white ? text : csrSlideText(text || '—');
  const runs = safeTextRuns(
    parseCsrUpdateMarkup(shown || '—').map((run) => ({
      text: run.text || '',
      options: {
        color: run.update ? CSR_UPDATE_COLOR : (opts.color || PPC.ink),
        bold: run.update ? false : Boolean(opts.bold),
        fontSize: opts.bold && opts.color === PPC.white ? 9 : 7,
        fontFace: FONT,
      },
    })),
  );
  const hasUpd = csrTextHasUpdate(shown);
  const fill = hasUpd && !opts.color ? CSR_FY27_UPD : opts.fill;
  return {
    text: runs,
    options: {
      fill: { color: fill },
      color: opts.color || PPC.ink,
      bold: hasUpd ? false : Boolean(opts.bold),
      fontFace: FONT,
      align: opts.align || 'left',
      valign: 'top' as const,
      wrap: true,
      margin: [3, 3, 3, 3] as [number, number, number, number],
    },
  };
}

function addCsrFy27Table(slide: Slide, rows: ExcoCsrFy27Row[]): void {
  const header = [
    fy27Cell('Project / Initiative', { fill: CSR_FY27_HEADER, bold: true, color: PPC.white, align: 'center' }),
    fy27Cell('Purpose / Objective', { fill: CSR_FY27_HEADER, bold: true, color: PPC.white, align: 'center' }),
    fy27Cell('Current Status', { fill: CSR_FY27_HEADER, bold: true, color: PPC.white, align: 'center' }),
    fy27Cell('Key Issues / Risks', { fill: CSR_FY27_HEADER, bold: true, color: PPC.white, align: 'center' }),
    fy27Cell('Next Steps', { fill: CSR_FY27_HEADER, bold: true, color: PPC.white, align: 'center' }),
  ];
  const body = (rows.length ? rows : [{ id: '', name: '—', objective: '', progress: '', risks: '', nextSteps: '' }]).map(
    (row, i) => {
      const alt = i % 2 === 1 ? CSR_FY27_ALT : PPC.white;
      return [
        fy27Cell(row.name, { fill: CSR_FY27_NAME, bold: true }),
        fy27Cell(row.objective, { fill: alt }),
        fy27Cell(row.progress, { fill: alt }),
        fy27Cell(row.risks, { fill: alt }),
        fy27Cell(row.nextSteps, { fill: alt }),
      ];
    },
  );
  slide.addTable([header, ...body], {
    x: 0.36,
    y: 1.02,
    w: 12.58,
    h: 6.0,
    colW: [1.85, 2.3, 3.2, 2.5, 2.73],
    border: { pt: 0.4, color: PPC.white },
    fontFace: FONT,
    valign: 'top',
  });
}

function cahierIconGlyph(icon: ExcoCahierHighlight['icon']): string {
  return CAHIER_ICON_GLYPH[icon] || '•';
}

/**
 * Anneaux de progression sans SVG ni doughnut chart
 * (sources fréquentes de corruption PPTX / Repair PowerPoint).
 */
function addCahierHighlights(slide: Slide, items: ExcoCahierHighlight[]): void {
  const list = items.slice(0, 5);
  const n = Math.max(list.length, 1);
  const startY = 1.04;
  const bottom = 7.12;
  const rowH = (bottom - startY) / n;
  const ring = Math.min(1.18, rowH - 0.1);
  list.forEach((item, i) => {
    const y = startY + i * rowH;
    const pct = Math.max(0, Math.min(100, Number(item.progressPct) || 0));
    const ringX = 0.48;
    const ringY = y + 0.04;

    // Anneau extérieur (reste) + disque interne (progression) via ellipses
    slide.addShape('ellipse', {
      x: ringX, y: ringY, w: ring, h: ring,
      fill: { color: CAHIER_PINK }, line: { color: CAHIER_PINK },
    });
    if (pct > 0) {
      const innerScale = 0.55 + (pct / 100) * 0.45;
      const done = ring * innerScale;
      const off = (ring - done) / 2;
      slide.addShape('ellipse', {
        x: ringX + off, y: ringY + off, w: done, h: done,
        fill: { color: CAHIER_GREEN }, line: { color: CAHIER_GREEN },
      });
    }
    const hole = ring * 0.58;
    const holeOff = (ring - hole) / 2;
    slide.addShape('ellipse', {
      x: ringX + holeOff, y: ringY + holeOff, w: hole, h: hole,
      fill: { color: PPC.white }, line: { color: PPC.white },
    });
    slide.addText(cahierIconGlyph(item.icon), {
      x: ringX, y: ringY, w: ring, h: ring,
      fontSize: Math.max(14, Math.round(ring * 18)),
      bold: true,
      color: CAHIER_GREEN,
      fontFace: FONT_TITLE,
      align: 'center',
      valign: 'middle',
    });

    const textX = ringX + ring + 0.22;
    const textW = 12.55 - textX;
    slide.addText(item.title?.trim() || '—', {
      x: textX, y: y + 0.04, w: textW, h: 0.28,
      fontSize: 16, bold: true, color: PPC.red, fontFace: FONT_TITLE,
    });
    const bodySrc = item.body || '—';
    const isShort = bodySrc.replace(/\[\[|\]\]/g, '').trim().length < 80;
    const bodyRuns = safeTextRuns(
      parseCsrUpdateMarkup(bodySrc).flatMap((run, idx) => {
        const raw = run.text;
        const prefix = idx === 0 && isShort ? '• ' : '';
        if (!run.update && raw.includes('100%')) {
          const [before, after] = raw.split('100%');
          return [
            { text: `${prefix}${before}`, options: { color: PPC.ink, bold: false, fontSize: 13, fontFace: FONT } },
            { text: '100%', options: { color: PPC.ink, bold: true, fontSize: 13, fontFace: FONT } },
            { text: after || '', options: { color: PPC.ink, bold: false, fontSize: 13, fontFace: FONT } },
          ];
        }
        return [{
          text: `${prefix}${raw}`,
          options: {
            color: run.update ? CSR_UPDATE_COLOR : PPC.ink,
            bold: false,
            fontSize: 13,
            fontFace: FONT,
          },
        }];
      }),
    );
    slide.addText(bodyRuns as Parameters<Slide['addText']>[0], {
      x: textX, y: y + 0.34, w: textW, h: rowH - 0.48,
      valign: 'top',
    });
    if (i < list.length - 1) {
      slide.addShape('rect', {
        x: 0.46, y: y + rowH - 0.03, w: 12.1, h: 0.012,
        fill: { color: 'D8D8DE' }, line: { color: 'D8D8DE' },
      });
    }
  });
}

function iconBadge(slide: Slide, x: number, y: number, glyph: string, bg = PPC.red): void {
  slide.addShape('ellipse', {
    x, y, w: 0.38, h: 0.38,
    fill: { color: bg }, line: { color: bg },
  });
  slide.addText(glyph, {
    x, y, w: 0.38, h: 0.38,
    fontSize: 11, color: PPC.white, align: 'center', valign: 'middle', fontFace: FONT, bold: true,
  });
}

function kpiCard(
  slide: Slide,
  x: number, y: number, w: number, h: number,
  label: string, value: string,
  opts?: {
    delta?: { text: string; color: string };
    prev?: string;
    badge?: string;
    glyph?: string;
  },
): void {
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: PPC.white },
    line: { color: PPC.line, width: 1 },
    shadow: { type: 'outer', color: '000000', blur: 6, opacity: 0.07, offset: 1 },
    rectRadius: 0.08,
  });
  slide.addShape('rect', {
    x, y, w: 0.07, h,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
  slide.addText(label, {
    x: x + 0.2, y: y + 0.14, w: w - 0.35, h: 0.26,
    fontSize: 11, color: PPC.red, bold: true, fontFace: FONT,
  });
  slide.addText(value, {
    x: x + 0.2, y: y + 0.4, w: w - 0.35, h: 0.36,
    fontSize: 13, bold: true, color: PPC.ink, fontFace: FONT, align: 'left',
  });
  const footY = y + h - 0.32;
  const footW = w - 0.4;
  if (opts?.delta) {
    slide.addText(opts.delta.text, {
      x: x + 0.2, y: footY, w: footW * 0.58, h: 0.22,
      fontSize: 8, color: opts.delta.color, fontFace: FONT, bold: false,
    });
  } else if (opts?.badge) {
    slide.addText(opts.badge, {
      x: x + 0.2, y: footY, w: footW * 0.58, h: 0.22,
      fontSize: 8, color: PPC.muted, fontFace: FONT, bold: false,
    });
  }
  if (opts?.prev != null) {
    slide.addText(opts.prev, {
      x: x + 0.2 + footW * 0.4, y: footY, w: footW * 0.6, h: 0.22,
      fontSize: 8, color: PPC.muted, fontFace: FONT, bold: false, align: 'right',
    });
  }
}

import { splitNarrativePoints } from './exco-narrative-format';

function narrativeParts(body: string): string[] {
  return splitNarrativePoints(body);
}

function estimateNarrativeInches(parts: string[], fontSize: number, widthIn: number): number {
  const charW = (fontSize * 0.52) / 72;
  const charsPerLine = Math.max(16, Math.floor(widthIn / charW));
  const lineH = (fontSize * 1.16) / 72;
  const paraGap = 0.035;
  return parts.reduce((sum, p) => {
    return sum + Math.max(1, Math.ceil(p.length / charsPerLine)) * lineH + paraGap;
  }, 0);
}

function fitNarrativeFont(parts: string[], widthIn: number, maxH: number): number {
  for (const size of [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5]) {
    if (estimateNarrativeInches(parts, size, widthIn) <= maxH) return size;
  }
  return 6.5;
}

function narrativeTextRuns(
  body: string,
  fontSize: number,
): Array<{ text: string; options: { bold?: boolean; fontSize: number; color: string; fontFace: string } }> {
  const parts = narrativeParts(body);
  if (!parts.length) {
    return [{ text: '—', options: { fontSize, color: PPC.ink, fontFace: FONT } }];
  }
  const runs: Array<{ text: string; options: { bold?: boolean; fontSize: number; color: string; fontFace: string } }> = [];
  parts.forEach((p, i) => {
    const gap = i === 0 ? '' : '\n\n';
    const idx = p.indexOf(':');
    if (idx > 0 && idx < 90) {
      runs.push({
        text: `${gap}${p.slice(0, idx + 1)} `,
        options: { bold: true, fontSize, color: PPC.ink, fontFace: FONT },
      });
      runs.push({
        text: p.slice(idx + 1).trim(),
        options: { bold: false, fontSize, color: PPC.ink, fontFace: FONT },
      });
    } else {
      runs.push({
        text: `${gap}${p}`,
        options: { fontSize, color: PPC.ink, fontFace: FONT },
      });
    }
  });
  return runs;
}

function panel(slide: Slide, x: number, y: number, w: number, h: number, title: string, body: string, glyph?: string): void {
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: PPC.white }, line: { color: PPC.line, width: 1 }, rectRadius: 0.08,
    shadow: { type: 'outer', color: '000000', blur: 6, opacity: 0.06, offset: 1 },
  });
  if (glyph) iconBadge(slide, x + 0.18, y + 0.16, glyph);
  slide.addText(title, {
    x: x + (glyph ? 0.68 : 0.2), y: y + 0.18, w: w - 0.9, h: 0.28,
    fontSize: 13, bold: true, color: PPC.red, fontFace: FONT,
  });
  const textW = w - 0.4;
  const textH = h - 0.78;
  const fontSize = fitNarrativeFont(narrativeParts(body), textW, textH);
  slide.addText(narrativeTextRuns(body, fontSize), {
    x: x + 0.2, y: y + 0.52, w: textW, h: textH,
    valign: 'top',
    wrap: true,
  });
}

function addSectionTitle(slide: Slide, title: string, y: number): void {
  slide.addText(title, {
    x: 0.55, y, w: 12.2, h: 0.3,
    fontSize: 13, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
  });
  slide.addShape('rect', {
    x: 0.55, y: y + 0.3, w: 12.2, h: 0.018,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
}

function addTrendTable(
  slide: Slide,
  section: ExcoTrendTableSection,
  y: number,
  opts?: { maxH?: number; rowH?: number },
): number {
  addSectionTitle(slide, section.title, y);
  const tableY = y + 0.4;
  const colCount = section.headers.length;
  const firstColW = 1.85;
  const restW = (12.2 - firstColW) / Math.max(1, colCount - 1);
  const colW = [firstColW, ...Array.from({ length: colCount - 1 }, () => restW)];
  const cur = section.currentHeaderIndex;
  const header = section.headers.map((h, i) => ({
    text: h,
    options: {
      bold: true,
      color: PPC.white,
      fill: { color: i === cur ? PPC.red : PPC.black },
      align: (i === 0 ? 'left' : 'center') as 'left' | 'center',
      fontSize: 8,
    },
  }));
  const rows = section.rows.map((row, ri) => {
    const baseFill = ri % 2 === 0 ? PPC.white : PPC.panel;
    return [
      {
        text: row.label,
        options: { bold: true, color: PPC.ink, fill: { color: baseFill }, fontSize: 9 },
      },
      ...row.cells.map((cell, ci) => {
        const headerIdx = ci + 1;
        const isCurrent = headerIdx === cur;
        return {
          text: cell,
          options: {
            align: 'center' as const,
            color: isCurrent ? PPC.red : PPC.ink,
            bold: isCurrent,
            fill: { color: isCurrent ? PPC.redSoft : baseFill },
            fontSize: 8,
          },
        };
      }),
    ];
  });
  const rowCount = 1 + section.rows.length;
  const rowH = opts?.rowH ?? 0.36;
  slide.addTable([header, ...rows], {
    x: 0.55,
    y: tableY,
    w: 12.2,
    colW,
    rowH,
    border: TABLE_BORDER,
    fontFace: FONT,
    fontSize: 8,
    color: PPC.ink,
    valign: 'middle',
  });
  const used = 0.4 + rowH * rowCount + 0.2;
  return y + Math.min(used, opts?.maxH ?? used);
}

/**
 * Contenu EXCO — fichier 100% pptxgenjs (aucun merge XML → pas de réparation PowerPoint).
 * Slide 1 = cover style template (photos + logo PPC).
 */
export async function buildModernExcoContentPptx(report: ExcoReportPayload): Promise<Buffer> {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: W, height: H });
  pptx.layout = 'WIDE';
  pptx.author = 'PPC HR';
  pptx.title = `EXCO HR — ${report.periodLabel}`;

  const c = report.computed;
  const o = report.overlays;
  const period = report.periodLabel;
  const prev = report.prevPeriodLabel;
  const assets = path.join(process.cwd(), 'templates', 'exco', 'cover-assets');

  // —— Slide 1 : cover (bannière officielle + meeting) ——
  {
    const s = pptx.addSlide();
    s.background = { color: PPC.white };

    // Cercles décoratifs (comme le template)
    s.addShape('ellipse', {
      x: -1.6, y: -1.8, w: 4.6, h: 4.6,
      fill: { color: 'E8E8EC' }, line: { color: 'E8E8EC' },
    });
    s.addShape('ellipse', {
      x: (W - 3.4) / 2, y: 6.35, w: 3.4, h: 3.4,
      fill: { color: 'D8D8DE' }, line: { color: 'D8D8DE' },
    });

    // Bannière unique (photos + sceau + PPC) — capture fournie
    const bannerPath = path.join(assets, 'cover-banner.png');
    const bannerW = 12.0;
    const bannerH = bannerW * (296 / 1024);
    const bannerX = (W - bannerW) / 2;
    const bannerY = 0.55;
    try {
      await fs.access(bannerPath);
      s.addImage({
        path: bannerPath,
        x: bannerX,
        y: bannerY,
        w: bannerW,
        h: bannerH,
        sizing: { type: 'contain', w: bannerW, h: bannerH },
      });
    } catch {
      s.addText('PPC', {
        x: (W - 4) / 2, y: 2.2, w: 4, h: 0.8,
        fontSize: 48, bold: true, color: PPC.black, align: 'center', fontFace: FONT_TITLE,
      });
    }

    // Pastille rouge + ligne meeting (centrée)
    const n = o.narrative;
    const title = (n.meetingTitle?.trim() || 'EXCO MEETING').toUpperCase();
    const date = meetingDateLabel(n.meetingDate).toUpperCase();
    const place = (n.meetingPlace?.trim() || '—').toUpperCase();
    const meet = `${title} HELD ON ${date}, IN ${place}`;
    const meetY = bannerY + bannerH + 1.15;
    const badgePath = path.join(assets, 'cover-badge.png');
    const badgeSize = 0.38;
    // approx text width ~ 0.11" per char at 14pt → center group
    const approxTextW = Math.min(11.2, Math.max(6, meet.length * 0.105));
    const groupW = badgeSize + 0.18 + approxTextW;
    const groupX = (W - groupW) / 2;

    try {
      await fs.access(badgePath);
      s.addImage({
        path: badgePath,
        x: groupX,
        y: meetY,
        w: badgeSize,
        h: badgeSize,
        sizing: { type: 'contain', w: badgeSize, h: badgeSize },
      });
    } catch {
      s.addShape('ellipse', {
        x: groupX, y: meetY, w: badgeSize, h: badgeSize,
        fill: { color: PPC.red }, line: { color: PPC.red },
      });
    }
    s.addText(meet, {
      x: groupX + badgeSize + 0.18,
      y: meetY - 0.02,
      w: approxTextW,
      h: 0.42,
      fontSize: 15,
      bold: true,
      color: PPC.black,
      fontFace: FONT,
      align: 'left',
      valign: 'middle',
    });
  }

  // —— Sommaire (onglets système) ——
  {
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'Agenda', '', period);
    TOC.forEach((item, i) => {
      const col = i < 5 ? 0 : 1;
      const row = i % 5;
      const x = 0.5 + col * 6.4;
      const y = 1.35 + row * 1.0;
      s.addShape('roundRect', {
        x, y, w: 6.1, h: 0.85,
        fill: { color: PPC.white },
        line: { color: PPC.line, width: 1 },
        rectRadius: 0.08,
        shadow: { type: 'outer', color: '000000', blur: 5, opacity: 0.06, offset: 1 },
      });
      s.addShape('roundRect', {
        x: x + 0.15, y: y + 0.2, w: 0.55, h: 0.45,
        fill: { color: i % 2 === 0 ? PPC.red : PPC.black },
        line: { color: i % 2 === 0 ? PPC.red : PPC.black },
        rectRadius: 0.06,
      });
      s.addText(item.n, {
        x: x + 0.15, y: y + 0.2, w: 0.55, h: 0.45,
        fontSize: 12, bold: true, color: PPC.white, align: 'center', valign: 'middle', fontFace: FONT,
      });
      s.addText(item.label, {
        x: x + 0.9, y: y + 0.18, w: 4.9, h: 0.32,
        fontSize: 16, bold: true, color: PPC.ink, fontFace: FONT,
      });
      s.addText(item.hint, {
        x: x + 0.9, y: y + 0.48, w: 4.9, h: 0.26,
        fontSize: 11, color: PPC.muted, fontFace: FONT,
      });
    });
  }

  // —— Synthèse ——
  {
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'Summary', `${prev} → ${period}`, period, '01');
    const n = o.narrative;
    panel(s, 0.4, 1.22, 4.1, 5.95, 'Highlights', n.highlights || '', 'H');
    panel(s, 4.65, 1.22, 4.1, 5.95, 'Lowlights', n.lowlights || '', 'L');
    panel(s, 8.9, 1.22, 4.0, 5.95, 'Focus', n.focus || '', 'F');
  }

  // —— KPI Summary (1 slide, 20 cartes, 2 blocs × 5 cols) ——
  {
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(
      s,
      'KPI Summary',
      `${prev} vs ${period}`,
      period,
      '02',
    );
    const groups = groupExcoKpis(report.kpiSummary);
    let y = 1.15;
    for (const g of groups) {
      s.addShape('rect', {
        x: 0.4,
        y: y + 0.1,
        w: 4.2,
        h: 0.01,
        fill: { color: 'CFCFD6' },
        line: { color: 'CFCFD6' },
      });
      s.addText(g.title, {
        x: 4.7,
        y,
        w: 4,
        h: 0.24,
        fontSize: 10,
        bold: true,
        color: PPC.muted,
        align: 'center',
        fontFace: FONT,
      });
      s.addShape('rect', {
        x: 8.8,
        y: y + 0.1,
        w: 4.1,
        h: 0.01,
        fill: { color: 'CFCFD6' },
        line: { color: 'CFCFD6' },
      });
      y += 0.3;
      g.items.forEach((kpi, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        kpiCard(
          s,
          0.35 + col * 2.58,
          y + row * 1.22,
          2.48,
          1.12,
          kpi.label,
          fmtMetric(kpi),
          {
            delta: deltaLabel(kpi.deltaPct, {
              current: typeof kpi.value === 'number' ? kpi.value : null,
              previous: typeof kpi.prevValue === 'number' ? kpi.prevValue : null,
            }),
            prev: fmtMetric({ ...kpi, value: kpi.prevValue ?? null }),
          },
        );
      });
      y += 2.55;
    }
  }

  // —— Tendances (2 slides × 2 blocs, même données que l’onglet) ——
  {
    const { slideA, slideB } = buildTrendsSlideSections(report);

    {
      const s = pptx.addSlide();
      await paintSlideCanvas(s, assets);
      addChrome(s, 'HR KPI — Trends', 'Financial KPIs · Headcount', period, '03');
      whiteBlock(s, 0.28, 0.92, 12.75, 6.3);
      const rowsA = 1 + (slideA[0]?.rows.length || 0);
      const rowsB = 1 + (slideA[1]?.rows.length || 0);
      const rowH = Math.min(0.55, Math.max(0.32, (5.6 - 0.9) / (rowsA + rowsB)));
      let y = 1.05;
      y = addTrendTable(s, slideA[0], y, { rowH });
      addTrendTable(s, slideA[1], y + 0.08, { rowH });
    }

    {
      const s = pptx.addSlide();
      await paintSlideCanvas(s, assets);
      addChrome(s, 'HR KPI — Trends', 'Gender RATIO · AGE', period, '03');
      whiteBlock(s, 0.28, 0.92, 12.75, 6.3);
      const rowsA = 1 + (slideB[0]?.rows.length || 0);
      const rowsB = 1 + (slideB[1]?.rows.length || 0);
      const rowH = Math.min(0.55, Math.max(0.32, (5.6 - 0.9) / (rowsA + rowsB)));
      let y = 1.05;
      y = addTrendTable(s, slideB[0], y, { rowH });
      addTrendTable(s, slideB[1], y + 0.08, { rowH });
    }
  }

  // —— Mouvements (2 slides : Staff movement · Overtime) ——
  {
    const mv = buildMouvementsSlideData(report);
    const ot = buildOtSlideData(report);

    {
      const s = pptx.addSlide();
      await paintSlideCanvas(s, assets);
      addChrome(
        s,
        'HR KPI AND DIVERSITY',
        'Staff Movement — Turnover — Age — Length of service',
        period,
        '04',
      );
      whiteBlock(s, 0.28, 0.92, 12.75, 6.3);
      addTrendTable(s, mv.inOut, 1.0);

      const charts: Array<{
        series: typeof mv.ageChart;
        x: number;
        color: string;
        mode: 'chart' | 'exits';
      }> = [
        { series: mv.ageChart, x: 0.35, color: PPC.red, mode: 'chart' },
        { series: mv.seniorityChart, x: 4.55, color: PPC.black, mode: 'chart' },
        { series: mv.exitsChart, x: 8.75, color: PPC.redDark, mode: 'exits' },
      ];
      const chartY = 3.55;
      for (const ch of charts) {
        s.addShape('roundRect', {
          x: ch.x, y: chartY, w: 4.0, h: 3.5,
          fill: { color: PPC.white },
          line: { color: PPC.line, pt: 1 },
          rectRadius: 0.06,
        });
        s.addShape('rect', {
          x: ch.x, y: chartY, w: 4.0, h: 0.42,
          fill: { color: ch.color }, line: { color: ch.color },
        });
        s.addText(ch.series.title, {
          x: ch.x + 0.1, y: chartY + 0.02, w: 3.8, h: 0.22,
          fontSize: 10, bold: true, color: PPC.white, fontFace: FONT,
        });
        s.addText(ch.series.subtitle, {
          x: ch.x + 0.1, y: chartY + 0.2, w: 3.8, h: 0.18,
          fontSize: 8, color: 'F5E6A8', fontFace: FONT,
        });
        if (!ch.series.items.length) {
          s.addText('—', {
            x: ch.x, y: chartY + 1.6, w: 4, h: 0.3,
            align: 'center', color: PPC.muted, fontSize: 12, fontFace: FONT,
          });
          continue;
        }
        if (ch.mode === 'exits') {
          const rowH = Math.min(0.72, 2.9 / Math.max(ch.series.items.length, 1));
          ch.series.items.forEach((it, i) => {
            const y = chartY + 0.55 + i * rowH;
            s.addText(it.label, {
              x: ch.x + 0.12, y, w: 1.15, h: 0.22,
              fontSize: 9, bold: true, color: PPC.ink, fontFace: FONT, valign: 'middle',
            });
            const trackX = ch.x + 1.3;
            const trackW = 1.85;
            s.addShape('rect', {
              x: trackX, y: y + 0.05, w: trackW, h: 0.12,
              fill: { color: PPC.panel }, line: { color: PPC.panel },
            });
            const fillW = Math.max(0.04, (Math.min(100, it.pct) / 100) * trackW);
            s.addShape('rect', {
              x: trackX, y: y + 0.05, w: fillW, h: 0.12,
              fill: { color: PPC.red }, line: { color: PPC.red },
            });
            s.addText(`${it.pct}%`, {
              x: ch.x + 3.2, y, w: 0.7, h: 0.22,
              fontSize: 10, bold: true, color: PPC.ink, fontFace: FONT,
              align: 'right', valign: 'middle',
            });
            s.addText(it.ratioLabel || String(it.value), {
              x: ch.x + 0.12, y: y + 0.26, w: 3.75, h: 0.2,
              fontSize: 8, bold: false, color: PPC.muted, fontFace: FONT,
              align: 'right', valign: 'middle',
            });
          });
        } else {
          s.addChart(
            'bar',
            [
              {
                name: ch.series.title,
                labels: ch.series.items.map((i) => i.label),
                values: ch.series.items.map((i) => i.pct),
              },
            ],
            {
              x: ch.x + 0.1,
              y: chartY + 0.5,
              w: 3.8,
              h: 2.85,
              barGrouping: 'clustered',
              showValue: true,
              showLegend: false,
              showTitle: false,
              chartColors: [ch.color === PPC.black ? PPC.muted : PPC.red] as string[],
              valAxisMaxVal: 100,
              valAxisMinVal: 0,
              catAxisLabelColor: PPC.ink,
              catAxisLabelFontSize: 7,
              valAxisLabelFontSize: 7,
            },
          );
        }
      }
    }

    {
      const s = pptx.addSlide();
      await paintSlideCanvas(s, assets);
      addChrome(s, 'OVERTIME — Hours', '', period, '04');

      const bodyY = 0.88;
      const leftX = 0.35;
      const leftW = 4.6;
      const blockH = 6.35;
      whiteBlock(s, leftX, bodyY, leftW, blockH);

      const headerRow = [
        {
          text: 'Department',
          options: { bold: true, color: PPC.white, fill: { color: PPC.black }, align: 'left' as const, fontSize: 12 },
        },
        {
          text: ot.monthLabel,
          options: {
            bold: true,
            color: PPC.white,
            fill: { color: PPC.red },
            align: 'right' as const,
            fontSize: 12,
          },
        },
      ];
      const dataRows = ot.rows.map((r, ri) => {
        const fill = ri % 2 === 0 ? PPC.white : PPC.panel;
        return [
          { text: r.department, options: { color: PPC.ink, fill: { color: fill }, align: 'left' as const, fontSize: 12, bold: true } },
          {
            text: formatOtHours(r.monthHours),
            options: { color: PPC.ink, fill: { color: fill }, align: 'right' as const, fontSize: 12, bold: true },
          },
        ];
      });
      const totalRow = [
        {
          text: 'Total',
          options: { bold: true, color: PPC.white, fill: { color: PPC.black }, align: 'left' as const, fontSize: 13 },
        },
        {
          text: formatOtHours(ot.totalMonthHours),
          options: { bold: true, color: PPC.white, fill: { color: PPC.black }, align: 'right' as const, fontSize: 13 },
        },
      ];
      const tableRows = 1 + ot.rows.length + 1;
      const tableH = blockH - 0.22;
      const rowH = tableH / tableRows;
      s.addTable([headerRow, ...dataRows, totalRow], {
        x: leftX + 0.1,
        y: bodyY + 0.1,
        w: leftW - 0.2,
        colW: [2.9, 1.4],
        rowH,
        border: TABLE_BORDER,
        fontFace: FONT,
        valign: 'middle',
      });

      whiteBlock(s, 5.15, bodyY, 7.7, blockH);
      s.addShape('rect', {
        x: 5.15, y: bodyY, w: 7.7, h: 0.42,
        fill: { color: PPC.black }, line: { color: PPC.black },
      });
      s.addText(`Overtime — ${ot.monthLabel} hours per Department`, {
        x: 5.25, y: bodyY + 0.05, w: 7.5, h: 0.32,
        fontSize: 13, bold: true, color: PPC.white, fontFace: FONT, valign: 'middle',
      });

      const chartAreaX = 5.22;
      const chartAreaW = 7.56;
      const chartTop = bodyY + 0.48;
      const chartH = blockH - 0.55;
      const n = Math.max(ot.rows.length, 1);
      const colW = chartAreaW / n;
      // Réserver l’espace au-dessus des barres pour les labels (ex. Engineering)
      const labelH = 0.22;
      const labelPad = 0.04;
      const axisH = 0.55;
      const plotTop = chartTop + labelH + labelPad;
      const barMaxH = Math.max(0.8, chartH - axisH - labelH - labelPad);
      const barGap = 0.06;
      ot.rows.forEach((row, i) => {
        const x = chartAreaX + i * colW;
        const hours = row.monthHours || 0;
        const barH = hours > 0
          ? Math.max(0.1, (hours / ot.maxMonthHours) * barMaxH)
          : 0.05;
        const barY = plotTop + barMaxH - barH;
        const barW = Math.max(0.22, colW - barGap);
        const barX = x + (colW - barW) / 2;
        s.addText(formatOtHoursShort(row.monthHours), {
          x, y: barY - labelH - 0.02, w: colW, h: labelH,
          align: 'center', fontSize: 8, bold: true, color: PPC.ink, fontFace: FONT,
          wrap: false,
        });
        s.addShape('rect', {
          x: barX,
          y: barY,
          w: barW,
          h: barH,
          fill: { color: '5A5A66' },
          line: { color: '5A5A66' },
        });
        // Libellés courts + une ligne → plus de chevauchement
        s.addText(otChartDeptLabel(row.department), {
          x, y: plotTop + barMaxH + 0.08, w: colW, h: 0.4,
          align: 'center', fontSize: 8, bold: true, color: PPC.ink, fontFace: FONT,
          wrap: false, valign: 'top',
        });
      });
    }
  }

  // —— OT vs Leave Balance (2 slides · rouge) ——
  {
    const vs = buildOtVsLeaveSlideData(report);
    const redHeader = (label: string, align?: 'left' | 'right') => ({
      text: label,
      options: {
        bold: true,
        color: PPC.white,
        fill: { color: PPC.red },
        align: (align || 'left') as 'left' | 'right',
        fontSize: 9,
        wrap: false,
      },
    });

    // Slide A — Overview + DEPT
    {
      const s = pptx.addSlide();
      await paintSlideCanvas(s, assets);
      addChrome(s, 'Overtime vs Leave Balance', '', period, '05');
      whiteBlock(s, 0.28, 0.88, 12.75, 6.35);

      s.addText(`General Overview — ${vs.periodLabel}`, {
        x: 0.4, y: 1.05, w: 6.1, h: 0.28,
        fontSize: 13, bold: true, color: PPC.red, fontFace: FONT,
      });
      const overviewHeader = [
        redHeader('Indicator'),
        redHeader('Value', 'right'),
      ];
      const overviewRows = vs.overviewLines.map((l, ri) => {
        const fill = ri % 2 === 0 ? PPC.white : PPC.panel;
        return [
          { text: l.text, options: { fill: { color: fill }, fontSize: 11, bold: true } },
          {
            text: l.value,
            options: {
              align: 'right' as const,
              fill: { color: fill },
              fontSize: 11,
              bold: true,
              color: PPC.red,
            },
          },
        ];
      });
      if (overviewRows.length) {
        s.addTable([overviewHeader, ...overviewRows], {
          x: 0.4,
          y: 1.65,
          w: 6.0,
          colW: [3.85, 2.15],
          border: TABLE_BORDER,
          fontFace: FONT,
          fontSize: 11,
          valign: 'middle',
        });
      }

      s.addText('Overtime vs Leave Balance per DEPT', {
        x: 6.8, y: 1.3, w: 6.1, h: 0.28,
        fontSize: 13, bold: true, color: PPC.red, fontFace: FONT,
      });
      const deptHeader = [
        redHeader('DPT'),
        redHeader('Hours', 'right'),
        redHeader('Cost', 'right'),
        redHeader('Leave', 'right'),
      ];
      const deptRows = vs.deptCross.map((r, ri) => {
        const fill = ri % 2 === 0 ? PPC.white : PPC.panel;
        return [
          { text: r.department, options: { fill: { color: fill }, fontSize: 11 } },
          { text: r.hours, options: { align: 'right' as const, fill: { color: fill }, fontSize: 11 } },
          { text: r.cost, options: { align: 'right' as const, fill: { color: fill }, fontSize: 11 } },
          { text: r.leave, options: { align: 'right' as const, fill: { color: fill }, fontSize: 11 } },
        ];
      });
      if (deptRows.length) {
        s.addTable([deptHeader, ...deptRows], {
          x: 6.8,
          y: 1.65,
          w: 6.1,
          colW: [2.6, 1.15, 1.25, 1.1],
          border: TABLE_BORDER,
          fontFace: FONT,
          fontSize: 10,
          valign: 'middle',
        });
      }
    }

    // Slide B — Top 15 OT + Top 15 Leave (top 10 en fond rouge, une ligne / cellule)
    {
      const s = pptx.addSlide();
      await paintSlideCanvas(s, assets);
      addChrome(s, 'Top 15 — OT & Leave', '', period, '05');
      whiteBlock(s, 0.28, 0.88, 12.75, 6.35);

      s.addText('Top 15 — Overtime & Leave Balance', {
        x: 0.5, y: 0.98, w: 12.3, h: 0.28,
        fontSize: 14, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
        align: 'center', valign: 'middle',
      });

      const cell = (
        text: string,
        opts: {
          fill: string;
          color: string;
          bold?: boolean;
          align?: 'left' | 'right';
          fontSize?: number;
        },
      ) => ({
        text,
        options: {
          fill: { color: opts.fill },
          color: opts.color,
          bold: opts.bold,
          align: opts.align || ('left' as const),
          fontSize: opts.fontSize ?? 8,
          wrap: false,
          valign: 'middle' as const,
        },
      });

      const empHeader = [
        redHeader('ID'),
        redHeader('Names'),
        redHeader('Hrs', 'right'),
        redHeader('Cost', 'right'),
        redHeader('Leave', 'right'),
        redHeader('DPT'),
      ];
      const toEmpRows = (list: typeof vs.otTop) =>
        list.map((r, ri) => {
          const isTop10 = ri < 10;
          const fill = isTop10 ? PPC.redTop : ri % 2 === 0 ? PPC.white : PPC.panel;
          const color = isTop10 ? PPC.redDark : PPC.ink;
          return [
            cell(r.id, { fill, color, bold: isTop10, fontSize: 7 }),
            cell(r.name, { fill, color, bold: isTop10, fontSize: 7 }),
            cell(r.hours, { fill, color, bold: isTop10, align: 'right', fontSize: 7 }),
            cell(r.cost, { fill, color, bold: isTop10, align: 'right', fontSize: 7 }),
            cell(r.leave, { fill, color, bold: isTop10, align: 'right', fontSize: 7 }),
            cell(r.department, { fill, color, bold: isTop10, fontSize: 7 }),
          ];
        });

      const dataCount = Math.max(vs.otTop.length, vs.leaveTop.length, 1);
      const tableTop = 1.55;
      const tableH = 5.5;
      const tableRowH = tableH / (dataCount + 1);
      const colW = [0.95, 1.85, 0.7, 0.9, 0.65, 1.1];

      s.addText('Overtime – Top 15 (Top 10 in red)', {
        x: 0.45, y: 1.28, w: 6.2, h: 0.24,
        fontSize: 11, bold: true, color: PPC.red, fontFace: FONT_TITLE,
      });
      s.addTable([empHeader, ...toEmpRows(vs.otTop)], {
        x: 0.45,
        y: tableTop,
        w: 6.15,
        colW,
        rowH: tableRowH,
        border: TABLE_BORDER,
        fontFace: FONT,
        fontSize: 7,
        valign: 'middle',
      });

      s.addText('Leave Balance – Top 15 (Top 10 in red)', {
        x: 6.8, y: 1.28, w: 6.2, h: 0.24,
        fontSize: 11, bold: true, color: PPC.red, fontFace: FONT_TITLE,
      });
      s.addTable([empHeader, ...toEmpRows(vs.leaveTop)], {
        x: 6.8,
        y: tableTop,
        w: 6.15,
        colW,
        rowH: tableRowH,
        border: TABLE_BORDER,
        fontFace: FONT,
        fontSize: 7,
        valign: 'middle',
      });
    }
  }

  // —— Training Dashboard ——
  {
    const tr = buildTrainingSlideData(report);
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'Training Dashboard', '', period, '06');
    whiteBlock(s, 0.28, 0.92, 12.75, 6.3);

    // Budget card
    s.addShape('roundRect', {
      x: 0.35, y: 0.85, w: 4.0, h: 1.85,
      fill: { color: '4A4A55' }, line: { color: '4A4A55' }, rectRadius: 0.08,
    });
    s.addText('Training Budget', {
      x: 0.5, y: 0.95, w: 3.7, h: 0.28,
      fontSize: 12, bold: true, color: PPC.white, fontFace: FONT,
    });
    s.addText(tr.budget, {
      x: 0.5, y: 1.28, w: 3.7, h: 0.4,
      fontSize: 22, bold: true, color: PPC.white, fontFace: FONT,
    });
    s.addText(`> ${tr.plantPct} Plant    > ${tr.hqPct} HQ`, {
      x: 0.5, y: 1.7, w: 3.7, h: 0.24,
      fontSize: 11, color: PPC.white, fontFace: FONT,
    });
    s.addShape('roundRect', {
      x: 0.5, y: 2.1, w: 3.7, h: 0.42,
      fill: { color: PPC.white }, line: { color: PPC.white }, rectRadius: 0.05,
    });
    s.addText(`Actual: ${tr.actual}`, {
      x: 0.55, y: 2.14, w: 3.6, h: 0.34,
      fontSize: 13, bold: true, color: PPC.red, fontFace: FONT, valign: 'middle',
    });

    // Hours card
    s.addShape('roundRect', {
      x: 4.55, y: 0.85, w: 4.0, h: 1.85,
      fill: { color: PPC.red }, line: { color: PPC.red }, rectRadius: 0.08,
    });
    s.addText('Training Hours', {
      x: 4.7, y: 0.95, w: 3.7, h: 0.28,
      fontSize: 12, bold: true, color: PPC.white, fontFace: FONT,
    });
    s.addText(tr.hoursYtd, {
      x: 4.7, y: 1.28, w: 3.7, h: 0.4,
      fontSize: 20, bold: true, color: PPC.white, fontFace: FONT,
    });
    s.addText(`> ${tr.plantPct} Plant    > ${tr.hqPct} HQ`, {
      x: 4.7, y: 1.7, w: 3.7, h: 0.24,
      fontSize: 11, color: PPC.white, fontFace: FONT,
    });
    s.addShape('roundRect', {
      x: 4.7, y: 2.1, w: 3.7, h: 0.42,
      fill: { color: PPC.white }, line: { color: PPC.white }, rectRadius: 0.05,
    });
    s.addText(`Average per Employee: ${tr.avgHoursPerEmp}`, {
      x: 4.75, y: 2.14, w: 3.6, h: 0.34,
      fontSize: 12, bold: true, color: PPC.ink, fontFace: FONT, valign: 'middle',
    });

    // Topics covered
    s.addShape('roundRect', {
      x: 8.75, y: 0.85, w: 4.2, h: 1.85,
      fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.08,
    });
    s.addShape('rect', {
      x: 8.75, y: 0.85, w: 4.2, h: 0.36,
      fill: { color: PPC.red }, line: { color: PPC.red },
    });
    s.addText('Topics Covered', {
      x: 8.9, y: 0.88, w: 3.0, h: 0.3,
      fontSize: 12, bold: true, color: PPC.white, fontFace: FONT,
    });
    s.addText(String(tr.topicsCount), {
      x: 11.9, y: 0.88, w: 0.9, h: 0.3,
      fontSize: 14, bold: true, color: PPC.white, fontFace: FONT, align: 'right',
    });
    tr.skillBars.forEach((b, i) => {
      const y = 1.35 + i * 0.4;
      s.addText(b.label, {
        x: 8.9, y, w: 2.4, h: 0.2,
        fontSize: 9, color: PPC.ink, fontFace: FONT,
      });
      s.addText(`${b.pct}%`, {
        x: 11.9, y, w: 0.85, h: 0.2,
        fontSize: 9, bold: true, color: PPC.ink, fontFace: FONT, align: 'right',
      });
      s.addShape('rect', {
        x: 8.9, y: y + 0.2, w: 3.85, h: 0.1,
        fill: { color: PPC.panel }, line: { color: PPC.panel },
      });
      s.addShape('rect', {
        x: 8.9, y: y + 0.2, w: Math.max(0.05, (3.85 * b.pct) / 100), h: 0.1,
        fill: { color: i === 0 ? '5A5A66' : i === 1 ? '8A8A96' : 'B8B8C0' },
        line: { color: i === 0 ? '5A5A66' : i === 1 ? '8A8A96' : 'B8B8C0' },
      });
    });

    // Cost per month
    s.addText('COST PER MONTH (USD)', {
      x: 0.35, y: 2.9, w: 8.2, h: 0.26,
      fontSize: 12, bold: true, color: PPC.ink, fontFace: FONT,
    });
    const costHead = [
      { text: '', options: { bold: true, color: PPC.white, fill: { color: PPC.black } } },
      ...tr.costMonths.map((m) => ({
        text: m.label,
        options: { bold: true, color: PPC.white, fill: { color: PPC.black }, align: 'center' as const, fontSize: 7 },
      })),
    ];
    const hqRow = [
      { text: 'HQ', options: { bold: true, fill: { color: PPC.redSoft }, color: PPC.red } },
      ...tr.costMonths.map((m) => ({
        text: m.hq,
        options: { align: 'center' as const, fill: { color: PPC.panel }, fontSize: 7 },
      })),
    ];
    const plantRow = [
      { text: 'Plant', options: { bold: true, fill: { color: PPC.white } } },
      ...tr.costMonths.map((m) => ({
        text: m.plant,
        options: { align: 'center' as const, fill: { color: PPC.white }, fontSize: 7 },
      })),
    ];
    s.addTable([costHead, hqRow, plantRow], {
      x: 0.35,
      y: 3.2,
      w: 8.2,
      colW: [0.7, ...tr.costMonths.map(() => 7.5 / Math.max(tr.costMonths.length, 1))],
      border: TABLE_BORDER,
      fontFace: FONT,
      fontSize: 7,
      valign: 'middle',
    });

    // Upcoming
    s.addShape('roundRect', {
      x: 0.35, y: 4.35, w: 8.2, h: 2.55,
      fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.06,
    });
    s.addShape('rect', {
      x: 0.35, y: 4.35, w: 8.2, h: 0.34,
      fill: { color: PPC.black }, line: { color: PPC.black },
    });
    s.addText('Upcoming Training Sessions', {
      x: 0.5, y: 4.38, w: 7.9, h: 0.28,
      fontSize: 12, bold: true, color: PPC.white, fontFace: FONT,
    });
    s.addText(
      tr.upcoming.length
        ? tr.upcoming.slice(0, 8).map((t) => `• ${t}`).join('\n')
        : '—',
      {
        x: 0.55, y: 4.8, w: 7.8, h: 1.95,
        fontSize: 12, color: PPC.ink, fontFace: FONT, valign: 'top',
      },
    );

    // Covered list
    s.addShape('roundRect', {
      x: 8.75, y: 2.9, w: 4.2, h: 4.0,
      fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.06,
    });
    s.addShape('rect', {
      x: 8.75, y: 2.9, w: 4.2, h: 0.34,
      fill: { color: PPC.red }, line: { color: PPC.red },
    });
    s.addText('List of Training Covered', {
      x: 8.9, y: 2.93, w: 3.9, h: 0.28,
      fontSize: 11, bold: true, color: PPC.white, fontFace: FONT,
    });
    const coveredRows = (tr.covered.length ? tr.covered : ['—']).slice(0, 20).map((t, i) => [
      {
        text: String(i + 1),
        options: {
          fill: { color: i % 2 ? PPC.panel : PPC.white },
          align: 'right' as const,
          fontSize: 8,
        },
      },
      {
        text: t,
        options: { fill: { color: i % 2 ? PPC.panel : PPC.white }, fontSize: 8 },
      },
    ]);
    s.addTable(coveredRows, {
      x: 8.85,
      y: 3.35,
      w: 4.0,
      colW: [0.4, 3.6],
      border: { pt: 0, color: PPC.white },
      fontFace: FONT,
      fontSize: 8,
      valign: 'middle',
    });
  }

  // —— CSR & Cahier (1 slide) ——
  {
    const csr = buildCsrSlideData(report);
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'CSR & Specifications', '', period, '07');
    whiteBlock(s, 0.28, 0.92, 12.75, 6.3);

    csr.kpis.forEach((k, i) => {
      const x = 0.35 + (i % 6) * 2.15;
      kpiCard(s, x, 0.95, 2.05, 1.05, k.label, k.value);
    });

    s.addText('Breakdown by type', {
      x: 0.4, y: 2.2, w: 6, h: 0.28,
      fontSize: 13, bold: true, color: PPC.red, fontFace: FONT,
    });
    if (csr.byTypePie.length) {
      s.addChart(
        'doughnut',
        [
          {
            name: 'Type',
            labels: csr.byTypePie.map((p) => p.label),
            values: csr.byTypePie.map((p) => p.value),
          },
        ],
        {
          x: 0.5,
          y: 2.5,
          w: 5.8,
          h: 4.3,
          showPercent: true,
          showLegend: true,
          legendPos: 'b',
          showTitle: false,
          chartColors: csr.byTypePie.map((p) => p.color.replace('#', '')),
        },
      );
    } else {
      s.addText('No type breakdown available.', {
        x: 0.5, y: 3.5, w: 5.5, h: 0.4, fontSize: 12, color: PPC.muted, fontFace: FONT,
      });
    }

    s.addText('Breakdown by sector', {
      x: 6.8, y: 2.2, w: 6, h: 0.28,
      fontSize: 13, bold: true, color: PPC.red, fontFace: FONT,
    });
    if (csr.bySecteurPie.length) {
      s.addChart(
        'doughnut',
        [
          {
            name: 'Sector',
            labels: csr.bySecteurPie.map((p) => p.label),
            values: csr.bySecteurPie.map((p) => p.value),
          },
        ],
        {
          x: 6.9,
          y: 2.5,
          w: 5.8,
          h: 4.3,
          showPercent: true,
          showLegend: true,
          legendPos: 'b',
          showTitle: false,
          chartColors: csr.bySecteurPie.map((p) => p.color.replace('#', '')),
        },
      );
    } else {
      s.addText('No sector breakdown available.', {
        x: 6.9, y: 3.5, w: 5.5, h: 0.4, fontSize: 12, color: PPC.muted, fontFace: FONT,
      });
    }
  }

  // —— CSR – FY27 table ——
  {
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'CSR – FY27', '', period, '07');
    whiteBlock(s, 0.28, 0.92, 12.75, 6.3);
    addCsrFy27Table(s, resolveCsrFy27Rows(report.overlays));
    s.addText('Blue text = latest update', {
      x: 9.2, y: 0.48, w: 3.7, h: 0.18,
      fontSize: 9, color: CSR_UPDATE_COLOR, fontFace: FONT, align: 'right', italic: true,
    });
  }

  // —— Cahier des Charges ——
  {
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'Cahier des Charges', '', period, '07');
    whiteBlock(s, 0.28, 0.92, 12.75, 6.3);
    addCahierHighlights(s, resolveCahierHighlights(report.overlays));
  }

  // —— Recruitment ——
  {
    const all = resolveRecruitment(o);
    const repl = all.filter((r) => r.category === 'replacement');
    const neu = all.filter((r) => r.category === 'new');
    const headers = ['Position', 'Grades', 'Status', 'Comments', 'Budgeted', 'Department', 'Location', 'Contract type'];
    const colW = [1.85, 0.7, 0.95, 3.35, 0.85, 1.55, 1.55, 1.2];
    const head = headers.map(recHeaderCell);
    const mapRows = (rows: typeof repl) =>
      rows.map((r, i) => {
        const fill = i % 2 ? 'F4F6FA' : PPC.white;
        return [
          recMarkupCell(r.position, fill, { bold: true }),
          recMarkupCell(r.grade, fill, { align: 'center' }),
          recMarkupCell(r.status, fill, { align: 'center' }),
          recMarkupCell(r.comments, fill),
          recMarkupCell(r.budgeted, fill, { align: 'center' }),
          recMarkupCell(r.department, fill),
          recMarkupCell(r.location, fill),
          recMarkupCell(r.contractType, fill, { align: 'center' }),
        ];
      });
    const empty = [headers.map(() => recMarkupCell('—', PPC.white))];
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'Recruitment – FY27', '', period, '08');
    whiteBlock(s, 0.28, 0.92, 12.75, 6.3);
    s.addText('Blue text = latest update', {
      x: 8.6, y: 0.96, w: 4.2, h: 0.2,
      fontSize: 9, italic: true, color: CSR_UPDATE_COLOR, fontFace: FONT, align: 'right',
    });
    s.addText('1. Replacements', {
      x: 0.4, y: 0.96, w: 8, h: 0.2, fontSize: 12, bold: true, color: PPC.red, fontFace: FONT,
    });
    const rowH = 0.205;
    s.addTable([head, ...(mapRows(repl).length ? mapRows(repl) : empty)], {
      x: 0.36, y: 1.16, w: 12.6, colW, rowH,
      border: { pt: 0.3, color: PPC.white },
      fontFace: FONT,
      valign: 'middle',
    });
    const newY = 1.16 + rowH * (1 + Math.max(repl.length, 1)) + 0.08;
    s.addText('2. New positions', {
      x: 0.4, y: newY, w: 8, h: 0.2, fontSize: 12, bold: true, color: PPC.red, fontFace: FONT,
    });
    s.addTable([head, ...(mapRows(neu).length ? mapRows(neu) : empty)], {
      x: 0.36, y: newY + 0.2, w: 12.6, colW, rowH,
      border: { pt: 0.3, color: PPC.white },
      fontFace: FONT,
      valign: 'middle',
    });
  }

  // —— Internal AUDIT (Audit points) ——
  {
    const rows = buildInternalAuditRows(report);
    const sum = summarizeInternalAudit(rows);
    const gov = buildGouvernanceSlideData(report);
    const closedPct = gov.auditClosedPct || sum.closedPct;
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'Internal AUDIT', '', period, '09');
    whiteBlock(s, 0.28, 0.92, 12.75, 6.3);
    s.addText(`${closedPct}%`, {
      x: 0.4, y: 0.98, w: 1.6, h: 0.36,
      fontSize: 22, bold: true, color: PPC.red, fontFace: FONT_TITLE,
    });
    s.addText('Closed', {
      x: 0.4, y: 1.32, w: 1.6, h: 0.18,
      fontSize: 9, color: PPC.muted, fontFace: FONT,
    });
    s.addText(
      `${gov.auditClosed || sum.closed}/${gov.auditTotal || sum.total} points  ·  Overdue ${sum.overdue}  ·  On going ${sum.ongoing}`,
      {
        x: 2.1, y: 1.08, w: 10.6, h: 0.28,
        fontSize: 11, color: PPC.ink, fontFace: FONT, valign: 'middle',
      },
    );
    const header = ['ID', 'Findings', 'Severity', 'Status', 'Comments', 'Due Date'].map((h) => ({
      text: h,
      options: {
        fill: { color: CSR_FY27_HEADER },
        color: PPC.white,
        bold: true,
        fontSize: 8,
        align: 'center' as const,
        valign: 'middle' as const,
      },
    }));
    const body = rows.map((row, i) => {
      const fill = auditStatusFill(row, i % 2 === 1);
      const statusColor = auditStatusColor(row.status);
      const cell = (text: string, opts?: { bold?: boolean; color?: string; align?: 'left' | 'center' }) => ({
        text: text || '—',
        options: {
          fill: { color: fill },
          color: opts?.color || PPC.ink,
          bold: Boolean(opts?.bold),
          fontSize: 7,
          fontFace: FONT,
          align: opts?.align || 'left',
          valign: 'middle' as const,
          wrap: true,
          margin: [3, 3, 3, 3] as [number, number, number, number],
        },
      });
      return [
        cell(row.number, { bold: true, align: 'center' }),
        cell(row.finding),
        cell(row.severity, { bold: true, color: auditSeverityColor(row.severity), align: 'center' }),
        cell(row.status, { bold: true, color: statusColor, align: 'center' }),
        cell(row.comments),
        cell(row.dueDateLabel, { align: 'center' }),
      ];
    });
    s.addTable([header, ...(body.length ? body : [[
      { text: 'No audit points', options: { fill: { color: PPC.white }, color: PPC.muted, fontSize: 9, align: 'center' as const } },
      { text: '', options: { fill: { color: PPC.white } } },
      { text: '', options: { fill: { color: PPC.white } } },
      { text: '', options: { fill: { color: PPC.white } } },
      { text: '', options: { fill: { color: PPC.white } } },
      { text: '', options: { fill: { color: PPC.white } } },
    ]])], {
      x: 0.36,
      y: 1.55,
      w: 12.58,
      colW: [0.5, 5.7, 1.15, 1.2, 2.55, 1.48],
      border: { pt: 0.4, color: PPC.white },
      fontFace: FONT,
      valign: 'middle',
    });
  }

  // —— Governance — Audit progression chart ——
  {
    const gov = buildGouvernanceSlideData(report);
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    addChrome(s, 'Governance — Audit', '', period, '09');

    s.addShape('roundRect', {
      x: 0.3, y: 0.95, w: 8.35, h: 5.95,
      fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.1,
    });
    s.addText('Progression cumulative % Closed', {
      x: 0.5, y: 1.1, w: 7.9, h: 0.35,
      fontSize: 15, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
    });

    if (gov.progression.length) {
      const plotX = 0.7;
      const plotY = 1.6;
      const plotW = 7.7;
      const plotH = 4.7;
      const ticks = [0, 25, 50, 75, 100];
      for (const t of ticks) {
        const y = plotY + plotH - (t / 100) * plotH;
        s.addShape('line', {
          x: plotX, y, w: plotW, h: 0,
          line: { color: PPC.line, pt: 0.75, dashType: 'dash' },
        });
        s.addText(`${t}%`, {
          x: 0.28, y: y - 0.1, w: 0.4, h: 0.2,
          fontSize: 9, color: PPC.muted, fontFace: FONT, align: 'right',
        });
      }

      const nBars = gov.progression.length;
      const colW = plotW / nBars;
      const barW = Math.min(0.58, colW * 0.82);
      gov.progression.forEach((p, i) => {
        const pct = Math.min(100, Math.max(0, p.closedPct));
        const barH = Math.max(0, (pct / 100) * plotH);
        const cx = plotX + i * colW + colW / 2;
        const color = '0D9488';
        if (barH > 0.02) {
          s.addShape('roundRect', {
            x: cx - barW / 2,
            y: plotY + plotH - barH,
            w: barW,
            h: barH,
            fill: { color },
            line: { color, pt: 0 },
            rectRadius: 0.04,
          });
        }
        if (!p.isFuture) {
          s.addText(`${p.closedPct}%`, {
            x: cx - colW / 2,
            y: plotY + plotH - barH - 0.24,
            w: colW,
            h: 0.22,
            fontSize: 10,
            bold: true,
            color: PPC.ink,
            fontFace: FONT_TITLE,
            align: 'center',
          });
        }
        s.addText(p.label, {
          x: cx - colW / 2,
          y: plotY + plotH + 0.06,
          w: colW,
          h: 0.24,
          fontSize: 10,
          bold: p.isCurrent,
          color: p.isCurrent ? PPC.ink : PPC.muted,
          fontFace: FONT,
          align: 'center',
        });
      });
    } else {
      s.addText('No progression data.', {
        x: 0.7, y: 3.5, w: 7, h: 0.4, fontSize: 13, color: PPC.muted, fontFace: FONT,
      });
    }

    s.addShape('roundRect', {
      x: 8.85, y: 0.95, w: 4.15, h: 5.95,
      fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.1,
    });
    s.addText('Evolution', {
      x: 9.05, y: 1.15, w: 3.8, h: 0.35,
      fontSize: 14, bold: true, color: PPC.red, fontFace: FONT_TITLE,
    });
    s.addText(`${gov.auditClosedPct}% Closed`, {
      x: 9.05, y: 1.55, w: 3.8, h: 0.4,
      fontSize: 26, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
    });
    s.addText(`${gov.auditClosed} / ${gov.auditTotal} points`, {
      x: 9.05, y: 2.0, w: 3.8, h: 0.28,
      fontSize: 13, color: PPC.muted, fontFace: FONT,
    });
    s.addText(gov.evolutionText, {
      x: 9.05, y: 2.5, w: 3.75, h: 4.1,
      fontSize: 13, color: PPC.ink, fontFace: FONT, valign: 'top',
    });
  }

  // —— Thank You ——
  {
    const s = pptx.addSlide();
    await paintSlideCanvas(s, assets);
    s.addShape('rect', {
      x: 0, y: 0, w: W, h: 0.07,
      fill: { color: PPC.red }, line: { color: PPC.red },
    });
    s.addShape('rect', {
      x: 0, y: H - 0.09, w: W, h: 0.09,
      fill: { color: PPC.black }, line: { color: PPC.black },
    });

    whiteBlock(s, 1.8, 1.6, 9.7, 4.2);

    s.addText('PPC · HR EXCO', {
      x: 1.8, y: 2.15, w: 9.7, h: 0.35,
      fontSize: 14, bold: true, color: PPC.red, fontFace: FONT,
      align: 'center',
    });
    const thankMsg = (o.narrative?.thankYouMessage || 'Thank You').trim() || 'Thank You';
    s.addText(thankMsg, {
      x: 1.8, y: 2.7, w: 9.7, h: 0.85,
      fontSize: 54, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
      align: 'center', valign: 'middle',
    });
    s.addShape('rect', {
      x: 5.9, y: 3.7, w: 1.5, h: 0.06,
      fill: { color: PPC.red }, line: { color: PPC.red },
    });
    s.addText(period, {
      x: 1.8, y: 4.15, w: 9.7, h: 0.35,
      fontSize: 16, color: PPC.muted, fontFace: FONT,
      align: 'center',
    });
  }

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
