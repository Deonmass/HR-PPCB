import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { buildTrendsSlideSections } from './exco-trends-slide-data';
import { buildMouvementsSlideData } from './exco-mouvements-slide-data';
import {
  buildOtSlideData,
  buildOtVsLeaveSlideData,
  formatOtHours,
  formatOtHoursShort,
  otChartDeptLabel,
} from './exco-ot-slide-data';
import { buildInternalAuditRows } from './exco-audit-internal';
import { buildTrainingSlideData } from './exco-dashboard-slides-data';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setRunsText(fragment: string, text: string): string {
  if (/<a:t(\s[^>]*)?>/.test(fragment)) {
    let first = true;
    return fragment.replace(/<a:t([^>]*)>([^<]*)<\/a:t>/g, (_full, attrs: string) => {
      if (first) {
        first = false;
        return `<a:t${attrs}>${escapeXml(text)}</a:t>`;
      }
      return `<a:t${attrs}></a:t>`;
    });
  }
  if (!text) return fragment;
  const rPr = `<a:rPr lang="en-US" sz="800" b="1" dirty="0"><a:solidFill><a:srgbClr val="16161E"/></a:solidFill><a:latin typeface="Segoe UI" pitchFamily="34" charset="0"/><a:ea typeface="Segoe UI" pitchFamily="34" charset="-122"/><a:cs typeface="Segoe UI" pitchFamily="34" charset="-120"/></a:rPr>`;
  const run = `<a:r>${rPr}<a:t>${escapeXml(text)}</a:t></a:r>`;
  if (fragment.includes('<a:endParaRPr')) {
    return fragment.replace('<a:endParaRPr', `${run}<a:endParaRPr`);
  }
  return fragment.replace('</a:p>', `${run}</a:p>`);
}

const TREND_HEADER_CURRENT = 'E30613';
const TREND_HEADER_IDLE = '0A0A0A';
const TREND_BODY_CURRENT = 'FCE8E9';
const TREND_BODY_IDLE = 'FFFFFF';
const TREND_TEXT_CURRENT = 'E30613';
const TREND_TEXT_IDLE = '16161E';

function cellFill(tc: string): string {
  const match = tc.match(
    /<a:tcPr[\s\S]*<a:solidFill>\s*<a:srgbClr val="([0-9A-Fa-f]{6})"\s*\/>\s*<\/a:solidFill>\s*<\/a:tcPr>/,
  );
  return (match?.[1] || '').toUpperCase();
}

