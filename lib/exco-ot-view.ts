/**
 * Vue Overtime EXCO : agrégation CPU + leave Annual convertie en USD.
 */
import 'server-only';

import {
  buildExcoLeaveMonthImport,
  buildExcoOtMonthImport,
  mapExcoOtDepartment,
  parseComponentPostedUnits,
  parseLeaveBalancesDetailed,
} from './exco-ot-import';
import { readExcoUploadBuffer } from './exco-uploads';
import { readEmployeesBundle } from './employees-json-store';
import { getExcoOverlays } from './exco-store';

export interface ExcoOtAgentRow {
  matricule: string;
  name: string;
  hours: number;
  costFc: number;
  costUsd: number | null;
  leaveDays: number | null;
  leaveValueFc: number | null;
  leaveValueUsd: number | null;
  department: string;
  companyHint: string;
}

export interface ExcoOtViewResult {
  year: number;
  month: number;
  fxRateFcPerUsd: number | null;
  rows: ExcoOtAgentRow[];
  totals: {
    agents: number;
    hours: number;
    costUsd: number | null;
    leaveValueUsd: number | null;
  };
  byDepartment: Array<{ department: string; hours: number; costUsd: number; agents: number }>;
  sourceFiles: string[];
  missing: { overtime: boolean; leave: boolean };
}

export async function buildExcoOtView(input: {
  year: number;
  month: number;
  fxRateFcPerUsd?: number | null;
}): Promise<ExcoOtViewResult> {
  const { year, month } = input;
  const { overlays } = await getExcoOverlays(year, month);
  const fx =
    input.fxRateFcPerUsd
    ?? overlays.generationMeta?.fxRateFcPerUsd
    ?? null;

  const otUpload = await readExcoUploadBuffer(year, month, 'componentPostedUnits');
  const leaveUpload = await readExcoUploadBuffer(year, month, 'leaveBalances');
  const sourceFiles: string[] = [];
  if (otUpload) sourceFiles.push(otUpload.originalName);
  if (leaveUpload) sourceFiles.push(leaveUpload.originalName);

  const leaveDetailed = leaveUpload
    ? parseLeaveBalancesDetailed(leaveUpload.buffer)
    : { byMatricule: new Map(), valueFcTotal: 0, valueFcBySheet: [] as number[] };

  const leaveByMat = new Map<string, { days: number; valueFc: number }>();
  for (const [mat, row] of leaveDetailed.byMatricule.entries()) {
    leaveByMat.set(mat, {
      days: row.leaveBalance,
      valueFc: row.valueFc ?? 0,
    });
  }

  let agents: Array<{
    matricule: string;
    nom: string;
    orgUnit: string;
    hours: number;
    costFc: number;
  }> = [];

  if (otUpload) {
    agents = parseComponentPostedUnits(otUpload.buffer);
  } else if (overlays.overtimeImportsByMonth?.[String(month)]) {
    const snap = overlays.overtimeImportsByMonth[String(month)];
    agents = snap.employees.map((e) => ({
      matricule: e.matricule,
      nom: e.nom,
      orgUnit: e.departmentRaw || e.department,
      hours: e.hours,
      costFc: e.costFc,
    }));
  }

  const rows: ExcoOtAgentRow[] = agents
    .map((a) => {
      const leave = leaveByMat.get(a.matricule);
      const costUsd =
        fx != null && fx > 0 ? Math.round((a.costFc / fx) * 100) / 100 : null;
      const leaveValueUsd =
        leave && fx != null && fx > 0
          ? Math.round((leave.valueFc / fx) * 100) / 100
          : null;
      return {
        matricule: a.matricule,
        name: a.nom,
        hours: a.hours,
        costFc: a.costFc,
        costUsd,
        leaveDays: leave?.days ?? null,
        leaveValueFc: leave?.valueFc ?? null,
        leaveValueUsd,
        department: mapExcoOtDepartment(a.orgUnit),
        companyHint: a.orgUnit,
      };
    })
    .sort((a, b) => b.hours - a.hours);

  const byDeptMap = new Map<string, { hours: number; costUsd: number; agents: number }>();
  for (const row of rows) {
    const prev = byDeptMap.get(row.department) || { hours: 0, costUsd: 0, agents: 0 };
    prev.hours += row.hours;
    prev.costUsd += row.costUsd ?? 0;
    prev.agents += 1;
    byDeptMap.set(row.department, prev);
  }

  const totalHours = Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100;
  const totalCostUsd =
    fx != null && fx > 0
      ? Math.round(rows.reduce((s, r) => s + (r.costUsd ?? 0), 0) * 100) / 100
      : null;
  const totalLeaveUsd =
    fx != null && fx > 0
      ? Math.round(rows.reduce((s, r) => s + (r.leaveValueUsd ?? 0), 0) * 100) / 100
      : null;

  // Persister snapshots utiles si fichiers présents
  if (otUpload) {
    const snap = buildExcoOtMonthImport({
      year,
      month,
      componentBuffer: otUpload.buffer,
      leaveBuffer: leaveUpload?.buffer ?? null,
      fxRateFcPerUsd: fx,
      sourceFiles,
    });
    void snap;
  }
  if (leaveUpload) {
    const bundle = await readEmployeesBundle();
    const localisationByMatricule: Record<string, string> = {};
    for (const e of [...(bundle.employees || []), ...(bundle.exits || [])]) {
      if (e.matricule) localisationByMatricule[e.matricule] = e.localisation || '';
    }
    void buildExcoLeaveMonthImport({
      year,
      month,
      leaveBuffer: leaveUpload.buffer,
      fxRateFcPerUsd: fx,
      localisationByMatricule,
      sourceFiles: leaveUpload ? [leaveUpload.originalName] : [],
    });
  }

  return {
    year,
    month,
    fxRateFcPerUsd: fx,
    rows,
    totals: {
      agents: rows.length,
      hours: totalHours,
      costUsd: totalCostUsd,
      leaveValueUsd: totalLeaveUsd,
    },
    byDepartment: [...byDeptMap.entries()]
      .map(([department, v]) => ({
        department,
        hours: Math.round(v.hours * 100) / 100,
        costUsd: Math.round(v.costUsd * 100) / 100,
        agents: v.agents,
      }))
      .sort((a, b) => b.hours - a.hours),
    sourceFiles,
    missing: {
      overtime: !otUpload && !overlays.overtimeImportsByMonth?.[String(month)],
      leave: !leaveUpload,
    },
  };
}
