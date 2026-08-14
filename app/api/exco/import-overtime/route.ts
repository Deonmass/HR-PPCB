import { NextResponse } from 'next/server';
import {
  buildExcoLeaveMonthImport,
  buildExcoOtMonthImport,
  excoLeaveCostUsdFromSnap,
} from '@/lib/exco-ot-import';
import { buildExcoReport } from '@/lib/exco-report';
import {
  getExcoOverlays,
  getExcoYearLeaveImports,
  getExcoYearOvertimeImports,
  saveExcoOverlays,
} from '@/lib/exco-store';
import { readEmployeesBundle } from '@/lib/employees-json-store';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;

  try {
    const form = await request.formData();
    const year = Number(form.get('year'));
    const month = Number(form.get('month'));
    const fxRaw = String(form.get('fxRateFcPerUsd') || '').trim();
    const fxRateFcPerUsd = fxRaw ? Number(fxRaw.replace(',', '.')) : null;

    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Année invalide' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Mois invalide' }, { status: 400 });
    }

    const componentFile = form.get('componentFile');
    if (!(componentFile instanceof File)) {
      return NextResponse.json(
        { error: 'Fichier Component Posted Units requis' },
        { status: 400 },
      );
    }
    const leaveFile = form.get('leaveFile');
    const leave =
      leaveFile instanceof File && leaveFile.size > 0 ? leaveFile : null;

    const componentBuffer = await componentFile.arrayBuffer();
    const leaveBuffer = leave ? await leave.arrayBuffer() : null;

    const snapshot = buildExcoOtMonthImport({
      year,
      month,
      componentBuffer,
      leaveBuffer,
      fxRateFcPerUsd:
        fxRateFcPerUsd != null && Number.isFinite(fxRateFcPerUsd) ? fxRateFcPerUsd : null,
      sourceFiles: [componentFile.name, leave?.name].filter(Boolean) as string[],
    });

    if (!snapshot.employees.length) {
      return NextResponse.json(
        { error: 'Aucune ligne OT trouvée (matricule / Units / Component Value)' },
        { status: 400 },
      );
    }

    const { overlays } = await getExcoOverlays(year, month);
    const yearOt = await getExcoYearOvertimeImports(year);
    const yearLeave = await getExcoYearLeaveImports(year);

    const leaveBalanceByMatricule = { ...(overlays.leaveBalanceByMatricule || {}) };
    for (const e of snapshot.employees) {
      if (e.leaveBalance != null) leaveBalanceByMatricule[e.matricule] = e.leaveBalance;
    }

    let leaveSnapshot = overlays.leaveImportsByMonth?.[String(month)] || null;
    if (leaveBuffer) {
      const bundle = await readEmployeesBundle();
      const localisationByMatricule: Record<string, string> = {};
      for (const e of [...(bundle.employees || []), ...(bundle.exits || [])]) {
        if (e.matricule) localisationByMatricule[e.matricule] = e.localisation || '';
      }
      leaveSnapshot = buildExcoLeaveMonthImport({
        year,
        month,
        leaveBuffer,
        fxRateFcPerUsd:
          fxRateFcPerUsd != null && Number.isFinite(fxRateFcPerUsd) ? fxRateFcPerUsd : null,
        localisationByMatricule,
        sourceFiles: [leave!.name],
      });
      for (const [mat, bal] of Object.entries(leaveSnapshot.byMatricule)) {
        leaveBalanceByMatricule[mat] = bal;
      }
    }

    const overtimeCostByDept = { ...(overlays.overtimeCostByDept || {}) };
    if (snapshot.fxRateFcPerUsd != null && snapshot.fxRateFcPerUsd > 0) {
      for (const d of snapshot.byDept) {
        overtimeCostByDept[d.department] =
          Math.round((d.costFc / snapshot.fxRateFcPerUsd) * 100) / 100;
      }
    }

    const nextOverlays = {
      ...overlays,
      overtimeImportsByMonth: {
        ...yearOt,
        ...(overlays.overtimeImportsByMonth || {}),
        [String(month)]: snapshot,
      },
      leaveImportsByMonth: {
        ...yearLeave,
        ...(overlays.leaveImportsByMonth || {}),
        ...(leaveSnapshot ? { [String(month)]: leaveSnapshot } : {}),
      },
      leaveBalanceByMatricule,
      overtimeCostByDept,
      manualKpis: {
        ...overlays.manualKpis,
        overtimeCost:
          snapshot.fxRateFcPerUsd != null && snapshot.fxRateFcPerUsd > 0
            ? Math.round(
                (snapshot.employees.reduce((s, e) => s + e.costFc, 0) /
                  snapshot.fxRateFcPerUsd) *
                  100,
              ) / 100
            : overlays.manualKpis.overtimeCost ?? null,
        leaveBalanceAvgDays:
          leaveSnapshot?.allAvgDays ?? overlays.manualKpis.leaveBalanceAvgDays ?? null,
        leaveCost:
          excoLeaveCostUsdFromSnap(leaveSnapshot) ?? overlays.manualKpis.leaveCost ?? null,
      },
      financeByMonth: {
        ...(overlays.financeByMonth || {}),
        [String(month)]: {
          ...(overlays.financeByMonth?.[String(month)] || {}),
          ...overlays.manualKpis,
          overtimeCost:
            snapshot.fxRateFcPerUsd != null && snapshot.fxRateFcPerUsd > 0
              ? Math.round(
                  (snapshot.employees.reduce((s, e) => s + e.costFc, 0) /
                    snapshot.fxRateFcPerUsd) *
                    100,
                ) / 100
              : overlays.manualKpis.overtimeCost ?? null,
          leaveBalanceAvgDays:
            leaveSnapshot?.allAvgDays ?? overlays.manualKpis.leaveBalanceAvgDays ?? null,
          leaveCost:
            excoLeaveCostUsdFromSnap(leaveSnapshot) ?? overlays.manualKpis.leaveCost ?? null,
        },
      },
      generationMeta: {
        fxRateFcPerUsd:
          snapshot.fxRateFcPerUsd ?? leaveSnapshot?.fxRateFcPerUsd ?? null,
        generatedAt: new Date().toISOString(),
        sourceFiles: [
          componentFile.name,
          ...(leave ? [leave.name] : []),
        ],
      },
    };

    const actor = await getAuditActor();
    await withAudit(
      {
        module: 'exco',
        action: 'update',
        entityType: 'exco-ot-import',
        entityId: `${year}-${String(month).padStart(2, '0')}`,
        summary: `Import OT EXCO ${month}/${year} — ${snapshot.employees.length} agents`,
        path: '/api/exco/import-overtime',
        method: 'POST',
      },
      () => saveExcoOverlays(year, month, nextOverlays, actor?.userName),
    );

    const report = await buildExcoReport(year, month);
    return NextResponse.json({
      ok: true,
      employees: snapshot.employees.length,
      departments: snapshot.byDept.length,
      withLeave: snapshot.employees.filter((e) => e.leaveBalance != null).length,
      leaveAll: leaveSnapshot?.counts?.all ?? 0,
      leavePlant: leaveSnapshot?.plantAvgDays ?? null,
      leaveHq: leaveSnapshot?.hqAvgDays ?? null,
      leaveLubudi: leaveSnapshot?.lubudiAvgDays ?? null,
      report,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Import impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
