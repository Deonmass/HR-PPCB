import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import PptxGenJS from 'pptxgenjs';
import { buildExportDateStamp } from './employee-filters';
import { formatDisplayName } from './format-display-name';
import { compareMaisonNumero } from './table-sort';
import type { Employee } from './types';
import type { Dependant } from './dependants-types';
import {
  buildMaisonOccupancy,
  buildVillageDashboardStats,
  buildZambaAgentsFromEmployees,
  resolveMaisonTypeLabel,
  splitVillageKimpese,
} from './village-agents';
import type { VillagePresentation } from './village-presentation';
import { defaultVillagePresentation, DEFAULT_ALLOCATION_CRITERIA } from './village-presentation';
import { formatRate, ratioToRate } from './format-rate';
import type { VillageMaison, VillageMaisonOccupancy, VillageTaille } from './village-types';

type Slide = ReturnType<PptxGenJS['addSlide']>;

const PPC = {
  red: 'E30613',
  black: '0A0A0A',
  ink: '16161E',
  muted: '6B6B7A',
  line: 'E0E0E6',
  panel: 'F7F7FA',
  white: 'FFFFFF',
  slide: 'E8E8EC',
  success: '166534',
  warning: 'B45309',
  warningSoft: 'FEF3C7',
  info: '1D4ED8',
  infoSoft: 'DBEAFE',
  redSoft: 'FCE8E9',
} as const;

const FONT = 'Segoe UI';
const FONT_TITLE = 'Segoe UI';
const W = 13.333;
const H = 7.5;
const TABLE_BORDER = { pt: 0.4, color: PPC.line };
const ASSETS = path.join(process.cwd(), 'templates', 'exco', 'cover-assets');

