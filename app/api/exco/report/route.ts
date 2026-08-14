import { NextResponse } from 'next/server';
import { buildExcoReport } from '@/lib/exco-report';
import { listExcoSavedPeriods, saveExcoOverlays } from '@/lib/exco-store';
import { emptyExcoOverlays, type ExcoOverlays } from '@/lib/exco-types';
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

    const incoming = body.overlays || emptyExcoOverlays();
    const financeByMonth = { ...(incoming.financeByMonth || {}) };
    financeByMonth[String(month)] = {
      ...(financeByMonth[String(month)] || {}),
      ...(incoming.manualKpis || {}),
    };

    const overlays: ExcoOverlays = {
      ...emptyExcoOverlays(),
      ...incoming,
      manualKpis: {
        ...emptyExcoOverlays().manualKpis,
        ...(incoming.manualKpis || {}),
      },
      financeByMonth,
      narrative: {
        ...emptyExcoOverlays().narrative,
        ...(incoming.narrative || {}),
      },
      policies: {
        ...emptyExcoOverlays().policies,
        ...(incoming.policies || {}),
      },
      overtimeCostByDept: incoming.overtimeCostByDept || {},
      leaveBalanceByMatricule: incoming.leaveBalanceByMatricule || {},
      overtimeImportsByMonth: incoming.overtimeImportsByMonth || {},
      leaveImportsByMonth: incoming.leaveImportsByMonth || {},
      generationMeta: incoming.generationMeta ?? null,
      recruitment: Array.isArray(incoming.recruitment) ? incoming.recruitment : [],
      auditFindings: Array.isArray(incoming.auditFindings) ? incoming.auditFindings : [],
      isoActions: Array.isArray(incoming.isoActions) ? incoming.isoActions : [],
      csrProjects: Array.isArray(incoming.csrProjects) ? incoming.csrProjects : [],
      trainingTopics: Array.isArray(incoming.trainingTopics) ? incoming.trainingTopics : [],
      upcomingTrainings: Array.isArray(incoming.upcomingTrainings)
        ? incoming.upcomingTrainings
        : [],
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

    const report = await buildExcoReport(year, month);
    return NextResponse.json({ saved, report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