function setCellFill(tc: string, hex: string): string {
  return tc.replace(
    /(<a:tcPr[\s\S]*<a:solidFill>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}("\s*\/>\s*<\/a:solidFill>\s*<\/a:tcPr>)/,
    `$1${hex}$2`,
  );
}

function setRunColor(tc: string, hex: string): string {
  if (!/<a:r[\s>]/.test(tc)) return tc;
  return tc.replace(
    /(<a:r[\s>][\s\S]*?<a:solidFill>\s*<a:srgbClr val=")[0-9A-Fa-f]{6}(")/,
    `$1${hex}$2`,
  );
}

/** Le modèle Aug-26 surligne août. Le mois du rapport prend cette colonne. */
function paintCurrentMonthColumn(tableXml: string, currentCol: number): string {
  const rows = [...tableXml.matchAll(/<a:tr[\s\S]*?<\/a:tr>/g)];
  const newRows: string[] = [];
  for (let r = 0; r < rows.length; r += 1) {
    const rowXml = rows[r][0];
    const cells = [...rowXml.matchAll(/<a:tc[\s\S]*?<\/a:tc>/g)];
    const parts: string[] = [];
    let last = 0;
    for (let c = 0; c < cells.length; c += 1) {
      const m = cells[c];
      const start = m.index ?? 0;
      parts.push(rowXml.slice(last, start));
      let cell = m[0];
      const fill = cellFill(cell);
      const isHeader = r === 0;
      if (c === currentCol) {
        cell = setCellFill(cell, isHeader ? TREND_HEADER_CURRENT : TREND_BODY_CURRENT);
        if (!isHeader) cell = setRunColor(cell, TREND_TEXT_CURRENT);
      } else if (isHeader && fill === TREND_HEADER_CURRENT) {
        cell = setCellFill(cell, TREND_HEADER_IDLE);
      } else if (!isHeader && fill === TREND_BODY_CURRENT) {
        cell = setCellFill(cell, TREND_BODY_IDLE);
        cell = setRunColor(cell, TREND_TEXT_IDLE);
      }
      parts.push(cell);
      last = start + m[0].length;
    }
    parts.push(rowXml.slice(last));
    newRows.push(parts.join(''));
  }
  const tableParts: string[] = [];
  let tLast = 0;
  for (let r = 0; r < rows.length; r += 1) {
    const m = rows[r];
    const start = m.index ?? 0;
    tableParts.push(tableXml.slice(tLast, start));
    tableParts.push(newRows[r]);
    tLast = start + m[0].length;
  }
  tableParts.push(tableXml.slice(tLast));
  return tableParts.join('');
}

function cellPlain(tcXml: string): string {
  return [...tcXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&amp;/g, '&')
    .trim();
}

/** Remplit la N-ième table (`a:tbl`) avec une matrice [row][col] (y compris header). */
export function fillTableMatrix(
  xml: string,
  tableIndex: number,
  matrix: string[][],
  currentCol?: number | null,
): string {
  const tables = [...xml.matchAll(/<a:tbl[\s\S]*?<\/a:tbl>/g)];
  if (!tables[tableIndex]) return xml;
  const table = tables[tableIndex][0];
  const rows = [...table.matchAll(/<a:tr[\s\S]*?<\/a:tr>/g)];
  const newRows: string[] = [];

  for (let r = 0; r < rows.length; r += 1) {
    const rowXml = rows[r][0];
    const rowData = matrix[r];
    if (!rowData) {
      newRows.push(rowXml);
      continue;
    }
    const cells = [...rowXml.matchAll(/<a:tc[\s\S]*?<\/a:tc>/g)];
    let rebuilt = rowXml;
    // Replace from end to keep indices stable if we used string positions —
    // safer: rebuild row from cells.
    const parts: string[] = [];
    let last = 0;
    const rowStr = rowXml;
    for (let c = 0; c < cells.length; c += 1) {
      const m = cells[c];
      const start = m.index ?? 0;
      parts.push(rowStr.slice(last, start));
      const value = rowData[c];
      parts.push(
        value == null ? m[0] : setRunsText(m[0], value),
      );
      last = start + m[0].length;
    }
    parts.push(rowStr.slice(last));
    newRows.push(parts.join(''));
  }

  const tableParts: string[] = [];
  let tLast = 0;
  for (let r = 0; r < rows.length; r += 1) {
    const m = rows[r];
    const start = m.index ?? 0;
    tableParts.push(table.slice(tLast, start));
    tableParts.push(newRows[r]);
    tLast = start + m[0].length;
  }
  tableParts.push(table.slice(tLast));
  const newTable =
    currentCol != null && currentCol >= 0
      ? paintCurrentMonthColumn(tableParts.join(''), currentCol)
      : tableParts.join('');

  const tStart = tables[tableIndex].index ?? 0;
  return xml.slice(0, tStart) + newTable + xml.slice(tStart + table.length);
}

function sectionToMatrix(section: {
  headers: string[];
  rows: Array<{ label: string; cells: string[] }>;
}): string[][] {
  return [
    section.headers,
    ...section.rows.map((r) => [r.label, ...r.cells]),
  ];
}

function shapePlainText(shapeXml: string): string {
  return [...shapeXml.matchAll(/<a:t[^>]*>([^<]*)<\/a:t>/g)]
    .map((m) => m[1])
    .join('')
    .replace(/&amp;/g, '&')
    .trim();
}

function setShapePlainText(shapeXml: string, text: string): string {
  return setRunsText(shapeXml, text);
}

function rebuildShapes(xml: string, shapes: string[], matches: RegExpMatchArray[]): string {
  const parts: string[] = [];
  let last = 0;
  for (let i = 0; i < matches.length; i += 1) {
    const m = matches[i];
    const start = m.index ?? 0;
    parts.push(xml.slice(last, start));
    parts.push(shapes[i]);
    last = start + m[0].length;
  }
  parts.push(xml.slice(last));
  return parts.join('');
}

function replaceShapeByExactText(xml: string, from: string, to: string): string {
  const matches = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)];
  const shapes = matches.map((m) => m[0]);
  let changed = false;
  for (let i = 0; i < shapes.length; i += 1) {
    if (shapePlainText(shapes[i]) === from) {
      shapes[i] = setShapePlainText(shapes[i], to);
      changed = true;
    }
  }
  return changed ? rebuildShapes(xml, shapes, matches) : xml;
}

