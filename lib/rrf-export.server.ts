import 'server-only';

import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { RrfFormData } from './rrf-types';
import { formatRrfDisplayDate, yn } from './rrf-types';
import { resolveWorkbookPath } from './runtime-mode';
import { convertOfficeBufferToPdf } from './travel-pdf';
import { isWindows } from './windows-shell';

const TEMPLATE_REL = path.join('templates', 'rrf', 'RRF.xlsx');

export function getRrfTemplatePath(): string {
  return resolveWorkbookPath(TEMPLATE_REL);
}

function setCell(sheet: ExcelJS.Worksheet, row: number, col: number, value: string) {
  const cell = sheet.getCell(row, col);
  cell.value = value;
}

/** Remplit le modèle Excel RRF et renvoie le buffer. */
export async function buildRrfExcelBuffer(form: RrfFormData): Promise<Buffer> {
  const templatePath = getRrfTemplatePath();
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Modèle RRF introuvable : ${templatePath}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Feuille RRF introuvable dans le modèle');

  const positionLabel = form.headcount && form.headcount !== '1'
    ? `${form.positionTitle} (x${form.headcount})`
    : form.positionTitle;

  // Colonne B des lignes principales (aligné sur le template)
  setCell(sheet, 5, 2, positionLabel);
  setCell(sheet, 6, 2, form.costCenter);
  setCell(sheet, 7, 2, form.headAccountBlueprint || '');
  setCell(sheet, 8, 2, form.headAccountJustification);
  setCell(sheet, 9, 2, form.positionBudgeted || '');
  setCell(sheet, 10, 2, form.budgetJustification);
  setCell(sheet, 11, 2, form.newOrReplacement || '');
  setCell(sheet, 12, 2, form.workSchedule || '');
  setCell(sheet, 14, 2, form.jobTitle || form.positionTitle);
  setCell(sheet, 15, 2, form.jobDescription);
  setCell(sheet, 16, 2, form.jobLevel);
  setCell(sheet, 17, 2, form.reportsTo);
  setCell(sheet, 18, 2, form.location);
  setCell(sheet, 19, 2, formatRrfDisplayDate(form.preferredStartDate));
  setCell(sheet, 20, 2, form.posting || '');

  setCell(sheet, 23, 2, yn(form.benefits.car));
  setCell(sheet, 24, 2, yn(form.benefits.fuelAllowance));
  setCell(sheet, 25, 2, yn(form.benefits.housing));
  setCell(sheet, 26, 2, yn(form.benefits.phone));
  setCell(sheet, 27, 2, yn(form.benefits.laptop));

  setCell(sheet, 30, 2, form.recruitmentRequestedBy);

  // Rôle en col A ; nom approbateur en B (y compris cellules fusionnées rôle/Approved by).
  const approvers: Array<[number, number, string, string]> = [
    [31, 32, form.lineManagerRole || 'Line Manager', form.lineManagerApprovedBy],
    [33, 34, form.plantControllerRole || 'Plant/finance Controller', form.plantControllerApprovedBy],
    [35, 36, form.headOfDeptRole || 'Head of department', form.headOfDeptApprovedBy],
    [37, 38, form.talentManagerRole || 'Talent and Development Manager', form.talentManagerApprovedBy],
    [39, 40, form.hrmRole || 'HRM', form.hrmApprovedBy],
  ];
  for (const [roleRow, byRow, role, name] of approvers) {
    setCell(sheet, roleRow, 1, role);
    setCell(sheet, roleRow, 2, name);
    setCell(sheet, byRow, 2, name);
  }
  setCell(sheet, 41, 1, form.excoRole || 'Exco Member / Plant Manager');
  setCell(sheet, 41, 2, form.excoApprovedBy);

  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * PDF au design du template Excel :
 * remplit RRF.xlsx puis exporte via Excel (Windows/Office).
 * Repli pdf-lib tabular si Office indisponible.
 */
export async function buildRrfPdfBuffer(form: RrfFormData): Promise<Buffer> {
  const xlsx = await buildRrfExcelBuffer(form);

  if (isWindows()) {
    try {
      return await convertOfficeBufferToPdf(xlsx, '.xlsx');
    } catch (err) {
      console.error('[rrf] Excel→PDF failed, falling back to pdf-lib layout:', err);
    }
  }

  return buildRrfPdfTemplateLayout(form);
}

function text(value: string): string {
  return String(value ?? '').trim();
}

/** Repli : PDF tabulaire proche du modèle (sans Office). */
async function buildRrfPdfTemplateLayout(form: RrfFormData): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageW = 595.28;
  const pageH = 841.89;
  let page = pdf.addPage([pageW, pageH]);
  const margin = 36;
  const contentW = pageW - margin * 2;
  let y = pageH - 32;

  const dark = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.35, 0.38, 0.42);
  const sectionBg = rgb(0.12, 0.33, 0.55);
  const sectionFg = rgb(1, 1, 1);
  const altRow = rgb(0.96, 0.97, 0.98);
  const line = rgb(0.82, 0.85, 0.88);
  const headerBg = rgb(0.93, 0.95, 0.97);

  const ensureSpace = (h: number) => {
    if (y - h < 36) {
      page = pdf.addPage([pageW, pageH]);
      y = pageH - 36;
    }
  };

  const drawWrapped = (
    value: string,
    x: number,
    maxW: number,
    size: number,
    isBold: boolean,
    color = dark,
  ): number => {
    const f = isBold ? bold : font;
    const words = value.split(/\s+/).filter(Boolean);
    if (!words.length) {
      page.drawText('—', { x, y: y - size, size, font: f, color: muted });
      return size + 4;
    }
    let used = 0;
    let lineText = '';
    const lines: string[] = [];
    for (const w of words) {
      const test = lineText ? `${lineText} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW && lineText) {
        lines.push(lineText);
        lineText = w;
      } else {
        lineText = test;
      }
    }
    if (lineText) lines.push(lineText);
    for (const ln of lines) {
      ensureSpace(size + 6);
      page.drawText(ln, { x, y: y - size, size, font: f, color });
      y -= size + 3;
      used += size + 3;
    }
    return used;
  };

  // Banner
  ensureSpace(54);
  page.drawRectangle({
    x: margin,
    y: y - 48,
    width: contentW,
    height: 48,
    color: headerBg,
    borderColor: line,
    borderWidth: 0.8,
  });
  page.drawText('PPCB-HR-DOC-26', {
    x: margin + 10,
    y: y - 18,
    size: 9,
    font: bold,
    color: sectionBg,
  });
  page.drawText('Recruitment Requisition approval Form', {
    x: margin + 10,
    y: y - 34,
    size: 12,
    font: bold,
    color: dark,
  });
  page.drawText('Permanent position', {
    x: margin + contentW - 108,
    y: y - 18,
    size: 8,
    font,
    color: muted,
  });
  y -= 58;

  const section = (title: string) => {
    ensureSpace(22);
    page.drawRectangle({
      x: margin,
      y: y - 18,
      width: contentW,
      height: 18,
      color: sectionBg,
    });
    page.drawText(title, {
      x: margin + 8,
      y: y - 13,
      size: 9,
      font: bold,
      color: sectionFg,
    });
    y -= 22;
  };

  const field = (label: string, value: string, alt = false) => {
    const labelW = contentW * 0.38;
    const valueW = contentW * 0.62 - 12;
    const val = text(value) || '—';
    const f = font;
    // estimate height
    const words = val.split(/\s+/).filter(Boolean);
    let lines = 1;
    let cur = '';
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(t, 9) > valueW && cur) {
        lines += 1;
        cur = w;
      } else cur = t;
    }
    const rowH = Math.max(18, lines * 12 + 6);
    ensureSpace(rowH + 2);
    if (alt) {
      page.drawRectangle({
        x: margin,
        y: y - rowH,
        width: contentW,
        height: rowH,
        color: altRow,
      });
    }
    page.drawRectangle({
      x: margin,
      y: y - rowH,
      width: contentW,
      height: rowH,
      borderColor: line,
      borderWidth: 0.5,
    });
    page.drawLine({
      start: { x: margin + labelW, y: y },
      end: { x: margin + labelW, y: y - rowH },
      thickness: 0.5,
      color: line,
    });
    page.drawText(label, {
      x: margin + 6,
      y: y - 12,
      size: 8,
      font: bold,
      color: muted,
      maxWidth: labelW - 10,
    });
    const topY = y;
    y -= 4;
    drawWrapped(val, margin + labelW + 6, valueW, 9, false, dark);
    // align bottom of row
    const used = topY - y;
    if (used < rowH) y = topY - rowH;
  };

  section('ADMIN');
  let i = 0;
  const adminRows: [string, string][] = [
    ['Position to be recruited and number', `${text(form.positionTitle)}${form.headcount && form.headcount !== '1' ? ` (x${form.headcount})` : ''}`],
    ['Cost Center', form.costCenter],
    ['Head account in blueprint (Y/N)', form.headAccountBlueprint],
    ['If no, justification', form.headAccountJustification],
    ['Position Budgeted?', form.positionBudgeted],
    ['If no, justification', form.budgetJustification],
    ['New position or Replacement', form.newOrReplacement],
    ['Work Schedule', form.workSchedule],
  ];
  for (const [l, v] of adminRows) {
    if (!text(v) && (l.startsWith('If no') || l.includes('justification'))) continue;
    field(l, v, i % 2 === 1);
    i += 1;
  }

  section('JOB DETAIL');
  i = 0;
  for (const [l, v] of [
    ['Job title', form.jobTitle || form.positionTitle],
    ['Description of the job', form.jobDescription],
    ['Job level', form.jobLevel],
    ['Reports to', form.reportsTo],
    ['Location', form.location],
    ['Preferred start date', formatRrfDisplayDate(form.preferredStartDate)],
    ['Posting', form.posting],
  ] as [string, string][]) {
    field(l, v, i % 2 === 1);
    i += 1;
  }

  section('BENEFITS');
  i = 0;
  page.drawText('Yes / No', {
    x: margin + contentW * 0.38 + 6,
    y: y - 10,
    size: 8,
    font: bold,
    color: muted,
  });
  y -= 14;
  for (const [l, v] of [
    ['Car', yn(form.benefits.car)],
    ['Fuel Allowance', yn(form.benefits.fuelAllowance)],
    ['Housing', yn(form.benefits.housing)],
    ['Phone', yn(form.benefits.phone)],
    ['Laptop', yn(form.benefits.laptop)],
  ] as [string, string][]) {
    field(l, v, i % 2 === 1);
    i += 1;
  }

  section("APPROVER'S SIGNATURE");
  // Header Name | Signed | Date style
  ensureSpace(18);
  const cols = [0.4, 0.35, 0.25];
  const headers = ['Role / step', 'Name', 'Signed / Date'];
  let x = margin;
  page.drawRectangle({
    x: margin,
    y: y - 16,
    width: contentW,
    height: 16,
    color: headerBg,
    borderColor: line,
    borderWidth: 0.5,
  });
  for (let c = 0; c < 3; c++) {
    const w = contentW * cols[c];
    page.drawText(headers[c], {
      x: x + 5,
      y: y - 11,
      size: 8,
      font: bold,
      color: muted,
    });
    if (c > 0) {
      page.drawLine({
        start: { x, y },
        end: { x, y: y - 16 },
        thickness: 0.5,
        color: line,
      });
    }
    x += w;
  }
  y -= 16;

  const apr: [string, string][] = [
    ['Recruitment requested by', form.recruitmentRequestedBy],
    [form.lineManagerRole || 'Line Manager', form.lineManagerApprovedBy],
    [form.plantControllerRole || 'Plant/finance Controller', form.plantControllerApprovedBy],
    [form.headOfDeptRole || 'Head of department', form.headOfDeptApprovedBy],
    [form.talentManagerRole || 'Talent and Development Manager', form.talentManagerApprovedBy],
    [form.hrmRole || 'HRM', form.hrmApprovedBy],
    [form.excoRole || 'Exco Member / Plant Manager', form.excoApprovedBy],
  ];
  apr.forEach(([role, name], idx) => {
    const rowH = 18;
    ensureSpace(rowH);
    if (idx % 2 === 1) {
      page.drawRectangle({
        x: margin,
        y: y - rowH,
        width: contentW,
        height: rowH,
        color: altRow,
      });
    }
    page.drawRectangle({
      x: margin,
      y: y - rowH,
      width: contentW,
      height: rowH,
      borderColor: line,
      borderWidth: 0.5,
    });
    let cx = margin;
    const cells = [role, text(name) || '—', ''];
    for (let c = 0; c < 3; c++) {
      const w = contentW * cols[c];
      if (c > 0) {
        page.drawLine({
          start: { x: cx, y },
          end: { x: cx, y: y - rowH },
          thickness: 0.5,
          color: line,
        });
      }
      page.drawText(cells[c].slice(0, 42), {
        x: cx + 5,
        y: y - 12,
        size: 8,
        font: c === 0 ? bold : font,
        color: dark,
        maxWidth: w - 8,
      });
      cx += w;
    }
    y -= rowH;
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}
