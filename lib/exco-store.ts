import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import {
  DURABLE_EXCO_REPORTS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import {
  emptyExcoOverlays,
  periodKey,
  type ExcoOverlays,
  type ExcoReportRecord,
} from './exco-types';
import { normalizeCahierHighlights, normalizeCsrFy27Rows } from './exco-csr-fy27';
import { canPersistProjectFiles, getWritableDataRoot } from './runtime-mode';

interface StoreData {
  reports: ExcoReportRecord[];
}

function resolvePath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'exco', 'reports.json');
  }
  const writable = path.join(getWritableDataRoot(), 'exco', 'reports.json');
  const bundled = path.join(process.cwd(), 'data', 'exco', 'reports.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

function mergeOverlays(raw: Partial<ExcoOverlays> | undefined): ExcoOverlays {
  const base = emptyExcoOverlays();
  if (!raw || typeof raw !== 'object') return base;
  return {
    manualKpis: { ...base.manualKpis, ...(raw.manualKpis || {}) },
    financeByMonth: { ...(raw.financeByMonth || {}) },
    staffCostYtdByMonth: { ...(raw.staffCostYtdByMonth || {}) },
    staffCostFormulaNotes: { ...(raw.staffCostFormulaNotes || {}) },
    narrative: { ...base.narrative, ...(raw.narrative || {}) },
    recruitment: Array.isArray(raw.recruitment) ? raw.recruitment : [],
    auditFindings: Array.isArray(raw.auditFindings) ? raw.auditFindings : [],
    isoActions: Array.isArray(raw.isoActions) ? raw.isoActions : [],
    csrProjects: Array.isArray(raw.csrProjects) ? raw.csrProjects : [],
    csrFy27Rows: normalizeCsrFy27Rows(raw.csrFy27Rows),
    cahierHighlights: normalizeCahierHighlights(raw.cahierHighlights),
    trainingTopics: Array.isArray(raw.trainingTopics) ? raw.trainingTopics : [],
    upcomingTrainings: Array.isArray(raw.upcomingTrainings) ? raw.upcomingTrainings : [],
    policies: {
      expiredPendingUpdate: Array.isArray(raw.policies?.expiredPendingUpdate)
        ? raw.policies!.expiredPendingUpdate
        : [],
      submittedToExco: Array.isArray(raw.policies?.submittedToExco)
        ? raw.policies!.submittedToExco
        : [],
      pendingPublication: Array.isArray(raw.policies?.pendingPublication)
        ? raw.policies!.pendingPublication
        : [],
      underCommunication: Array.isArray(raw.policies?.underCommunication)
        ? raw.policies!.underCommunication
        : [],
    },
    overtimeCostByDept: { ...(raw.overtimeCostByDept || {}) },
    leaveBalanceByMatricule: { ...(raw.leaveBalanceByMatricule || {}) },
    overtimeImportsByMonth: { ...(raw.overtimeImportsByMonth || {}) },
    leaveImportsByMonth: { ...(raw.leaveImportsByMonth || {}) },
    engagementsImportsByMonth: { ...(raw.engagementsImportsByMonth || {}) },
    importedSources: { ...(raw.importedSources || {}) },
    workbookSnapshot: raw.workbookSnapshot ?? null,
    generationMeta:
      raw.generationMeta && typeof raw.generationMeta === 'object'
        ? {
            fxRateFcPerUsd:
              raw.generationMeta.fxRateFcPerUsd != null
                ? Number(raw.generationMeta.fxRateFcPerUsd)
                : null,
            generatedAt: String(raw.generationMeta.generatedAt || ''),
            sourceFiles: Array.isArray(raw.generationMeta.sourceFiles)
              ? raw.generationMeta.sourceFiles.map(String)
              : [],
          }
        : null,
  };
}

function normalizeRecord(raw: unknown): ExcoReportRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ExcoReportRecord>;
  const year = Number(r.year);
  const month = Number(r.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }
  return {
    year,
    month,
    overlays: mergeOverlays(r.overlays),
    updatedAt: String(r.updatedAt || new Date().toISOString()),
    updatedBy: r.updatedBy ? String(r.updatedBy) : undefined,
  };
}

async function readStore(): Promise<StoreData> {
  const filePath = resolvePath();
  await hydrateDurableFile(DURABLE_EXCO_REPORTS_KEY, filePath);
  try {
    const raw = await fsPromises.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as Partial<StoreData>;
    const reports = Array.isArray(parsed.reports)
      ? parsed.reports.map(normalizeRecord).filter((r): r is ExcoReportRecord => Boolean(r))
      : [];
    return { reports };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { reports: [] };
    throw err;
  }
}

async function writeStore(store: StoreData): Promise<void> {
  const filePath = resolvePath();
  await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  await fsPromises.writeFile(filePath, JSON.stringify(store, null, 2), 'utf8');
  await persistDurableFile(DURABLE_EXCO_REPORTS_KEY, filePath);
}