/** Slide 7 — Financial + Headcount trends. */
export function fillTrendsSlideA(xml: string, report: ExcoReportPayload): string {
  const { slideA } = buildTrendsSlideSections(report);
  let out = xml;
  out = fillTableMatrix(out, 0, sectionToMatrix(slideA[0]), slideA[0].currentHeaderIndex);
  out = fillTableMatrix(out, 1, sectionToMatrix(slideA[1]), slideA[1].currentHeaderIndex);
  return out;
}

/** Slide 8 — Gender + Age trends. */
export function fillTrendsSlideB(xml: string, report: ExcoReportPayload): string {
  const { slideB } = buildTrendsSlideSections(report);
  let out = xml;
  out = fillTableMatrix(out, 0, sectionToMatrix(slideB[0]), slideB[0].currentHeaderIndex);
  out = fillTableMatrix(out, 1, sectionToMatrix(slideB[1]), slideB[1].currentHeaderIndex);
  return out;
}

const DEPARTURE_LABELS = new Set([
  'Amicable Separation',
  'Dismisal',
  'Dismissal',
  'Resignation',
  'Death',
  'Contract Expired',
  'Retirement',
]);

const DEPARTURE_FIRST_Y = 3_749_040;
const DEPARTURE_BAR_DY = 45_720;
const DEPARTURE_RATIO_DY = 237_744;
const DEPARTURE_RATIO_H = 182_880;
const DEPARTURE_CARD_BOTTOM = 6_446_520;
const DEPARTURE_TRACK_CX = 1_417_320;

function shapeOff(shapeXml: string): { x: number; y: number } | null {
  const off = shapeXml.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
  if (!off) return null;
  return { x: Number(off[1]), y: Number(off[2]) };
}

function shapeFillHex(shapeXml: string): string {
  const fill = shapeXml.match(/<a:solidFill>\s*<a:srgbClr val="([A-Fa-f0-9]{6})"/);
  return (fill?.[1] || '').toUpperCase();
}

function isDepartureValueBar(shapeXml: string): boolean {
  return !shapePlainText(shapeXml) && shapeFillHex(shapeXml) === 'E30613';
}

function shiftShapeY(shapeXml: string, delta: number): string {
  if (!delta) return shapeXml;
  return shapeXml.replace(
    /(<a:off x="-?\d+" y=")(-?\d+)(")/,
    (_, prefix: string, y: string, suffix: string) => `${prefix}${Number(y) + delta}${suffix}`,
  );
}

function setShapeY(shapeXml: string, y: number): string {
  return shapeXml.replace(/(<a:off x="-?\d+" y=")(-?\d+)(")/, `$1${y}$3`);
}

function setShapeCx(shapeXml: string, cx: number): string {
  return shapeXml.replace(/(<a:ext cx=")(\d+)(")/, `$1${Math.round(cx)}$3`);
}

function setShapeCy(shapeXml: string, cy: number): string {
  return shapeXml.replace(/(<a:ext cx="\d+" cy=")(\d+)(")/, `$1${Math.round(cy)}$3`);
}