function villaNorm(value: string | undefined | null): string {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function displayHouse(numero: string): string {
  return String(numero ?? '').trim() || '—';
}

function findMaison(
  occupancy: VillageMaisonOccupancy[],
  house: string,
): VillageMaisonOccupancy | undefined {
  const key = villaNorm(house);
  return occupancy.find((m) => villaNorm(m.numero) === key);
}

function brandKicker(value: string | undefined): string {
  const raw = String(value ?? '').trim() || 'PPC · VILLAGE';
  return raw.replace(/exco/gi, 'VILLAGE');
}

function enLabel(value: string): string {
  const key = String(value ?? '').trim();
  if (key === 'Hors effectif') return 'Non-staff';
  if (key === 'Non renseigné') return 'Not specified';
  return key;
}

function addChrome(
  slide: Slide,
  title: string,
  period: string,
  sectionNo?: string,
  kicker = 'PPC · VILLAGE',
): void {
  slide.addShape('rect', {
    x: 0, y: 0, w: W, h: 0.07,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
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
  slide.addText(brandKicker(kicker), {
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
  slide.addShape('rect', {
    x: 0, y: H - 0.09, w: W, h: 0.09,
    fill: { color: PPC.black }, line: { color: PPC.black },
  });
}

async function paintSlideCanvas(slide: Slide): Promise<void> {
  slide.background = { color: PPC.slide };
  const fade = path.join(ASSETS, 'slide-fade.jpg');
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
    // fond uni
  }
}

function whiteBlock(slide: Slide, x: number, y: number, w: number, h: number): void {
  slide.addShape('roundRect', {
    x, y, w, h,
    fill: { color: PPC.white },
    line: { color: PPC.line, pt: 1 },
    rectRadius: 0.08,
    shadow: { type: 'outer', color: '000000', blur: 8, opacity: 0.06, offset: 1 },
  });
}

function kpiCard(
  slide: Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  value: string,
  sub?: string,
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
    x: x + 0.2, y: y + 0.1, w: w - 0.32, h: 0.24,
    fontSize: 10, color: PPC.red, bold: true, fontFace: FONT,
  });
  slide.addText(value, {
    x: x + 0.2, y: y + 0.34, w: w - 0.32, h: 0.38,
    fontSize: 22, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
  });
  if (sub) {
    slide.addText(sub, {
      x: x + 0.2, y: y + h - 0.28, w: w - 0.32, h: 0.2,
      fontSize: 9, color: PPC.muted, fontFace: FONT,
    });
  }
}

function headerCell(text: string, opts?: { align?: 'left' | 'center' }) {
  return {
    text,
    options: {
      bold: true,
      color: PPC.white,
      fill: { color: PPC.black },
      align: opts?.align ?? 'center',
      valign: 'middle' as const,
      fontSize: 9,
      fontFace: FONT,
    },
  };
}

function bodyCell(
  text: string,
  fill: string,
  opts?: { bold?: boolean; align?: 'left' | 'center'; color?: string },
) {
  return {
    text: text || '—',
    options: {
      bold: Boolean(opts?.bold),
      color: opts?.color || PPC.ink,
      fill: { color: fill },
      align: opts?.align ?? 'center',
      valign: 'middle' as const,
      fontSize: 9,
      fontFace: FONT,
    },
  };
}

async function addCoverSlide(pptx: PptxGenJS, deck: VillagePresentation): Promise<void> {
  const s = pptx.addSlide();
  s.background = { color: PPC.white };

  s.addShape('ellipse', {
    x: -1.6, y: -1.8, w: 4.6, h: 4.6,
    fill: { color: 'E8E8EC' }, line: { color: 'E8E8EC' },
  });
  s.addShape('ellipse', {
    x: (W - 3.4) / 2, y: 6.35, w: 3.4, h: 3.4,
    fill: { color: 'D8D8DE' }, line: { color: 'D8D8DE' },
  });

  const bannerPath = path.join(ASSETS, 'cover-banner.png');
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

  const meet = `${deck.cover.title} HELD ON ${deck.cover.date}, IN ${deck.cover.place}`;
  const meetY = bannerY + bannerH + 1.15;
  const badgePath = path.join(ASSETS, 'cover-badge.png');
  const badgeSize = 0.38;
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

async function addDashboardSlide(
  pptx: PptxGenJS,
  deck: VillagePresentation,
  stats: ReturnType<typeof buildVillageDashboardStats>,
): Promise<void> {
  const s = pptx.addSlide();
  await paintSlideCanvas(s);
  addChrome(s, deck.dashboard.title, deck.period, '01', deck.chromeKicker);

  const occPct = stats.maisonsTotal
    ? ratioToRate(stats.maisonsOccupees, stats.maisonsTotal)
    : 0;

  const kpis: Array<{ label: string; value: string; sub?: string }> = [
    { label: 'Houses', value: String(stats.maisonsTotal), sub: 'Village inventory' },
    { label: 'Occupied', value: String(stats.maisonsOccupees), sub: `${formatRate(occPct)} occupancy` },
    { label: 'Vacant', value: String(stats.maisonsVides), sub: 'Available' },
    { label: 'Village', value: String(stats.village), sub: `${stats.villagePersonnes} with family` },
    { label: 'Kimpese', value: String(stats.kimpese), sub: `${stats.kimpesePersonnes} with family` },
    { label: 'Zamba', value: String(stats.zamba), sub: 'Headcount' },
  ];
  const gap = 0.12;
  const kpiW = (12.53 - gap * 5) / 6;
  kpis.forEach((k, i) => {
    kpiCard(s, 0.4 + i * (kpiW + gap), 0.88, kpiW, 1.12, k.label, k.value, k.sub);
  });

  const typeHeader = [
    headerCell('House type', { align: 'left' }),
    headerCell('Total'),
    headerCell('Occupied'),
    headerCell('Vacant'),
    headerCell('Occ. %'),
  ];
  const typeRows = stats.parTaille.map((row, i) => {
    const fill = i % 2 === 0 ? PPC.white : PPC.panel;
    const pct = row.total ? ratioToRate(row.occupees, row.total) : 0;
    return [
      bodyCell(enLabel(row.label), fill, { bold: true, align: 'left' }),
      bodyCell(String(row.total), fill),
      bodyCell(String(row.occupees), fill, { color: PPC.success }),
      bodyCell(String(row.vides), fill, { color: row.vides ? PPC.warning : PPC.ink }),
      bodyCell(formatRate(pct), fill, { bold: true, color: PPC.red }),
    ];
  });
  const typeTotalFill = PPC.redSoft;
  typeRows.push([
    bodyCell('Total', typeTotalFill, { bold: true, align: 'left' }),
    bodyCell(String(stats.maisonsTotal), typeTotalFill, { bold: true }),
    bodyCell(String(stats.maisonsOccupees), typeTotalFill, { bold: true }),
    bodyCell(String(stats.maisonsVides), typeTotalFill, { bold: true }),
    bodyCell(formatRate(occPct), typeTotalFill, { bold: true, color: PPC.red }),
  ]);

  s.addText('Houses by type', {
    x: 0.4, y: 2.14, w: 5.9, h: 0.26,
    fontSize: 12, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
  });
  s.addTable([typeHeader, ...typeRows], {
    x: 0.4,
    y: 2.44,
    w: 5.9,
    colW: [2.1, 0.9, 1.05, 0.9, 0.95],
    border: TABLE_BORDER,
    fontFace: FONT,
    valign: 'middle',
    rowH: 0.32,
  });

  const cols = stats.tailleColumns;
  const deptHeader = [
    headerCell('Department', { align: 'left' }),
    ...cols.map((c) => headerCell(c)),
    headerCell('Total'),
  ];
  const colTotals: Record<string, number> = {};
  for (const col of cols) colTotals[col] = 0;
  const deptRows = stats.parDepartementTaille.map((row, i) => {
    const fill = i % 2 === 0 ? PPC.white : PPC.panel;
    for (const col of cols) colTotals[col] = (colTotals[col] ?? 0) + (row.counts[col] ?? 0);
    return [
      bodyCell(enLabel(row.departement), fill, { bold: true, align: 'left' }),
      ...cols.map((col) => {
        const n = row.counts[col] ?? 0;
        return bodyCell(n ? String(n) : '—', fill, { color: n ? PPC.ink : PPC.muted });
      }),
      bodyCell(String(row.total), fill, { bold: true, color: PPC.red }),
    ];
  });
  const grand = stats.parDepartementTaille.reduce((sum, r) => sum + r.total, 0);
  deptRows.push([
    bodyCell('Total', typeTotalFill, { bold: true, align: 'left' }),
    ...cols.map((col) => bodyCell(String(colTotals[col] ?? 0), typeTotalFill, { bold: true })),
    bodyCell(String(grand), typeTotalFill, { bold: true, color: PPC.red }),
  ]);

  const firstColW = 2.15;
  const restCount = cols.length + 1;
  const restW = (6.5 - firstColW) / Math.max(1, restCount);
  s.addText('By department × type', {
    x: 6.5, y: 2.14, w: 6.5, h: 0.26,
    fontSize: 12, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
  });
  s.addTable([deptHeader, ...deptRows], {
    x: 6.5,
    y: 2.44,
    w: 6.43,
    colW: [firstColW, ...Array.from({ length: restCount }, () => restW)],
    border: TABLE_BORDER,
    fontFace: FONT,
    valign: 'middle',
    fontSize: 8,
    rowH: Math.min(0.3, 4.7 / Math.max(2, deptRows.length + 1)),
  });

  const typeTableH = 0.32 * (typeRows.length + 1);
  addAllocationCriteriaBox(
    s,
    deck.dashboard.criteria ?? DEFAULT_ALLOCATION_CRITERIA,
    0.4,
    2.44 + typeTableH + 0.16,
    5.9,
  );
}

function addAllocationCriteriaBox(
  slide: Slide,
  criteria: VillagePresentation['dashboard']['criteria'],
  x: number,
  y: number,
  w: number,
): void {
  const title = String(criteria?.title ?? '').trim();
  const intro = String(criteria?.intro ?? '').trim();
  const items = Array.isArray(criteria?.items)
    ? criteria.items.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  if (!title && !intro && !items.length) return;

  const lines = (title ? 1 : 0) + (intro ? 1 : 0) + items.length;
  const h = Math.min(7.28 - y, Math.max(1.7, 0.42 + lines * 0.28));
  if (h < 1.1) return;

  whiteBlock(slide, x, y, w, h);
  slide.addShape('rect', {
    x, y, w: 0.07, h,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });

  const runs: Array<{ text: string; options: Record<string, unknown> }> = [];
  if (title) {
    runs.push({
      text: title,
      options: {
        bold: true,
        fontSize: 13,
        color: PPC.red,
        fontFace: FONT_TITLE,
        breakLine: true,
      },
    });
  }
  if (intro) {
    runs.push({
      text: intro,
      options: {
        fontSize: 11,
        color: PPC.ink,
        fontFace: FONT,
        breakLine: true,
      },
    });
  }
  items.forEach((item) => {
    runs.push({
      text: item,
      options: {
        fontSize: 11,
        color: PPC.ink,
        fontFace: FONT,
        bullet: true,
        breakLine: true,
      },
    });
  });

  slide.addText(runs, {
    x: x + 0.22,
    y: y + 0.12,
    w: w - 0.36,
    h: h - 0.22,
    valign: 'top',
    paraSpaceAfter: 5,
  });
}

async function addEmptyHousesSlide(
  pptx: PptxGenJS,
  deck: VillagePresentation,
  occupancy: VillageMaisonOccupancy[],
  tailles: VillageTaille[],
): Promise<void> {
  const empty = occupancy
    .filter((m) => !m.occupied)
    .slice()
    .sort((a, b) => compareMaisonNumero(a.numero, b.numero));

  const byType = new Map<string, number>();
  for (const maison of empty) {
    const label = resolveMaisonTypeLabel(maison.taille, maison.typeMaison, tailles);
    byType.set(label, (byType.get(label) ?? 0) + 1);
  }
  const typeEntries = [...byType.entries()].sort((a, b) => b[1] - a[1]);

  const pageSize = 22;
  const pages = Math.max(1, Math.ceil(empty.length / pageSize));

  for (let page = 0; page < pages; page += 1) {
    const s = pptx.addSlide();
    await paintSlideCanvas(s);
    const suffix = pages > 1 ? ` (${page + 1}/${pages})` : '';
    addChrome(s, `${deck.vacant.title}${suffix}`, deck.period, '02', deck.chromeKicker);

    if (page === 0) {
      const cardW = 3.02;
      const gap = 0.14;
      const summary = [
        { label: 'Vacant houses', value: String(empty.length) },
        ...typeEntries.slice(0, 3).map(([label, count]) => ({
          label: enLabel(label),
          value: String(count),
        })),
      ];
      while (summary.length < 4) summary.push({ label: '—', value: '—' });
      summary.slice(0, 4).forEach((card, i) => {
        kpiCard(s, 0.4 + i * (cardW + gap), 0.88, cardW, 0.95, card.label, card.value);
      });
    }

    const slice = empty.slice(page * pageSize, (page + 1) * pageSize);
    const mid = Math.ceil(slice.length / 2) || 1;
    const left = slice.slice(0, mid);
    const right = slice.slice(mid);
    const tableY = page === 0 ? 2.02 : 0.95;
    const makeTable = (rows: VillageMaisonOccupancy[]) => {
      const header = [
        headerCell('House', { align: 'left' }),
        headerCell('Type', { align: 'left' }),
        headerCell('Capacity'),
        headerCell('Status'),
      ];
      const body = rows.map((m, i) => {
        const fill = i % 2 === 0 ? PPC.white : PPC.panel;
        const type = resolveMaisonTypeLabel(m.taille, m.typeMaison, tailles);
        return [
          bodyCell(displayHouse(m.numero), fill, { bold: true, align: 'left', color: PPC.red }),
          bodyCell(enLabel(type), fill, { align: 'left' }),
          bodyCell(m.capacite != null ? String(m.capacite) : '—', fill),
          bodyCell('Vacant', fill, { color: PPC.warning, bold: true }),
        ];
      });
      if (!body.length) {
        body.push([
          bodyCell('No vacant houses', PPC.white, { align: 'left' }),
          bodyCell('', PPC.white),
          bodyCell('', PPC.white),
          bodyCell('', PPC.white),
        ]);
      }
      return [header, ...body];
    };

    s.addTable(makeTable(left), {
      x: 0.4,
      y: tableY,
      w: 6.2,
      colW: [1.2, 2.3, 1.2, 1.5],
      border: TABLE_BORDER,
      fontFace: FONT,
      valign: 'middle',
      rowH: 0.28,
    });
    if (right.length) {
      s.addTable(makeTable(right), {
        x: 6.75,
        y: tableY,
        w: 6.2,
        colW: [1.2, 2.3, 1.2, 1.5],
        border: TABLE_BORDER,
        fontFace: FONT,
        valign: 'middle',
        rowH: 0.28,
      });
    }
  }
}

async function addProposalsSlide(
  pptx: PptxGenJS,
  deck: VillagePresentation,
  occupancy: VillageMaisonOccupancy[],
  tailles: VillageTaille[],
): Promise<void> {
  const s = pptx.addSlide();
  await paintSlideCanvas(s);
  addChrome(s, deck.proposals.title, deck.period, '03', deck.chromeKicker);

  if (deck.proposals.note) {
    s.addText(deck.proposals.note, {
      x: 0.42, y: 0.78, w: 12.5, h: 0.22,
      fontSize: 10, color: PPC.muted, italic: true, fontFace: FONT,
    });
  }

  const items = deck.proposals.items.length
    ? deck.proposals.items
    : [{ id: 'empty', house: '—', name: 'No proposal', matricule: '', purpose: '', badge: 'proposal' as const }];
  const startY = deck.proposals.note ? 1.08 : 0.92;
  const available = 7.22 - startY;
  const rowH = Math.min(0.82, available / Math.max(items.length, 1));
  const cardW = 12.53;

  items.forEach((spec, i) => {
    const y = startY + i * rowH;
    const maison = findMaison(occupancy, spec.house);
    const type = maison
      ? resolveMaisonTypeLabel(maison.taille, maison.typeMaison, tailles)
      : '—';
    const houseLabel = maison ? displayHouse(maison.numero) : (spec.house || '—');
    const occupantNow = maison?.occupants[0];
    const status = occupantNow
      ? `Currently: ${formatDisplayName(occupantNow.nom)}`
      : 'Currently vacant';
    const roleOnly = spec.badge === 'role';
    const name = spec.name || '—';
    const matricule = roleOnly ? '' : spec.matricule;
    const job = spec.purpose;

    s.addShape('roundRect', {
      x: 0.4, y, w: cardW, h: Math.max(0.62, rowH - 0.08),
      fill: { color: PPC.white },
      line: { color: PPC.line, width: 1 },
      rectRadius: 0.08,
      shadow: { type: 'outer', color: '000000', blur: 5, opacity: 0.06, offset: 1 },
    });
    s.addShape('roundRect', {
      x: 0.52, y: y + 0.12, w: 1.15, h: 0.42,
      fill: { color: PPC.red },
      line: { color: PPC.red },
      rectRadius: 0.06,
    });
    s.addText(houseLabel, {
      x: 0.52, y: y + 0.12, w: 1.15, h: 0.42,
      fontSize: 13, bold: true, color: PPC.white, fontFace: FONT_TITLE,
      align: 'center', valign: 'middle',
    });

    s.addText(name, {
      x: 1.85, y: y + 0.08, w: 6.4, h: 0.26,
      fontSize: 14, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
    });
    s.addText(
      [job, matricule ? `ID ${matricule}` : '']
        .filter(Boolean)
        .join('  ·  ') || ' ',
      {
        x: 1.85, y: y + 0.34, w: 6.4, h: 0.22,
        fontSize: 11, color: PPC.muted, fontFace: FONT,
      },
    );

    s.addText(enLabel(type), {
      x: 8.35, y: y + 0.08, w: 2.2, h: 0.26,
      fontSize: 12, bold: true, color: PPC.red, fontFace: FONT, align: 'right',
    });
    s.addText(status, {
      x: 8.35, y: y + 0.34, w: 2.2, h: 0.22,
      fontSize: 10, color: PPC.muted, fontFace: FONT, align: 'right',
    });

    const badgeFill = roleOnly ? PPC.warningSoft : PPC.infoSoft;
    const badgeColor = roleOnly ? PPC.warning : PPC.info;
    const badgeLabel = roleOnly ? 'Role / use' : 'Proposal';
    s.addShape('roundRect', {
      x: 10.7, y: y + 0.16, w: 2.05, h: 0.32,
      fill: { color: badgeFill },
      line: { color: badgeFill },
      rectRadius: 0.06,
    });
    s.addText(badgeLabel, {
      x: 10.7, y: y + 0.16, w: 2.05, h: 0.32,
      fontSize: 10, bold: true, color: badgeColor, fontFace: FONT,
      align: 'center', valign: 'middle',
    });
  });
}

async function addThankYouSlide(pptx: PptxGenJS, deck: VillagePresentation): Promise<void> {
  const s = pptx.addSlide();
  await paintSlideCanvas(s);
  s.addShape('rect', {
    x: 0, y: 0, w: W, h: 0.07,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
  s.addShape('rect', {
    x: 0, y: H - 0.09, w: W, h: 0.09,
    fill: { color: PPC.black }, line: { color: PPC.black },
  });

  whiteBlock(s, 1.8, 1.6, 9.7, 4.2);

  s.addText(brandKicker(deck.thankYou.kicker || deck.chromeKicker), {
    x: 1.8, y: 2.15, w: 9.7, h: 0.35,
    fontSize: 14, bold: true, color: PPC.red, fontFace: FONT,
    align: 'center',
  });
  s.addText(deck.thankYou.message || 'Thank You', {
    x: 1.8, y: 2.7, w: 9.7, h: 0.85,
    fontSize: 54, bold: true, color: PPC.ink, fontFace: FONT_TITLE,
    align: 'center', valign: 'middle',
  });
  s.addShape('rect', {
    x: 5.9, y: 3.7, w: 1.5, h: 0.06,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
  s.addText(deck.period, {
    x: 1.8, y: 4.15, w: 9.7, h: 0.35,
    fontSize: 16, color: PPC.muted, fontFace: FONT,
    align: 'center',
  });
}

export function buildVillagePptxFilename(): string {
  return `VILLAGE_MAISONS_${buildExportDateStamp()}.pptx`;
}

export async function buildVillagePptxBuffer(
  employees: Employee[],
  dependants: Dependant[],
  maisons: VillageMaison[],
  tailles: VillageTaille[],
  presentation?: VillagePresentation,
): Promise<Buffer> {
  const deck = presentation ?? defaultVillagePresentation(employees);
  const stats = buildVillageDashboardStats(employees, dependants, maisons, tailles);
  const zamba = buildZambaAgentsFromEmployees(employees, dependants);
  const { village } = splitVillageKimpese(zamba);
  const occupancy = buildMaisonOccupancy(maisons, tailles, village, dependants);

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: W, height: H });
  pptx.layout = 'WIDE';
  pptx.author = 'PPC HR';
  pptx.title = `Village housing — ${deck.period}`;

  await addCoverSlide(pptx, deck);
  await addDashboardSlide(pptx, deck, stats);
  await addEmptyHousesSlide(pptx, deck, occupancy, tailles);
  await addProposalsSlide(pptx, deck, occupancy, tailles);
  await addThankYouSlide(pptx, deck);

  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer;
}
