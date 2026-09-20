import 'server-only';

import PptxGenJS from 'pptxgenjs';
import { buildExportDateStamp } from './employee-filters';
import {
  recruitmentBudgetTone,
  recruitmentContractTone,
  recruitmentStatusTone,
  recruitmentToneFill,
} from './exco-recruitment-fy27';
import { parseCsrUpdateMarkup, CSR_UPDATE_COLOR } from './exco-csr-fy27';
import { getRecrutementBundle } from './recrutement-store';
import { groupRecrutementByLocation, sortRecrutementByLocation } from './recrutement-location-groups';
import type { RecrutementDashboard, RecrutementRowEnriched } from './recrutement-types';

type Slide = ReturnType<PptxGenJS['addSlide']>;

const PPC = {
  red: 'E30613',
  ink: '16161E',
  muted: '6B6B7A',
  line: 'E0E0E6',
  white: 'FFFFFF',
  slide: 'F3F4F6',
} as const;

const FONT = 'Calibri';
const FONT_TITLE = 'Calibri';
const HEADER_FILL = '1F2A44';
const LOC_BAND_FILL = 'E8EEF7';
const COL_W = [2.15, 0.7, 1.05, 3.0, 0.85, 1.55, 1.35, 1.25];
const HEADERS = ['Position', 'Grade', 'Status', 'Comments', 'Budgeted', 'Department', 'Location', 'Contract'];
/** Dense row height to fill the slide without sparse slides. */
const ROW_H = 0.24;
/** ~22 data rows + location bands fit under the chrome. */
const MAX_ROWS_PER_SLIDE = 20;