function withShapeId(shapeXml: string, id: number): string {
  return shapeXml.replace(
    /(<p:cNvPr id=")(\d+)(" name=")([^"]*)(")/,
    `$1${id}$3Exit ${id}$5`,
  );
}

function departureArrow(delta: number | null | undefined): { glyph: string; color: string } {
  if (delta == null || !Number.isFinite(delta) || delta === 0) {
    return { glyph: '•', color: '6B6B7A' };
  }
  if (delta > 0) return { glyph: '▲', color: 'B91C1C' };
  return { glyph: '▼', color: '15803D' };
}

/**
 * Le modèle Aug-26 a 5 barres fixes (sans décès) et des comptes /175.
 * Décès est une ligne clonée, jamais fusionnée avec Resignation.
 */
function fillDepartureChart(
  xml: string,
  items: Array<{
    label: string;
    value: number;
    pct: number;
    ratioLabel?: string;
    deltaPct?: number | null;
  }>,
): string {
  if (!items.length) return xml;
  const matches = [...xml.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)];
  const shapes = matches.map((match) => match[0]);
  const labelHits: Array<{ y: number; canonical: string }> = [];
  shapes.forEach((shape) => {
    const text = shapePlainText(shape);
    if (!DEPARTURE_LABELS.has(text)) return;
    const off = shapeOff(shape);
    if (!off || off.x < 8_000_000) return;
    const canonical = text === 'Dismisal' ? 'Dismissal' : text;
    labelHits.push({ y: off.y, canonical });
  });
  labelHits.sort((a, b) => a.y - b.y);
  if (!labelHits.length) return xml;

  const groups = new Map<string, { labelY: number; indices: number[] }>();
  for (let i = 0; i < labelHits.length; i += 1) {
    const hit = labelHits[i];
    const nextY = labelHits[i + 1]?.y ?? hit.y + 530_352;
    const indices: number[] = [];
    shapes.forEach((shape, index) => {
      const off = shapeOff(shape);
      if (!off || off.x < 8_000_000) return;
      if (off.y < hit.y - 2_000 || off.y >= nextY - 2_000) return;
      indices.push(index);
    });
    groups.set(hit.canonical, { labelY: hit.y, indices });
  }

  let barProto = '';
  for (const index of groups.get('Dismissal')?.indices || []) {
    if (isDepartureValueBar(shapes[index])) {
      barProto = shapes[index];
      break;
    }
  }

  const gaps = Math.max(items.length - 1, 1);
  const room = DEPARTURE_CARD_BOTTOM - 36_000 - DEPARTURE_FIRST_Y - DEPARTURE_RATIO_DY - DEPARTURE_RATIO_H;
  const pitch = Math.min(530_352, Math.floor(room / gaps));
  const maxValue = Math.max(...items.map((item) => item.value || 0), 0);
  let nextId = 1 + Math.max(
    0,
    ...[...xml.matchAll(/<p:cNvPr id="(\d+)"/g)].map((match) => Number(match[1])),
  );
  const drop = new Set<number>();
  const consumed = new Set<string>();
  const built: string[] = [];

  const sourceKey = (label: string): string | null => {
    if (groups.has(label)) return label;
    if (label === 'Death' && groups.has('Resignation')) return 'Resignation';
    if (groups.has('Retirement')) return 'Retirement';
    return null;
  };

  items.forEach((item, index) => {
    const key = sourceKey(item.label);
    const group = key ? groups.get(key) : undefined;
    if (!group) return;
    const reuse = consumed.has(key!);
    if (!reuse) {
      for (const shapeIndex of group.indices) drop.add(shapeIndex);
    }
    consumed.add(key!);
    const labelY = DEPARTURE_FIRST_Y + index * pitch;
    const delta = labelY - group.labelY;
    // Six lignes : la boîte « n/HC » du modèle (5 lignes) déborderait sur le libellé suivant.
    const ratioCy = Math.min(
      DEPARTURE_RATIO_H,
      Math.max(120_000, pitch - DEPARTURE_RATIO_DY - 70_000),
    );
    const placed = group.indices.flatMap((shapeIndex) => {
      const source = reuse ? withShapeId(shapes[shapeIndex], nextId++) : shapes[shapeIndex];
      const shape = shiftShapeY(source, delta);
      const text = shapePlainText(shape);
      if (DEPARTURE_LABELS.has(text)) return [setRunsText(shape, item.label)];
      if (/^\d+(\.\d+)?%$/.test(text)) {
        return [setRunsText(shape, `${item.pct.toFixed(2)}%`)];
      }
      if (/^\d+\/\d+$/.test(text)) {
        return [setShapeCy(setRunsText(shape, item.ratioLabel || String(item.value || 0)), ratioCy)];
      }
      if (text === '•' || text === '▲' || text === '▼') {
        const arrow = departureArrow(item.deltaPct);
        return [setRunColor(setRunsText(shape, arrow.glyph), arrow.color)];
      }
      if (isDepartureValueBar(shape)) return [];
      return [shape];
    });
    const barCx = maxValue > 0 && item.value > 0
      ? Math.round(DEPARTURE_TRACK_CX * (item.value / maxValue))
      : 0;
    if (barCx > 0 && barProto) {
      const bar = setShapeCx(
        setShapeY(withShapeId(barProto, nextId++), labelY + DEPARTURE_BAR_DY),
        barCx,
      );
      const trackAt = placed.findIndex(
        (shape) => !shapePlainText(shape) && shapeFillHex(shape) === 'F7F7FA',
      );
      if (trackAt >= 0) placed.splice(trackAt + 1, 0, bar);
      else placed.push(bar);
    }
    built.push(...placed);
  });

  const kept = shapes.map((shape, index) => (drop.has(index) ? '' : shape));
  const out = rebuildShapes(xml, kept, matches);
  const closeAt = out.indexOf('</p:spTree>');
  if (closeAt < 0) return out;
  return `${out.slice(0, closeAt)}${built.join('')}${out.slice(closeAt)}`;
}

