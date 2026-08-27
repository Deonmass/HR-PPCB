import { NextResponse } from 'next/server';
import { parseExcoNewReport } from '@/lib/exco-new-report-parse';
import { applyPptxBaselineToOverlays } from '@/lib/exco-pptx-baseline';
import { buildExcoReport } from '@/lib/exco-report';
import {
  getExcoOverlays,
  getExcoYearLeaveImports,
  getExcoYearOvertimeImports,
  saveExcoOverlays,
} from '@/lib/exco-store';
import type { ExcoOverlays } from '@/lib/exco-types';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';

/**
 * Import du classeur unique « New report.xlsx ».
 * - Mois + taux lus dans Params
 * - Chiffres issus des feuilles du classeur
 * - Narrative / CSR / recrutement / audit issus de l’extraction PPTX
 */
export async function POST(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;

  try {
    const form = await request.formData();
    const reportFile = form.get('reportFile') ?? form.get('newReport') ?? form.get('componentFile');
    if (!(reportFile instanceof File) || reportFile.size <= 0) {
      return NextResponse.json(
        { error: 'Fichier « New report.xlsx » requis' },
        { status: 400 },
      );
    }

    const buffer = await reportFile.arrayBuffer();
    const snap = parseExcoNewReport(buffer, reportFile.name);
    const { year, month, fxRateFcPerUsd } = snap.params;

    const { overlays } = await getExcoOverlays(year, month);
    const yearOt = await getExcoYearOvertimeImports(year);
    const yearLeave = await getExcoYearLeaveImports(year);

    const overtimeCostByDept: Record<string, number | null> = {
      ...(overlays.overtimeCostByDept || {}),
    };
    for (const d of snap.ot.byDeptCurrent) {
      overtimeCostByDept[d.department] = d.cost;
    }

    let nextOverlays: ExcoOverlays = {
      ...overlays,
      workbookSnapshot: snap,
      overtimeImportsByMonth: {
        ...yearOt,
        ...(overlays.overtimeImportsByMonth || {}),
        [String(month)]: snap.overtimeImport,
      },
      leaveImportsByMonth: {
        ...yearLeave,
        ...(overlays.leaveImportsByMonth || {}),
        [String(month)]: snap.leave,
      },
      leaveBalanceByMatricule: {
        ...(overlays.leaveBalanceByMatricule || {}),
        ...snap.leave.byMatricule,
      },
      overtimeCostByDept,
      manualKpis: {
        ...overlays.manualKpis,
        ...snap.manualKpis,
      },
      financeByMonth: {
        ...(overlays.financeByMonth || {}),
        ...snap.financeByMonth,
      },
      generationMeta: {
        fxRateFcPerUsd,
        generatedAt: new Date().toISOString(),
        sourceFiles: [reportFile.name],
      },
    };

    // Extraction exacte de la présentation (narrative, CSR, recrutement, audit)
    nextOverlays = await applyPptxBaselineToOverlays(nextOverlays, { force: true });

    const actor = await getAuditActor();
    await withAudit(
      {
        module: 'exco',
        action: 'update',
        entityType: 'exco-report-import',
        entityId: `${year}-${String(month).padStart(2, '0')}`,
        summary: `Import New report EXCO ${month}/${year} — ${snap.employees.length} employés`,
        path: '/api/exco/import-report',
        method: 'POST',
      },
      () => saveExcoOverlays(year, month, nextOverlays, actor?.userName),
    );

    const report = await buildExcoReport(year, month);
    return NextResponse.json({
      ok: true,
      year,
      month,
      fxRateFcPerUsd,
      headcount: snap.headcount.headcount,
      employees: snap.employees.length,
      otEmployees: snap.ot.employeesWithOt,
      leaveCostUsd: snap.leave.leaveCostUsd,
      report,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
