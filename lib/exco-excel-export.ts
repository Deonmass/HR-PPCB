import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import ExcelJS from 'exceljs';
import type { ExcoReportPayload } from './exco-types';
import { formatExcoPeriodLabel } from './exco-types';
import { buildExcoSlidesPayload } from './exco-slides-data';
import { readExcoUploadBuffer } from './exco-uploads';
import { EXCO_BUNDLED_REPORT_PATH } from './exco-bundled-source';
import { STAFF_COST_FY_MONTHS } from './exco-staff-cost-model';
import type { ExcoWorkbookSnapshot } from './exco-new-report-parse';

export function buildExcoExcelFilename(year: number, month: number): string {
  const label = formatExcoPeriodLabel(year, month).replace(/\s+/g, '_');
  return `EXCO_HR_REPORT_${label}.xlsx`;
}

const TEMPLATE_REL = path.join('templates', 'exco', 'template.xlsx');

export async function resolveExcoExcelTemplatePath(): Promise<string> {
  const primary = path.join(process.cwd(), TEMPLATE_REL);
  try {
    await fs.access(primary);
    return primary;
  } catch {
    throw new Error(
      `Template Excel introuvable (${TEMPLATE_REL}). Placez template.xlsx dans templates/exco/.`,
    );
  }
}

function endOfMonthDate(year: number, month: number): Date {
  return new Date(year, month, 0, 12, 0, 0, 0);
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF7A1F2B' },
  };
  row.alignment = { vertical: 'middle', wrapText: true };
}

function autoWidth(ws: ExcelJS.Worksheet, min = 10, max = 42) {
  ws.columns.forEach((col) => {
    let w = min;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? '').length;
      w = Math.min(max, Math.max(w, len + 2));
    });
    col.width = w;
  });
}

function fyColIndex(calendarMonth: number): number {
  const idx = STAFF_COST_FY_MONTHS.indexOf(
    calendarMonth as (typeof STAFF_COST_FY_MONTHS)[number],
  );
  return idx >= 0 ? idx + 2 : -1; // B=2 …
}

function setPlainValue(cell: ExcelJS.Cell, value: number | string | Date | null | undefined) {
  if (value === null || value === undefined || value === '') return;
  // Ne pas écraser une formule existante sauf valeur d’entrée volontaire
  cell.value = value;
}

async function resolveSourceWorkbook(
  report: ExcoReportPayload,
): Promise<{ buffer: Buffer; label: string }> {
  const uploaded = await readExcoUploadBuffer(report.year, report.month, 'newReport');
  if (uploaded) {
    return {
      buffer: Buffer.from(uploaded.buffer),
      label: uploaded.originalName || 'newReport.xlsx',
    };
  }
  try {
    const templatePath = await resolveExcoExcelTemplatePath();
    return { buffer: await fs.readFile(templatePath), label: 'template.xlsx' };
  } catch {
    const bundled = await fs.readFile(EXCO_BUNDLED_REPORT_PATH);
    return { buffer: bundled, label: 'New report.xlsx' };
  }
}

function applyParams(wb: ExcelJS.Workbook, report: ExcoReportPayload) {
  const ws = wb.getWorksheet('Params');
  if (!ws) return;
  const fx = report.overlays.generationMeta?.fxRateFcPerUsd ?? null;
  if (fx != null && Number.isFinite(fx)) {
    ws.getCell('B2').value = fx;
  }
  ws.getCell('B3').value = endOfMonthDate(report.year, report.month);
}

function applyStaffCost(wb: ExcelJS.Workbook, snap: ExcoWorkbookSnapshot | null | undefined) {
  const ws = wb.getWorksheet('Staff_Cost_KPI');
  if (!ws || !snap?.staffCost?.length) return;

  for (const row of snap.staffCost) {
    const col = fyColIndex(row.calendarMonth);
    if (col < 0) continue;
    // Inputs (pas les formules chaînées) — aligné parse New report
    if (row.actualHeadcount != null) setPlainValue(ws.getCell(4, col), row.actualHeadcount);
    if (row.salariesActualYtd != null) setPlainValue(ws.getCell(5, col), row.salariesActualYtd);
    if (row.volumesActualYtd != null) setPlainValue(ws.getCell(6, col), row.volumesActualYtd);
    if (row.revenueActualYtd != null) setPlainValue(ws.getCell(7, col), row.revenueActualYtd);
    if (row.salariesBudgetYtd != null) setPlainValue(ws.getCell(10, col), row.salariesBudgetYtd);
    if (row.volumesBudgetYtd != null) setPlainValue(ws.getCell(11, col), row.volumesBudgetYtd);
    if (row.revenueBudgetYtd != null) setPlainValue(ws.getCell(12, col), row.revenueBudgetYtd);
  }
}