/** Slide 9 — Staff movement IN/OUT + diversity labels. */
export function fillMouvementsSlide(xml: string, report: ExcoReportPayload): string {
  const mv = buildMouvementsSlideData(report);
  let out = fillTableMatrix(xml, 0, sectionToMatrix(mv.inOut), mv.inOut.currentHeaderIndex);
  out = replaceShapeByExactText(out, '40.2 years old', mv.ageChart.subtitle || '—');
  out = replaceShapeByExactText(out, '5.81 years', mv.seniorityChart.subtitle || '—');
  out = replaceShapeByExactText(
    out,
    '4 Out this month · HC 175',
    mv.exitsChart.subtitle || 'No exits',
  );
  out = fillDepartureChart(out, mv.exitsChart.items);
  return out;
}

function otDeltaArrow(cur: number, prev: number): string {
  if (cur > prev) return '▲';
  if (cur < prev) return '▼';
  return '•';
}

/** Slide 10 — Overtime hours table + bar labels/heights. */
export function fillOtHoursSlide(xml: string, report: ExcoReportPayload): string {
  const ot = buildOtSlideData(report);
  const header = ['Department', ot.prevMonthLabel, ot.monthLabel, 'Δ'];
  const body = ot.rows.map((r) => {
    const cur = r.monthHours || 0;
    const prev = r.prevMonthHours || 0;
    return [
      r.department,
      formatOtHours(r.prevMonthHours),
      formatOtHours(r.monthHours),
      otDeltaArrow(cur, prev),
    ];
  });
  const totalCur = ot.totalMonthHours || 0;
  const totalPrev = ot.totalPrevMonthHours || 0;
  const total = [
    'Total',
    formatOtHours(ot.totalPrevMonthHours),
    formatOtHours(ot.totalMonthHours),
    otDeltaArrow(totalCur, totalPrev),
  ];
  let out = fillTableMatrix(xml, 0, [header, ...body, total]);

  out = replaceShapeByExactText(
    out,
    'Overtime — AUG hours per Department',
    `Overtime — ${ot.monthLabel} hours per Department`,
  );

  // Bar chart = formes : label valeur + éventuelle barre + libellé dept
  const matches = [...out.matchAll(/<p:sp>([\s\S]*?)<\/p:sp>/g)];
  const shapes = matches.map((m) => m[0]);
  const byShort = new Map<string, (typeof ot.rows)[number]>();
  for (const r of ot.rows) {
    byShort.set(otChartDeptLabel(r.department), r);
    const lower = r.department.toLowerCase();
    if (lower.includes('md office')) byShort.set('MD Off…', r);
    if (lower.includes('optim')) byShort.set('Optimi…', r);
    if (lower.includes('procur')) byShort.set('Procur…', r);
    if (lower.includes('sales')) byShort.set('Sales …', r);
    if (lower.includes('transport')) byShort.set('Transp…', r);
    if (lower.includes('supply')) byShort.set('Supply', r);
  }

  const maxH = ot.maxMonthHours || 1;
  const REF_CY = 4562856;
  const PLOT_BOTTOM = 1481328 + 4562856;
  for (let i = 0; i < shapes.length; i += 1) {
    const label = shapePlainText(shapes[i]);
    const row = byShort.get(label);
    if (!row) continue;
    const hours = row.monthHours || 0;
    // Valeur au-dessus : forme précédente avec nombre
    for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
      const t = shapePlainText(shapes[j]);
      if (/^[\d.,]+$/.test(t) || t === '0') {
        shapes[j] = setShapePlainText(shapes[j], formatOtHoursShort(row.monthHours));
        // Ajuster y du label au-dessus de la barre
        const barCy = hours > 0 ? Math.max(50000, Math.round((hours / maxH) * REF_CY)) : 50000;
        const barY = PLOT_BOTTOM - barCy;
        const labelH = 201168;
        shapes[j] = shapes[j].replace(
          /(<a:off[^>]*y=")(\d+)(")/,
          `$1${Math.max(900000, barY - labelH - 20000)}$3`,
        );
        break;
      }
    }
    // Barre : shape entre label valeur et label dept (souvent sans texte)
    for (let j = i - 1; j >= Math.max(0, i - 3); j -= 1) {
      const hasText = /<a:t[^>]*>/.test(shapes[j]);
      if (hasText) continue;
      if (!/<a:ext[^>]*cy="/.test(shapes[j])) continue;
      const barCy = hours > 0 ? Math.max(50000, Math.round((hours / maxH) * REF_CY)) : 50000;
      const barY = PLOT_BOTTOM - barCy;
      shapes[j] = shapes[j]
        .replace(/(<a:off[^>]*y=")(\d+)(")/, `$1${barY}$3`)
        .replace(/(<a:ext[^>]*cy=")(\d+)(")/, `$1${barCy}$3`);
      break;
    }
  }

  return rebuildShapes(out, shapes, matches);
}

