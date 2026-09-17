import 'server-only';

import ExcelJS from 'exceljs';
import PptxGenJS from 'pptxgenjs';
import { buildExportDateStamp } from './employee-filters';
import { getTrainingDashboard } from './training-store';
import type { TrainingDashboardView } from './training-types';

const PPC = {
  red: 'E30613',
  ink: '16161E',
  muted: '6B6B7A',
  line: 'E0E0E6',
  white: 'FFFFFF',
  black: '0A0A0A',
  panel: 'F3F4F6',
  hq: '1E3A5F',
  plant: 'E85D04',
} as const;

const FONT = 'Calibri';

function money(n: number, digits = 0): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function periodLabel(): string {
  return new Date().toLocaleDateString('en-GB', { month: 'short', year: '2-digit' });
}

export async function buildTrainingExcelBuffer(): Promise<{ buffer: Buffer; filename: string }> {
  const dash = await getTrainingDashboard();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'RH PPCB';
  wb.created = new Date();

  const cost = wb.addWorksheet('Cost per month');
  cost.addRow(['', ...dash.costMonths.map((m) => m.label)]);
  cost.addRow(['HQ', ...dash.costMonths.map((m) => m.hq || null)]);
  cost.addRow(['Plant', ...dash.costMonths.map((m) => m.plant || null)]);
  cost.addRow(['Total', ...dash.costMonths.map((m) => m.total || null)]);
  cost.getRow(1).font = { bold: true };

  const detail = wb.addWorksheet('Postings');
  detail.addRow([
    'Posting Date',
    'Amount',
    'Cost center type',
    'Text',
    'Document Number',
    'Cost Center',
  ]);
  detail.getRow(1).font = { bold: true };
  for (const e of dash.entries) {
    detail.addRow([
      e.postingDate,
      e.amount,
      e.costCenterType,
      e.text,
      e.documentNumber || '',
      e.costCenter || '',
    ]);
  }

  const kpi = wb.addWorksheet('KPIs');
  kpi.addRow(['Budget USD', dash.kpis.budgetUsd]);
  kpi.addRow(['Actual spend', dash.actualSpend]);
  kpi.addRow(['Hours YTD', dash.kpis.hoursYtd]);
  kpi.addRow(['Avg hours / employee', dash.kpis.avgHoursPerEmployee]);
  kpi.addRow(['Topics covered', dash.topicsCount]);

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  return { buffer, filename: `TRAINING_${buildExportDateStamp()}.xlsx` };
}

function addChrome(slide: ReturnType<PptxGenJS['addSlide']>, title: string, period: string, num: string) {
  slide.addShape('rect', {
    x: 0, y: 0, w: 13.333, h: 0.08,
    fill: { color: PPC.red }, line: { color: PPC.red },
  });
  slide.addText(title, {
    x: 0.35, y: 0.2, w: 9, h: 0.36,
    fontSize: 18, bold: true, color: PPC.ink, fontFace: FONT, valign: 'middle',
  });
  slide.addText(`${period}  ·  ${num}`, {
    x: 9.2, y: 0.24, w: 3.7, h: 0.28,
    fontSize: 11, color: PPC.muted, align: 'right', fontFace: FONT,
  });
}

export async function buildTrainingPptxBuffer(): Promise<{ buffer: Buffer; filename: string }> {
  const dash = await getTrainingDashboard();
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.333, height: 7.5 });
  pptx.layout = 'WIDE';
  pptx.author = 'RH PPCB';
  pptx.title = 'Training Dashboard';

  const s = pptx.addSlide();
  s.background = { color: PPC.white };
  addChrome(s, 'PPC - HR EXCO Training Dashboard', periodLabel(), '05');
  paintTrainingDashboardSlide(s, dash);

  const out = await pptx.write({ outputType: 'nodebuffer' });
  const buffer = Buffer.isBuffer(out) ? out : Buffer.from(out as ArrayBuffer);
  return { buffer, filename: `TRAINING_${buildExportDateStamp()}.pptx` };
}

