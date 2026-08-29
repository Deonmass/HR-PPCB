import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import * as XLSX from 'xlsx';
import { parseExcoNewReport, type ExcoWorkbookSnapshot } from './exco-new-report-parse';
import { applyPptxBaselineToOverlays, loadExcoPptxExtracted } from './exco-pptx-baseline';
import { buildExcoReport } from './exco-report';
import {
  getExcoOverlays,
  getExcoYearLeaveImports,
  getExcoYearOvertimeImports,
  saveExcoOverlays,
} from './exco-store';
import type { ExcoOverlays } from './exco-types';
import { readExcoUploadBuffer } from './exco-uploads';
import type { ExcoBundledPayload, ExcoSheetTable } from './exco-workbook-types';

export type { ExcoBundledPayload, ExcoSheetTable } from './exco-workbook-types';

export const EXCO_BUNDLED_REPORT_PATH = path.join(
  process.cwd(),
  'data',
  'exco',
  'sources',
  'New report.xlsx',
);

const SHEET_LABELS: Record<string, string> = {
  Params: 'Params',
  BASE: 'BASE',
  Headacount: 'Headcount',
  Headcount: 'Headcount',
  'IN OUT': 'IN / OUT',
  Staff_Cost_KPI: 'Staff Cost',
  OVT: 'OVT',
  overtime_base: 'Overtime base',
  leavebalances_base: 'Leave balances',
};

function cellDisplay(value: unknown): string | number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const shifted = new Date(value.getTime() + 12 * 60 * 60 * 1000);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const s = String(value).trim();
  return s || null;
}

export function readExcoWorkbookSheets(buffer: ArrayBuffer): ExcoSheetTable[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  return wb.SheetNames.map((name) => {
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
      header: 1,
      defval: null,
      raw: true,
    }) as unknown[][];
    const rows = matrix.map((row) =>
      (row || []).map((cell) => cellDisplay(cell)),
    );
    const colCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
    const normalized = rows.map((row) => {
      const next = row.slice();
      while (next.length < colCount) next.push(null);
      return next;
    });
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      label: SHEET_LABELS[name] || name,
      rows: normalized,
      rowCount: normalized.length,
      colCount,
    };
  });
}

async function persistSnapshot(
  snap: ExcoWorkbookSnapshot,
  sourceFile: string,
): Promise<ExcoOverlays> {
  const { year, month, fxRateFcPerUsd } = snap.params;
  const { overlays } = await getExcoOverlays(year, month);
  const yearOt = await getExcoYearOvertimeImports(year);
  const yearLeave = await getExcoYearLeaveImports(year);

  const snapKpisWithoutFileImports = { ...(snap.manualKpis || {}) };
  delete snapKpisWithoutFileImports.overtimeCost;
  delete snapKpisWithoutFileImports.leaveBalanceAvgDays;
  delete snapKpisWithoutFileImports.leaveCost;

  let nextOverlays: ExcoOverlays = {
    ...overlays,
    workbookSnapshot: snap,
    overtimeImportsByMonth: {
      ...yearOt,
      ...(overlays.overtimeImportsByMonth || {}),
    },
    leaveImportsByMonth: {
      ...yearLeave,
      ...(overlays.leaveImportsByMonth || {}),
    },
    leaveBalanceByMatricule: {
      ...(overlays.leaveBalanceByMatricule || {}),
    },
    overtimeCostByDept: {
      ...(overlays.overtimeCostByDept || {}),
    },
    manualKpis: {
      ...overlays.manualKpis,
      ...snapKpisWithoutFileImports,
    },
    financeByMonth: {
      ...(overlays.financeByMonth || {}),
      ...snap.financeByMonth,
    },
    generationMeta: {
      fxRateFcPerUsd,
      generatedAt: new Date().toISOString(),
      sourceFiles: [sourceFile],
    },
  };

  nextOverlays = await applyPptxBaselineToOverlays(nextOverlays, { force: true });
  await saveExcoOverlays(year, month, nextOverlays, 'system');

  // New report contient l’historique depuis avril → stocker finance / IN-OUT par mois
  for (const [mKey, fin] of Object.entries(snap.financeByMonth || {})) {
    const m = Number(mKey);
    if (!Number.isInteger(m) || m < 1 || m > 12 || m === month) continue;
    const { overlays: other } = await getExcoOverlays(year, m);
    await saveExcoOverlays(
      year,
      m,
      {
        ...other,
        financeByMonth: {
          ...(other.financeByMonth || {}),
          [mKey]: {
            ...(other.financeByMonth?.[mKey] || {}),
            ...fin,
          },
        },
        generationMeta: {
          fxRateFcPerUsd:
            other.generationMeta?.fxRateFcPerUsd ?? snap.params.fxRateFcPerUsd,
          generatedAt: new Date().toISOString(),
          sourceFiles: [
            ...new Set([
              ...(other.generationMeta?.sourceFiles || []),
              sourceFile,
            ]),
          ],
        },
      },
      'system',
    );
  }

  for (const row of snap.inOut?.months || []) {
    const m = row.calendarMonth;
    if (!m || m === month) continue;
    const { overlays: other } = await getExcoOverlays(year, m);
    await saveExcoOverlays(
      year,
      m,
      {
        ...other,
        manualKpis: {
          ...other.manualKpis,
          ...(row.headcount != null ? { headcount: row.headcount } : {}),
          ...(row.in != null ? { hires: row.in } : {}),
          ...(row.out != null ? { exits: row.out } : {}),
          ...(row.turnover != null ? { turnoverPct: row.turnover } : {}),
          ...(row.attritionRate != null ? { attritionPct: row.attritionRate } : {}),
        },
        generationMeta: {
          fxRateFcPerUsd:
            other.generationMeta?.fxRateFcPerUsd ?? snap.params.fxRateFcPerUsd,
          generatedAt: new Date().toISOString(),
          sourceFiles: [
            ...new Set([
              ...(other.generationMeta?.sourceFiles || []),
              sourceFile,
            ]),
          ],
        },
      },
      'system',
    );
  }

  return nextOverlays;
}