/** Slide 11 — OT vs Leave overview + dept table. */
export function fillOtVsLeaveSlide(xml: string, report: ExcoReportPayload): string {
  const vs = buildOtVsLeaveSlideData(report);
  const matrix = [
    ['DPT', 'Hours', 'Cost', 'Leave'],
    ...vs.deptCross.map((r) => [r.department, r.hours, r.cost, r.leave]),
  ];
  let out = fillTableMatrix(xml, 0, matrix);

  // Overview narrative lines (formes fragmentées) — remplace les constantes Aug.
  const period = formatExcoPeriodLabel(report.year, report.month);
  out = replaceShapeByExactText(
    out,
    `General Overview — Aug-26`,
    `General Overview — ${period}`,
  );
  // Remplace aussi si déjà passé en Jul via safe pairs
  out = replaceShapeByExactText(
    out,
    `General Overview — ${period}`,
    `General Overview — ${period}`,
  );

  for (const line of vs.overviewLines) {
    // best-effort: replace known Aug fragments already handled in safe pairs
    void line;
  }
  return out;
}

/** Slide 12 — Top 15 OT & Leave tables. */
export function fillOtTop15Slide(xml: string, report: ExcoReportPayload): string {
  const vs = buildOtVsLeaveSlideData(report);
  const toMatrix = (
    rows: Array<{
      id: string;
      name: string;
      hours: string;
      cost: string;
      leave: string;
      department: string;
    }>,
  ) => {
    const header = ['ID', 'Names', 'Hrs', 'Cost', 'Leave', 'DPT'];
    const body = rows.slice(0, 15).map((r) => [
      r.id,
      r.name,
      r.hours,
      r.cost,
      r.leave,
      r.department,
    ]);
    while (body.length < 15) {
      body.push(['', '', '', '', '', '']);
    }
    return [header, ...body];
  };
  let out = fillTableMatrix(xml, 0, toMatrix(vs.otTop));
  out = fillTableMatrix(out, 1, toMatrix(vs.leaveTop));
  return out;
}