function applyInOut(wb: ExcelJS.Workbook, snap: ExcoWorkbookSnapshot | null | undefined) {
  const ws = wb.getWorksheet('IN OUT');
  if (!ws || !snap?.inOut) return;
  const opening = snap.inOut.months.find((m) => m.calendarMonth === 4)?.headcount
    ?? snap.inOut.months[0]?.headcount;
  if (opening != null) {
    const cell = ws.getCell('B8');
    if (!cell.formula) cell.value = opening;
  }
}

function appendPresentationSheets(wb: ExcelJS.Workbook, report: ExcoReportPayload) {
  const slides = buildExcoSlidesPayload(report);

  {
    const name = 'EXCO_CSR';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(['Name', 'Objective', 'Progress', 'Risks', 'Next steps']);
    styleHeader(ws.getRow(1));
    for (const row of slides.csr.fy27Rows) {
      ws.addRow([row.name, row.objective, row.progress, row.risks, row.nextSteps]);
    }
    autoWidth(ws, 14, 48);
  }

  {
    const name = 'EXCO_Cahier';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(['Icon', 'Title', 'Body', 'Progress %']);
    styleHeader(ws.getRow(1));
    for (const h of slides.cahier.highlights) {
      ws.addRow([h.icon || '', h.title || '', h.body || '', h.progressPct ?? 0]);
    }
    autoWidth(ws, 12, 50);
  }

  {
    const name = 'EXCO_Recruitment';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow([
      'Category', 'Position', 'Grade', 'Status', 'Comments',
      'Budgeted', 'Department', 'Location', 'Contract',
    ]);
    styleHeader(ws.getRow(1));
    for (const r of [...slides.recruitment.replacements, ...slides.recruitment.newPositions]) {
      ws.addRow([
        r.category, r.position, r.grade, r.status, r.comments,
        r.budgeted, r.department, r.location, r.contractType,
      ]);
    }
    autoWidth(ws, 10, 36);
  }

  {
    const name = 'EXCO_Audit';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(['#', 'Finding', 'Severity', 'Status', 'Due', 'Comments']);
    styleHeader(ws.getRow(1));
    for (const r of slides.audit.rows) {
      ws.addRow([
        r.number, r.finding, r.severity, r.status,
        r.dueDateLabel || r.dueDate || '', r.comments || '',
      ]);
    }
    autoWidth(ws, 10, 55);
  }

  {
    const name = 'EXCO_Gouvernance';
    if (wb.getWorksheet(name)) wb.removeWorksheet(name);
    const ws = wb.addWorksheet(name);
    ws.addRow(['Month', 'Closed %', 'Closed cumul', 'Current']);
    styleHeader(ws.getRow(1));
    for (const p of slides.gouvernance.progression) {
      ws.addRow([p.label, p.closedPct / 100, p.closedCumul, p.isCurrent ? 1 : 0]);
    }
    ws.getColumn(2).numFmt = '0%';
    ws.addRow([]);
    ws.addRow(['Audit total', slides.gouvernance.auditTotal]);
    ws.addRow(['Audit closed', slides.gouvernance.auditClosed]);
    ws.addRow(['Closed %', slides.gouvernance.auditClosedPct / 100]);
    ws.addRow(['Evolution', slides.gouvernance.evolutionText]);
    autoWidth(ws, 12, 60);
  }
}

/**
 * Export Excel = peuplement de `templates/exco/template.xlsx`
 * (ou New report de la période s’il a été uploadé).
 * Les formules Headacount / OVT / VLOOKUP sont conservées.
 */
export async function buildExcoExcelBuffer(report: ExcoReportPayload): Promise<Buffer> {
  const source = await resolveSourceWorkbook(report);
  const wb = new ExcelJS.Workbook();
  // ExcelJS typings expect Buffer; Uint8Array works at runtime.
  await wb.xlsx.load(source.buffer as unknown as ExcelJS.Buffer);

  applyParams(wb, report);
  const snap = report.overlays.workbookSnapshot || null;
  applyStaffCost(wb, snap);
  applyInOut(wb, snap);
  appendPresentationSheets(wb, report);

  wb.creator = 'HR RH App';
  wb.title = `EXCO HR Report — ${formatExcoPeriodLabel(report.year, report.month)}`;
  wb.description = `Peuplé depuis ${source.label}`;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