/** Shared layout for Training module PPTX and EXCO slide. */
export function paintTrainingDashboardSlide(
  s: ReturnType<PptxGenJS['addSlide']>,
  dash: TrainingDashboardView,
): void {
  const k = dash.kpis;

  // Budget
  s.addShape('roundRect', {
    x: 0.35, y: 0.7, w: 4.0, h: 1.7,
    fill: { color: '4A4A55' }, line: { color: '4A4A55' }, rectRadius: 0.08,
  });
  s.addText('Training Budget', {
    x: 0.5, y: 0.8, w: 3.7, h: 0.26, fontSize: 12, bold: true, color: PPC.white, fontFace: FONT,
  });
  s.addText(money(k.budgetUsd, 0), {
    x: 0.5, y: 1.1, w: 3.7, h: 0.36, fontSize: 22, bold: true, color: PPC.white, fontFace: FONT,
  });
  s.addText(`> ${k.plantBudgetPct}% Plant    > ${k.hqBudgetPct}% HQ`, {
    x: 0.5, y: 1.48, w: 3.7, h: 0.22, fontSize: 11, color: PPC.white, fontFace: FONT,
  });
  s.addShape('roundRect', {
    x: 0.5, y: 1.85, w: 3.7, h: 0.38,
    fill: { color: PPC.white }, line: { color: PPC.white }, rectRadius: 0.05,
  });
  s.addText(`Actual: ${money(dash.actualSpend, 2)}`, {
    x: 0.55, y: 1.88, w: 3.6, h: 0.32,
    fontSize: 12, bold: true, color: PPC.red, fontFace: FONT, valign: 'middle',
  });

  // Hours
  s.addShape('roundRect', {
    x: 4.55, y: 0.7, w: 4.0, h: 1.7,
    fill: { color: PPC.red }, line: { color: PPC.red }, rectRadius: 0.08,
  });
  s.addText('Training Hours', {
    x: 4.7, y: 0.8, w: 3.7, h: 0.26, fontSize: 12, bold: true, color: PPC.white, fontFace: FONT,
  });
  s.addText(`${k.hoursYtd.toLocaleString('en-US')} Hours YTD`, {
    x: 4.7, y: 1.1, w: 3.7, h: 0.36, fontSize: 18, bold: true, color: PPC.white, fontFace: FONT,
  });
  s.addText(`> ${k.hoursPlantPct}% Plant    > ${k.hoursHqPct}% HQ`, {
    x: 4.7, y: 1.48, w: 3.7, h: 0.22, fontSize: 11, color: PPC.white, fontFace: FONT,
  });
  s.addShape('roundRect', {
    x: 4.7, y: 1.85, w: 3.7, h: 0.38,
    fill: { color: PPC.white }, line: { color: PPC.white }, rectRadius: 0.05,
  });
  s.addText(`Average per Employee: ${k.avgHoursPerEmployee} Hours`, {
    x: 4.75, y: 1.88, w: 3.6, h: 0.32,
    fontSize: 11, bold: true, color: PPC.ink, fontFace: FONT, valign: 'middle',
  });

  // Topics
  s.addShape('roundRect', {
    x: 8.75, y: 0.7, w: 4.2, h: 1.7,
    fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.08,
  });
  s.addShape('rect', {
    x: 8.75, y: 0.7, w: 4.2, h: 0.34, fill: { color: PPC.red }, line: { color: PPC.red },
  });
  s.addText('Topics Covered', {
    x: 8.9, y: 0.74, w: 3.0, h: 0.28, fontSize: 12, bold: true, color: PPC.white, fontFace: FONT,
  });
  s.addText(String(dash.topicsCount), {
    x: 11.9, y: 0.74, w: 0.9, h: 0.28, fontSize: 14, bold: true, color: PPC.white, fontFace: FONT, align: 'right',
  });
  const skills = [
    { label: 'Technical Skills (Hours)', pct: k.technicalSkillsPct },
    { label: 'Soft Skills (Hours)', pct: k.softSkillsPct },
    { label: 'Safety Topics (Hours)', pct: k.safetyTopicsPct },
  ];
  skills.forEach((b, i) => {
    const y = 1.15 + i * 0.38;
    s.addText(b.label, { x: 8.9, y, w: 2.5, h: 0.18, fontSize: 9, color: PPC.ink, fontFace: FONT });
    s.addText(`${b.pct}%`, {
      x: 11.85, y, w: 0.9, h: 0.18, fontSize: 9, bold: true, color: PPC.ink, fontFace: FONT, align: 'right',
    });
    s.addShape('rect', {
      x: 8.9, y: y + 0.18, w: 3.85, h: 0.09, fill: { color: PPC.panel }, line: { color: PPC.panel },
    });
    s.addShape('rect', {
      x: 8.9, y: y + 0.18, w: Math.max(0.04, (3.85 * b.pct) / 100), h: 0.09,
      fill: { color: '8A8A96' }, line: { color: '8A8A96' },
    });
  });

  // Cost chart + table
  s.addText('COST PER MONTH (USD)', {
    x: 0.35, y: 2.55, w: 8.2, h: 0.24, fontSize: 12, bold: true, color: PPC.ink, fontFace: FONT,
  });

  const monthsWithData = dash.costMonths.filter((m) => m.total > 0);
  const chartMonths = monthsWithData.length ? monthsWithData : dash.costMonths.slice(0, 5);
  if (chartMonths.some((m) => m.total > 0)) {
    s.addChart(
      'bar',
      [
        {
          name: 'HQ',
          labels: chartMonths.map((m) => m.label),
          values: chartMonths.map((m) => m.hq),
        },
        {
          name: 'Plant',
          labels: chartMonths.map((m) => m.label),
          values: chartMonths.map((m) => m.plant),
        },
      ],
      {
        x: 0.35,
        y: 2.8,
        w: 8.2,
        h: 1.85,
        barGrouping: 'stacked',
        showValue: false,
        showLegend: true,
        showTitle: false,
        chartColors: [PPC.hq, PPC.plant],
        valAxisMinVal: 0,
        catAxisLabelFontSize: 8,
        valAxisLabelFontSize: 8,
        legendPos: 'b',
      },
    );
  }

  const costHead = [
    { text: '', options: { bold: true, color: PPC.white, fill: { color: PPC.black }, fontSize: 8 } },
    ...dash.costMonths.map((m) => ({
      text: m.label,
      options: { bold: true, color: PPC.white, fill: { color: PPC.black }, align: 'center' as const, fontSize: 7 },
    })),
  ];
  const fmt = (n: number) => (n ? n.toLocaleString('en-US') : '');
  const hqRow = [
    { text: 'HQ', options: { bold: true, fill: { color: 'FEE2E2' }, color: PPC.red, fontSize: 8 } },
    ...dash.costMonths.map((m) => ({
      text: fmt(m.hq),
      options: { align: 'center' as const, fill: { color: PPC.panel }, fontSize: 7 },
    })),
  ];
  const plantRow = [
    { text: 'Plant', options: { bold: true, fill: { color: PPC.white }, fontSize: 8 } },
    ...dash.costMonths.map((m) => ({
      text: fmt(m.plant),
      options: { align: 'center' as const, fill: { color: PPC.white }, fontSize: 7 },
    })),
  ];
  s.addTable([costHead, hqRow, plantRow], {
    x: 0.35,
    y: 4.75,
    w: 8.2,
    colW: [0.7, ...dash.costMonths.map(() => 7.5 / Math.max(dash.costMonths.length, 1))],
    border: { pt: 0.4, color: PPC.line },
    fontFace: FONT,
    valign: 'middle',
  });

  // Upcoming
  s.addShape('roundRect', {
    x: 0.35, y: 5.7, w: 8.2, h: 1.5,
    fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.06,
  });
  s.addShape('rect', {
    x: 0.35, y: 5.7, w: 8.2, h: 0.3, fill: { color: PPC.black }, line: { color: PPC.black },
  });
  s.addText('Upcoming Training Sessions', {
    x: 0.5, y: 5.72, w: 7.9, h: 0.26, fontSize: 11, bold: true, color: PPC.white, fontFace: FONT,
  });
  s.addText(
    dash.upcoming.length ? dash.upcoming.slice(0, 6).map((t) => `• ${t}`).join('\n') : '—',
    { x: 0.55, y: 6.1, w: 7.8, h: 0.95, fontSize: 12, color: PPC.ink, fontFace: FONT, valign: 'top' },
  );

  // Covered
  s.addShape('roundRect', {
    x: 8.75, y: 2.55, w: 4.2, h: 4.65,
    fill: { color: PPC.white }, line: { color: PPC.line, pt: 1 }, rectRadius: 0.06,
  });
  s.addShape('rect', {
    x: 8.75, y: 2.55, w: 4.2, h: 0.32, fill: { color: PPC.red }, line: { color: PPC.red },
  });
  s.addText('List of Training Covered', {
    x: 8.9, y: 2.58, w: 3.9, h: 0.26, fontSize: 11, bold: true, color: PPC.white, fontFace: FONT,
  });
  const coveredRows = (dash.covered.length ? dash.covered : ['—']).slice(0, 18).map((t, i) => [
    {
      text: String(i + 1),
      options: { fill: { color: i % 2 ? PPC.panel : PPC.white }, align: 'right' as const, fontSize: 8 },
    },
    {
      text: t,
      options: { fill: { color: i % 2 ? PPC.panel : PPC.white }, fontSize: 8 },
    },
  ]);
  s.addTable(coveredRows, {
    x: 8.85,
    y: 3.0,
    w: 4.0,
    colW: [0.4, 3.6],
    border: { pt: 0, color: PPC.white },
    fontFace: FONT,
    valign: 'middle',
  });
}