/** Slide 13 — Training lists (best-effort text shapes). */
export function fillTrainingSlide(xml: string, report: ExcoReportPayload): string {
  try {
    const tr = buildTrainingSlideData(report);
    let out = xml;
    const baselineCovered = [
      'Trainee Pevid Luambo',
      'Trainee Kutu Medina',
      'Chartered management accountant training',
      'C.N.P.R.ITRAINING COURSE FEES',
    ];
    baselineCovered.forEach((old, i) => {
      const neu = tr.covered[i];
      if (neu) out = replaceShapeByExactText(out, old, neu);
    });
    const baselineUpcoming = ['AI', 'Retirement preparation'];
    baselineUpcoming.forEach((old, i) => {
      const neu = tr.upcoming[i];
      if (neu) out = replaceShapeByExactText(out, old, neu);
    });
    return out;
  } catch {
    return xml;
  }
}

/** Slide 16 — Internal audit status/comments by row order. */
export function fillAuditSlide(xml: string, report: ExcoReportPayload): string {
  const rows = buildInternalAuditRows(report);
  if (!rows.length) return xml;
  const tables = [...xml.matchAll(/<a:tbl[\s\S]*?<\/a:tbl>/g)];
  if (!tables.length) return xml;
  const table = tables[0][0];
  const trs = [...table.matchAll(/<a:tr[\s\S]*?<\/a:tr>/g)];
  // header + data rows
  const matrix: string[][] = [];
  for (let r = 0; r < trs.length; r += 1) {
    const cells = [...trs[r][0].matchAll(/<a:tc[\s\S]*?<\/a:tc>/g)].map((tc) =>
      cellPlain(tc[0]),
    );
    if (r === 0) {
      matrix.push(cells);
      continue;
    }
    const live = rows[r - 1];
    if (!live) {
      matrix.push(cells);
      continue;
    }
    // ID | Findings | Severity | Status | Comments | Due Date
    const next = [...cells];
    if (next.length >= 4) next[3] = live.status;
    if (next.length >= 5) next[4] = live.comments || '—';
    if (next.length >= 6 && live.dueDateLabel) next[5] = live.dueDateLabel;
    if (next.length >= 3) next[2] = live.severity;
    if (next.length >= 2 && live.finding) next[1] = live.finding;
    if (next.length >= 1 && live.number) next[0] = live.number;
    matrix.push(next);
  }
  return fillTableMatrix(xml, 0, matrix);
}

/** Point d’entrée : remplir tous les slides data-driven du template. */
export function fillTemplateDataSlides(
  slideNo: number,
  xml: string,
  report: ExcoReportPayload,
): string {
  switch (slideNo) {
    case 7:
      return fillTrendsSlideA(xml, report);
    case 8:
      return fillTrendsSlideB(xml, report);
    case 9:
      return fillMouvementsSlide(xml, report);
    case 10:
      return fillOtHoursSlide(xml, report);
    case 11:
      return fillOtVsLeaveSlide(xml, report);
    case 12:
      return fillOtTop15Slide(xml, report);
    case 13:
      return fillTrainingSlide(xml, report);
    case 16:
      return fillAuditSlide(xml, report);
    default:
      return xml;
  }
}