/** Charge New report.xlsx bundlé, persiste si besoin, renvoie feuilles + rapport. */
export async function loadBundledExcoWorkbook(): Promise<ExcoBundledPayload> {
  const fileBuf = await fs.readFile(EXCO_BUNDLED_REPORT_PATH);
  const ab = fileBuf.buffer.slice(
    fileBuf.byteOffset,
    fileBuf.byteOffset + fileBuf.byteLength,
  );
  const sourceFile = 'New report.xlsx';
  let snap = parseExcoNewReport(ab, sourceFile);
  const sheets = readExcoWorkbookSheets(ab);

  // Prefer uploaded Leave Balances (Mco + Qco) for Annual Closing averages
  const { year, month } = snap.params;
  const leaveUpload = await readExcoUploadBuffer(year, month, 'leaveBalances');
  if (leaveUpload) {
    const { readEmployeesBundle } = await import('./employees-json-store');
    const { buildExcoLeaveMonthImport } = await import('./exco-ot-import');
    const bundle = await readEmployeesBundle();
    const localisationByMatricule: Record<string, string> = {};
    for (const e of [...(bundle.employees || []), ...(bundle.exits || [])]) {
      const mat = String(e.matricule || '').trim();
      if (mat) localisationByMatricule[mat] = String(e.localisation || '');
    }
    const leaveFromUpload = buildExcoLeaveMonthImport({
      year,
      month,
      leaveBuffer: leaveUpload.buffer,
      fxRateFcPerUsd: snap.params.fxRateFcPerUsd,
      localisationByMatricule,
      sourceFiles: [leaveUpload.originalName],
    });
    // Enrich OT leave balances from Annual Closing
    const topEmployees = snap.ot.topEmployees.map((e) => ({
      ...e,
      leaveBalance: leaveFromUpload.byMatricule[e.matricule] ?? e.leaveBalance,
    }));
    snap = {
      ...snap,
      leave: leaveFromUpload,
      ot: {
        ...snap.ot,
        topEmployees,
        averageLeaveDays: leaveFromUpload.allAvgDays,
      },
      overtimeImport: {
        ...snap.overtimeImport,
        employees: snap.overtimeImport.employees.map((e) => ({
          ...e,
          leaveBalance: leaveFromUpload.byMatricule[e.matricule] ?? e.leaveBalance,
        })),
      },
      manualKpis: {
        ...snap.manualKpis,
        leaveBalanceAvgDays: leaveFromUpload.allAvgDays,
        leaveCost: leaveFromUpload.leaveCostUsd ?? snap.manualKpis.leaveCost,
      },
    };
  }

  const { overlays } = await getExcoOverlays(snap.params.year, snap.params.month);
  const needsPersist =
    !overlays.workbookSnapshot
    || overlays.workbookSnapshot.params.year !== snap.params.year
    || overlays.workbookSnapshot.params.month !== snap.params.month
    || overlays.workbookSnapshot.headcount.headcount !== snap.headcount.headcount
    || !(overlays.generationMeta?.sourceFiles || []).includes(sourceFile);

  if (needsPersist) {
    await persistSnapshot(snap, sourceFile);
  }

  const report = await buildExcoReport(snap.params.year, snap.params.month);
  const pptx = await loadExcoPptxExtracted();

  // Noms système pour l’onglet BASE (matricule → nom)
  const { readEmployeesBundle } = await import('./employees-json-store');
  const bundle = await readEmployeesBundle();
  const namesByMatricule: Record<string, string> = {};
  for (const e of [...(bundle.employees || []), ...(bundle.exits || [])]) {
    const mat = String(e.matricule || '').trim();
    if (mat && e.nom) namesByMatricule[mat] = e.nom;
  }

  return {
    sourceFile,
    params: snap.params,
    sheets,
    snapshot: snap,
    report,
    pptx,
    namesByMatricule,
  };
}