function periodLabel(): string {
  return new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function addChrome(slide: Slide, title: string, subtitle: string, period: string, num: string) {
  slide.addShape('rect', {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
  slide.addText(title, {
    x: 0.4, y: 0.22, w: 9, h: 0.36,
    fontSize: 18, bold: true, color: PPC.ink, fontFace: FONT_TITLE, valign: 'middle',
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.4, y: 0.52, w: 8.5, h: 0.22,
      fontSize: 11, color: PPC.muted, fontFace: FONT,
    });
  }
  slide.addText(`${period}  ·  ${num}`, {
    x: 9.2, y: 0.28, w: 3.7, h: 0.28,
    fontSize: 11, color: PPC.muted, align: 'right', fontFace: FONT, valign: 'middle',
  });
}

function recMarkupCell(
  text: string,
  fill: string,
  opts?: { bold?: boolean; align?: 'left' | 'center' },
) {
  const runs = parseCsrUpdateMarkup(String(text || '—') || '—');
  const safeRuns = runs.length
    ? runs
    : [{ text: String(text || '—'), update: false as boolean | undefined }];
  return {
    text: safeRuns.map((run) => ({
      text: run.text || ' ',
      options: {
        color: run.update ? CSR_UPDATE_COLOR : PPC.ink,
        bold: Boolean(opts?.bold || run.update),
        fontSize: 9,
        fontFace: FONT,
      },
    })),
    options: {
      fill: { color: fill },
      align: (opts?.align || 'left') as 'left' | 'center',
      valign: 'middle' as const,
    },
  };
}

function recHeaderCell(text: string) {
  return {
    text,
    options: {
      fill: { color: HEADER_FILL },
      color: PPC.white,
      bold: true,
      fontSize: 9,
      align: 'center' as const,
      valign: 'middle' as const,
      fontFace: FONT,
    },
  };
}

type LocationBandCell = {
  text: string;
  options: {
    fill: { color: string };
    color: string;
    bold: boolean;
    fontSize: number;
    fontFace: string;
    align: 'left';
    valign: 'middle';
    colspan: number;
  };
};
type RecTableCell = ReturnType<typeof recMarkupCell> | LocationBandCell;
type RecTableRow = RecTableCell[];

function locationBandRow(location: string): RecTableRow {
  return [
    {
      text: location,
      options: {
        fill: { color: LOC_BAND_FILL },
        color: PPC.ink,
        bold: true,
        fontSize: 9,
        fontFace: FONT,
        align: 'left' as const,
        valign: 'middle' as const,
        colspan: HEADERS.length,
      },
    },
  ];
}

/** Lignes triées par site, avec bandeau de localisation entre les groupes. */
function mapTableRowsGroupedByLocation(rows: RecrutementRowEnriched[]): RecTableRow[] {
  const sorted = sortRecrutementByLocation(rows);
  const out: RecTableRow[] = [];
  let lastLoc = '';
  let stripe = 0;
  for (const r of sorted) {
    const loc = String(r.location || '').trim() || '—';
    if (loc !== lastLoc) {
      out.push(locationBandRow(loc));
      lastLoc = loc;
      stripe = 0;
    }
    const fill = stripe % 2 ? 'F4F6FA' : PPC.white;
    stripe += 1;
    out.push([
      recMarkupCell(r.position, fill, { bold: true }),
      recMarkupCell(r.grade || '—', fill, { align: 'center' }),
      recMarkupCell(r.status || '—', recruitmentToneFill(recruitmentStatusTone(r.status)), {
        align: 'center',
        bold: true,
      }),
      recMarkupCell(r.comments || '—', fill),
      recMarkupCell(r.budgeted || '—', recruitmentToneFill(recruitmentBudgetTone(r.budgeted)), {
        align: 'center',
        bold: true,
      }),
      recMarkupCell(r.department || '—', fill),
      recMarkupCell(r.location || '—', fill),
      recMarkupCell(r.contractType || '—', recruitmentToneFill(recruitmentContractTone(r.contractType)), {
        align: 'center',
      }),
    ]);
  }
  return out;
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  if (!rows.length) return [[]];
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Découpe en pages en respectant les groupes de localisation
 * (un site n’est pas coupé si tout le groupe tient sur une page).
 */
function chunkByLocationKeepingGroups(
  rows: RecrutementRowEnriched[],
  maxRows: number,
): RecrutementRowEnriched[][] {
  const sorted = sortRecrutementByLocation(rows);
  if (!sorted.length) return [[]];
  const groups: RecrutementRowEnriched[][] = [];
  let currentLoc = '';
  let bucket: RecrutementRowEnriched[] = [];
  for (const row of sorted) {
    const loc = String(row.location || '').trim() || '—';
    if (loc !== currentLoc) {
      if (bucket.length) groups.push(bucket);
      bucket = [row];
      currentLoc = loc;
    } else {
      bucket.push(row);
    }
  }
  if (bucket.length) groups.push(bucket);

  const pages: RecrutementRowEnriched[][] = [];
  let page: RecrutementRowEnriched[] = [];
  let used = 0; // lignes data + bandeaux
  for (const group of groups) {
    const cost = 1 + group.length; // 1 bandeau + lignes
    if (page.length && used + cost > maxRows) {
      pages.push(page);
      page = [];
      used = 0;
    }
    // Groupe trop grand pour une page → découpe interne
    if (cost > maxRows) {
      if (page.length) {
        pages.push(page);
        page = [];
        used = 0;
      }
      for (const part of chunkRows(group, Math.max(1, maxRows - 1))) {
        pages.push(part);
      }
      continue;
    }
    page.push(...group);
    used += cost;
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function kpiCard(slide: Slide, x: number, y: number, label: string, value: number, accent: string = PPC.red) {
  slide.addShape('roundRect', {
    x, y, w: 2.3, h: 1.05,
    fill: { color: PPC.white },
    line: { color: PPC.line, pt: 1 },
    rectRadius: 0.1,
  });
  slide.addShape('rect', {
    x, y, w: 0.08, h: 1.05,
    fill: { color: accent }, line: { color: accent },
  });
  slide.addText(label, {
    x: x + 0.2, y: y + 0.14, w: 1.95, h: 0.28,
    fontSize: 11, color: PPC.muted, fontFace: FONT,
  });
  slide.addText(String(value), {
    x: x + 0.2, y: y + 0.42, w: 1.95, h: 0.48,
    fontSize: 26, bold: true, color: accent, fontFace: FONT_TITLE,
  });
}

function addTableSlide(
  pptx: PptxGenJS,
  title: string,
  section: string,
  rows: RecrutementRowEnriched[],
  period: string,
  num: string,
) {
  const s = pptx.addSlide();
  s.background = { color: PPC.white };
  addChrome(s, title, section, period, num);
  s.addText('Blue text = latest update', {
    x: 8.2, y: 0.78, w: 4.6, h: 0.2,
    fontSize: 9, italic: true, color: CSR_UPDATE_COLOR, fontFace: FONT, align: 'right',
  });
  const head = HEADERS.map(recHeaderCell);
  const body = mapTableRowsGroupedByLocation(rows);
  const empty = [HEADERS.map(() => recMarkupCell('No rows', PPC.white))];
  s.addTable([head, ...(body.length ? body : empty)], {
    x: 0.35, y: 1.0, w: 12.65, colW: COL_W, rowH: ROW_H,
    border: { pt: 0.5, color: 'D1D5DB' },
    fontFace: FONT,
    valign: 'middle',
  });
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === 'done') return 'ok';
  if (s === 'ongoing') return 'warn';
  if (s === 'started') return 'info';
  if (/cancel/.test(s)) return 'bad';
  return 'idle';
}

/**
 * Recruitment PPTX — KPI + 2 groups (Replacements / New positions),
 * locations associated within each table (not one slide per site).
 */
export async function buildRecrutementPptxBuffer(): Promise<{ buffer: Buffer; filename: string }> {
  const bundle = await getRecrutementBundle();
  const period = periodLabel();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'RH PPCB';
  pptx.title = 'Recruitment';

  const d = bundle.dashboard;
  {
    const s = pptx.addSlide();
    s.background = { color: PPC.slide };
    addChrome(s, 'Recruitment', 'Replacements · New positions · Status', period, '01');
    const cards: Array<[string, number, string]> = [
      ['Total', d.total, PPC.red],
      ['Replacements', d.replacements, '0EA5E9'],
      ['New positions', d.newPositions, '7C3AED'],
      ['Ongoing', d.ongoing, 'F59E0B'],
      ['Done', d.done, '16A34A'],
    ];
    cards.forEach(([label, value, accent], i) => {
      kpiCard(s, 0.45 + i * 2.5, 1.2, label, value, accent);
    });
    const second: Array<[string, number]> = [
      ['Started', d.started],
      ['Not started', d.notStarted],
      ['Linked to classification', d.catalogLinked],
      ['Filled (August)', d.filledAugust],
    ];
    second.forEach(([label, value], i) => {
      kpiCard(s, 0.45 + i * 3.15, 2.55, label, value, PPC.ink);
    });
    s.addText('Source: Recruitment module (job classification)', {
      x: 0.45, y: 4.0, w: 12, h: 0.28,
      fontSize: 12, color: PPC.muted, fontFace: FONT,
    });
  }

  const repl = bundle.rows.filter((r) => r.category === 'replacement');
  const neu = bundle.rows.filter((r) => r.category === 'new');
  let slideNo = 2;

  const emitCategory = (categoryLabel: string, categoryIndex: number, rows: RecrutementRowEnriched[]) => {
    const pages = chunkByLocationKeepingGroups(rows, MAX_ROWS_PER_SLIDE);
    for (const [pageIndex, pageRows] of pages.entries()) {
      const page =
        pages.length > 1 ? ` (${pageIndex + 1}/${pages.length})` : '';
      const rowLabel = rows.length === 1 ? '1 row' : `${rows.length} rows`;
      addTableSlide(
        pptx,
        'Recruitment',
        `${categoryIndex}. ${categoryLabel}${page} — ${rowLabel}`,
        pageRows,
        period,
        String(slideNo++).padStart(2, '0'),
      );
    }
  };

  emitCategory('Replacements', 1, repl);
  emitCategory('New positions', 2, neu);

  const out = await pptx.write({ outputType: 'nodebuffer' });
  const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
  return { buffer, filename: `RECRUTEMENT_${buildExportDateStamp()}.pptx` };
}

export async function buildRecrutementPreviewHtml(): Promise<string> {
  const bundle = await getRecrutementBundle();
  const d = bundle.dashboard;
  const rowHtml = (rows: RecrutementRowEnriched[]) =>
    rows
      .map(
        (r) => `<tr>
          <td class="pos">${escapeHtml(r.position)}</td>
          <td class="ctr">${escapeHtml(r.grade || '—')}</td>
          <td class="ctr"><span class="badge ${statusBadgeClass(r.status)}">${escapeHtml(r.status || '—')}</span></td>
          <td>${escapeHtml(r.comments || '—')}</td>
          <td class="ctr">${escapeHtml(r.budgeted || '—')}</td>
          <td>${escapeHtml(r.department || '—')}</td>
          <td>${escapeHtml(r.location || '—')}</td>
          <td class="ctr">${escapeHtml(r.contractType || '—')}</td>
        </tr>`,
      )
      .join('');

  const repl = bundle.rows.filter((r) => r.category === 'replacement');
  const neu = bundle.rows.filter((r) => r.category === 'new');
  const head =
    '<thead><tr><th>Position</th><th>Grade</th><th>Status</th><th>Comments</th><th>Budgeted</th><th>Department</th><th>Location</th><th>Contract</th></tr></thead>';

  const sectionHtml = (title: string, rows: RecrutementRowEnriched[]) => {
    const groups = groupRecrutementByLocation(rows);
    if (!groups.length) {
      return `<div class="card"><h2>${escapeHtml(title)} (0)</h2><p class="empty">No rows</p></div>`;
    }
    const blocks = groups
      .map((g) => {
        return `<div class="loc-block">
          <h3 class="loc-title">${escapeHtml(g.location)} <span>(${g.rows.length})</span></h3>
          <div class="scroll"><table>${head}<tbody>${rowHtml(g.rows)}</tbody></table></div>
        </div>`;
      })
      .join('');
    return `<div class="card">
      <h2>${escapeHtml(title)} (${rows.length})</h2>
      ${blocks}
    </div>`;
  };

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="light only"/>
<title>Recruitment preview</title>
<style>
  html,body{margin:0;padding:0;background:#f3f4f6 !important;color:#16161e !important;color-scheme:light}
  *{box-sizing:border-box}
  body{font-family:Calibri,Segoe UI,system-ui,sans-serif;min-height:100%}
  .wrap{max-width:1180px;margin:0 auto;padding:1rem 1.1rem 2.5rem}
  .hero{background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;padding:1rem 1.15rem;margin-bottom:1rem}
  h1{margin:0;font-size:1.35rem;color:#e30613}
  .muted{color:#6b7280;font-size:.88rem;margin:.25rem 0 0}
  .kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.55rem;margin-top:.9rem}
  .kpi{background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:.7rem .8rem;border-left:4px solid #e30613}
  .kpi:nth-child(2){border-left-color:#0ea5e9}
  .kpi:nth-child(3){border-left-color:#7c3aed}
  .kpi:nth-child(4){border-left-color:#f59e0b}
  .kpi:nth-child(5){border-left-color:#16a34a}
  .kpi span{display:block;font-size:.72rem;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.03em}
  .kpi b{display:block;margin-top:.2rem;font-size:1.45rem;color:#111827}
  .card{background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;margin-bottom:1rem;overflow:visible}
  .card>h2{margin:0;padding:.75rem 1rem;font-size:1rem;color:#e30613;border-bottom:1px solid #f1f5f9;background:#ffffff}
  .loc-block{border-top:1px solid #f1f5f9}
  .loc-block:first-of-type{border-top:0}
  .loc-title{margin:0;padding:.55rem 1rem .35rem;font-size:.88rem;font-weight:700;color:#1f2a44;background:#f8fafc}
  .loc-title span{font-weight:600;color:#6b7280;font-size:.8rem}
  .scroll{overflow:auto;background:#ffffff}
  table{width:100%;border-collapse:collapse;font-size:.8rem;background:#ffffff}
  th{background:#1f2a44;color:#ffffff;padding:.55rem .5rem;text-align:left;white-space:nowrap}
  td{padding:.45rem .5rem;border-bottom:1px solid #eef2f7;vertical-align:top;background:#ffffff;color:#16161e}
  tr:nth-child(even) td{background:#f8fafc}
  td.pos{font-weight:650}
  td.ctr{text-align:center}
  .badge{display:inline-block;padding:.12rem .4rem;border-radius:999px;font-size:.7rem;font-weight:700}
  .badge.ok{background:#dcfce7;color:#166534}
  .badge.warn{background:#ffedd5;color:#9a3412}
  .badge.info{background:#dbeafe;color:#1d4ed8}
  .badge.idle{background:#f4f4f5;color:#52525b}
  .badge.bad{background:#fee2e2;color:#991b1b}
  .empty{padding:1rem;color:#6b7280;background:#ffffff;margin:0}
  @media (max-width:900px){.kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
</style></head><body>
<div class="wrap">
  <div class="hero">
    <h1>Recruitment</h1>
    <p class="muted">Preview — grouped by location (same tables as the PowerPoint export)</p>
    <div class="kpis">
      <div class="kpi"><span>Total</span><b>${d.total}</b></div>
      <div class="kpi"><span>Replacements</span><b>${d.replacements}</b></div>
      <div class="kpi"><span>New positions</span><b>${d.newPositions}</b></div>
      <div class="kpi"><span>Ongoing</span><b>${d.ongoing}</b></div>
      <div class="kpi"><span>Done</span><b>${d.done}</b></div>
    </div>
  </div>
  ${sectionHtml('1. Replacements', repl)}
  ${sectionHtml('2. New positions', neu)}
</div></body></html>`;
}

export type { RecrutementDashboard };
