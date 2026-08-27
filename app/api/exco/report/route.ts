import { NextResponse } from 'next/server';
import { buildExcoReport } from '@/lib/exco-report';
import { listExcoSavedPeriods, getExcoOverlays, saveExcoOverlays } from '@/lib/exco-store';
import { emptyExcoOverlays, type ExcoOverlays } from '@/lib/exco-types';
import { normalizeCahierHighlights, normalizeCsrFy27Rows } from '@/lib/exco-csr-fy27';
import { syncCahierHighlightsToProjects } from '@/lib/exco-cahier-project-sync';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';

function parsePeriod(url: URL): { year: number; month: number } | null {
  const now = new Date();
  const year = Number(url.searchParams.get('year') || now.getFullYear());
  const month = Number(url.searchParams.get('month') || now.getMonth() + 1);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    if (url.searchParams.get('list') === '1') {
      const periods = await listExcoSavedPeriods();
      return NextResponse.json({ periods });
    }
    const period = parsePeriod(url);
    if (!period) {
      return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
    }
    const report = await buildExcoReport(period.year, period.month);
    return NextResponse.json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission('exco.rapport', 'edit');
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      year?: number;
      month?: number;
      overlays?: ExcoOverlays;
    };
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Année invalide' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Mois invalide' }, { status: 400 });
    }

    const existing = await getExcoOverlays(year, month);
    const incoming = body.overlays || emptyExcoOverlays();
    const financeByMonth = {
      ...(existing.overlays.financeByMonth || {}),
      ...(incoming.financeByMonth || {}),
    };
    financeByMonth[String(month)] = {
      ...(financeByMonth[String(month)] || {}),
      ...(incoming.manualKpis || {}),
    };

    const overlays: ExcoOverlays = {
      ...emptyExcoOverlays(),
      ...existing.overlays,
      ...incoming,
      manualKpis: {
        ...emptyExcoOverlays().manualKpis,
        ...(existing.overlays.manualKpis || {}),
        ...(incoming.manualKpis || {}),
      },
      financeByMonth,
      staffCostYtdByMonth: {
        ...(existing.overlays.staffCostYtdByMonth || {}),
        ...(incoming.staffCostYtdByMonth || {}),
      },
      staffCostFormulaNotes: {
        ...(existing.overlays.staffCostFormulaNotes || {}),
        ...(incoming.staffCostFormulaNotes || {}),
      },
      narrative: {
        ...emptyExcoOverlays().narrative,
        ...(existing.overlays.narrative || {}),
        ...(incoming.narrative || {}),
      },
      policies: {
        ...emptyExcoOverlays().policies,
        ...(existing.overlays.policies || {}),
        ...(incoming.policies || {}),
      },
      overtimeCostByDept: {
        ...(existing.overlays.overtimeCostByDept || {}),
        ...(incoming.overtimeCostByDept || {}),
      },
      leaveBalanceByMatricule: {
        ...(existing.overlays.leaveBalanceByMatricule || {}),
        ...(incoming.leaveBalanceByMatricule || {}),
      },
      overtimeImportsByMonth: {
        ...(existing.overlays.overtimeImportsByMonth || {}),
        ...(incoming.overtimeImportsByMonth || {}),
      },
      leaveImportsByMonth: {
        ...(existing.overlays.leaveImportsByMonth || {}),
        ...(incoming.leaveImportsByMonth || {}),
      },
      workbookSnapshot:
        incoming.workbookSnapshot !== undefined
          ? incoming.workbookSnapshot
          : existing.overlays.workbookSnapshot ?? null,
      generationMeta:
        incoming.generationMeta !== undefined
          ? incoming.generationMeta
          : existing.overlays.generationMeta ?? null,
      recruitment: Array.isArray(incoming.recruitment)
        ? incoming.recruitment
        : existing.overlays.recruitment || [],
      auditFindings: Array.isArray(incoming.auditFindings)
        ? incoming.auditFindings
        : existing.overlays.auditFindings || [],
      isoActions: Array.isArray(incoming.isoActions)
        ? incoming.isoActions
        : existing.overlays.isoActions || [],
      csrProjects: Array.isArray(incoming.csrProjects)
        ? incoming.csrProjects
        : existing.overlays.csrProjects || [],
      csrFy27Rows: normalizeCsrFy27Rows(
        incoming.csrFy27Rows ?? existing.overlays.csrFy27Rows,
      ),
      cahierHighlights: normalizeCahierHighlights(
        incoming.cahierHighlights ?? existing.overlays.cahierHighlights,
      ),
      trainingTopics: Array.isArray(incoming.trainingTopics)
        ? incoming.trainingTopics
        : existing.overlays.trainingTopics || [],
      upcomingTrainings: Array.isArray(incoming.upcomingTrainings)
        ? incoming.upcomingTrainings
        : existing.overlays.upcomingTrainings || [],
    };

    const actor = await getAuditActor();
    const saved = await withAudit(
      {
        module: 'exco',
        action: 'update',
        entityType: 'exco-report',
        entityId: `${year}-${String(month).padStart(2, '0')}`,
        summary: `Rapport EXCO ${month}/${year} mis à jour`,
        path: '/api/exco/report',
        method: 'PUT',
      },
      () => saveExcoOverlays(year, month, overlays, actor?.userName),
    );

    if (Array.isArray(incoming.cahierHighlights)) {
      try {
        await syncCahierHighlightsToProjects(overlays.cahierHighlights || []);
      } catch {
        // overlays déjà sauvés — sync projets best-effort
      }
    }

    const report = await buildExcoReport(year, month);
    return NextResponse.json({ saved, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