export async function getExcoOverlays(
  year: number,
  month: number,
): Promise<{ overlays: ExcoOverlays; updatedAt: string | null; updatedBy: string | null }> {
  const store = await readStore();
  const key = periodKey(year, month);
  const found = store.reports.find((r) => periodKey(r.year, r.month) === key);
  if (!found) {
    return { overlays: emptyExcoOverlays(), updatedAt: null, updatedBy: null };
  }
  return {
    overlays: found.overlays,
    updatedAt: found.updatedAt,
    updatedBy: found.updatedBy ?? null,
  };
}

/** Agrège les imports OT de tous les mois d’une année civile (le plus récent gagne). */
export async function getExcoYearOvertimeImports(
  year: number,
): Promise<ExcoOverlays['overtimeImportsByMonth']> {
  const store = await readStore();
  const merged: ExcoOverlays['overtimeImportsByMonth'] = {};
  const yearReports = store.reports
    .filter((r) => r.year === year)
    .sort((a, b) => a.month - b.month || a.updatedAt.localeCompare(b.updatedAt));
  for (const report of yearReports) {
    const map = report.overlays.overtimeImportsByMonth || {};
    for (const [k, snap] of Object.entries(map)) {
      if (!snap) continue;
      const prev = merged[k];
      if (!prev) {
        merged[k] = snap;
        continue;
      }
      // Préférer un import avec agents au baseline template
      const prevHasEmp = (prev.employees?.length || 0) > 0;
      const nextHasEmp = (snap.employees?.length || 0) > 0;
      if (nextHasEmp && !prevHasEmp) merged[k] = snap;
      else if (nextHasEmp === prevHasEmp && (snap.importedAt || '') >= (prev.importedAt || '')) {
        merged[k] = snap;
      }
    }
  }
  return merged;
}

/** Agrège les imports Leave de tous les mois d’une année civile. */
export async function getExcoYearLeaveImports(
  year: number,
): Promise<ExcoOverlays['leaveImportsByMonth']> {
  const store = await readStore();
  const merged: ExcoOverlays['leaveImportsByMonth'] = {};
  const yearReports = store.reports
    .filter((r) => r.year === year)
    .sort((a, b) => a.month - b.month || a.updatedAt.localeCompare(b.updatedAt));
  for (const report of yearReports) {
    const map = report.overlays.leaveImportsByMonth || {};
    for (const [k, snap] of Object.entries(map)) {
      if (!snap) continue;
      const prev = merged[k];
      if (!prev) {
        merged[k] = snap;
        continue;
      }
      const prevReal = (prev.counts?.all || 0) > 0 && prev.sourceFiles?.[0] !== 'template-baseline';
      const nextReal = (snap.counts?.all || 0) > 0 && snap.sourceFiles?.[0] !== 'template-baseline';
      if (nextReal && !prevReal) merged[k] = snap;
      else if (nextReal === prevReal && (snap.importedAt || '') >= (prev.importedAt || '')) {
        merged[k] = snap;
      }
    }
  }
  return merged;
}

export async function listExcoSavedPeriods(): Promise<
  Array<{
    year: number;
    month: number;
    updatedAt: string;
    fxRateFcPerUsd: number | null;
    hasOtImport: boolean;
    hasLeaveImport: boolean;
  }>
> {
  const store = await readStore();
  return store.reports
    .map((r) => ({
      year: r.year,
      month: r.month,
      updatedAt: r.updatedAt,
      fxRateFcPerUsd: r.overlays.generationMeta?.fxRateFcPerUsd ?? null,
      hasOtImport: Boolean(
        Object.values(r.overlays.overtimeImportsByMonth || {}).some(
          (s) => (s?.employees?.length || 0) > 0,
        ),
      ),
      hasLeaveImport: Boolean(
        Object.values(r.overlays.leaveImportsByMonth || {}).some(
          (s) => (s?.counts?.all || 0) > 0,
        ),
      ),
    }))
    .sort((a, b) => periodKey(b.year, b.month).localeCompare(periodKey(a.year, a.month)));
}

export async function saveExcoOverlays(
  year: number,
  month: number,
  overlays: ExcoOverlays,
  updatedBy?: string,
): Promise<ExcoReportRecord> {
  const store = await readStore();
  const key = periodKey(year, month);
  const now = new Date().toISOString();
  const record: ExcoReportRecord = {
    year,
    month,
    overlays: mergeOverlays(overlays),
    updatedAt: now,
    updatedBy,
  };
  const idx = store.reports.findIndex((r) => periodKey(r.year, r.month) === key);
  if (idx >= 0) store.reports[idx] = record;
  else store.reports.push(record);
  store.reports.sort((a, b) => periodKey(b.year, b.month).localeCompare(periodKey(a.year, a.month)));
  await writeStore(store);
  return record;
}
