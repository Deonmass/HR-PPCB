import { NextResponse } from 'next/server';
import { listExcoUploads } from '@/lib/exco-uploads';
import { getExcoOverlays, saveExcoOverlays } from '@/lib/exco-store';
import { emptyExcoOverlays } from '@/lib/exco-types';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';

function hasNamedImport(
  meta: { importedAt?: string; originalName?: string } | undefined,
): boolean {
  return Boolean(meta?.importedAt || meta?.originalName);
}

function monthHasOtImport(
  overlays: {
    importedSources?: Record<string, { importedAt?: string; originalName?: string }>;
    overtimeImportsByMonth?: Record<string, { employees?: unknown[] }>;
  },
  month: number,
): boolean {
  if (hasNamedImport(overlays.importedSources?.componentPostedUnits)) return true;
  const snap = overlays.overtimeImportsByMonth?.[String(month)];
  return Boolean(snap && Array.isArray(snap.employees) && snap.employees.length > 0);
}

function monthHasLeaveImport(
  overlays: {
    importedSources?: Record<string, { importedAt?: string; originalName?: string }>;
    leaveImportsByMonth?: Record<string, { counts?: { all?: number }; byMatricule?: Record<string, unknown> }>;
  },
  month: number,
): boolean {
  if (hasNamedImport(overlays.importedSources?.leaveBalances)) return true;
  const snap = overlays.leaveImportsByMonth?.[String(month)];
  if (!snap) return false;
  if ((snap.counts?.all || 0) > 0) return true;
  return Boolean(snap.byMatricule && Object.keys(snap.byMatricule).length > 0);
}

function monthHasEngagementsImport(
  overlays: {
    importedSources?: Record<string, { importedAt?: string; originalName?: string }>;
    engagementsImportsByMonth?: Record<string, unknown[]>;
  },
  month: number,
): boolean {
  if (hasNamedImport(overlays.importedSources?.engagementsTerminations)) return true;
  const rows = overlays.engagementsImportsByMonth?.[String(month)];
  return Array.isArray(rows) && rows.length > 0;
}

function parsePeriod(url: URL): { year: number; month: number } | null {
  const year = Number(url.searchParams.get('year'));
  const month = Number(url.searchParams.get('month'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/** Params EXCO : période + taux + fichiers déjà uploadés. */
export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get('year') || now.getFullYear());
    const month = Number(url.searchParams.get('month') || now.getMonth() + 1);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
    }
    const { overlays } = await getExcoOverlays(year, month);
    const uploads = await listExcoUploads(year, month);
    const importedSources = overlays.importedSources || {};
    const imported = {
      componentPostedUnits: monthHasOtImport(overlays, month),
      leaveBalances: monthHasLeaveImport(overlays, month),
      engagementsTerminations: monthHasEngagementsImport(overlays, month),
    };
    const hasData =
      imported.componentPostedUnits
      || imported.leaveBalances
      || imported.engagementsTerminations;
    const n = overlays.narrative || emptyExcoOverlays().narrative;
    const leaveSnap = overlays.leaveImportsByMonth?.[String(month)];
    const otSnap = overlays.overtimeImportsByMonth?.[String(month)];
    const leaveDaysByMatricule: Record<string, number> = {};
    const leaveValueFcByMatricule: Record<string, number> = {};
    const ovtHoursByMatricule: Record<string, number> = {};
    const ovtCostFcByMatricule: Record<string, number> = {};
    if (monthHasLeaveImport(overlays, month) && leaveSnap?.byMatricule) {
      for (const [mat, days] of Object.entries(leaveSnap.byMatricule)) {
        if (days == null || !Number.isFinite(Number(days))) continue;
        leaveDaysByMatricule[mat] = Number(days);
      }
      for (const [mat, fc] of Object.entries(leaveSnap.valueFcByMatricule || {})) {
        if (fc == null || !Number.isFinite(Number(fc))) continue;
        leaveValueFcByMatricule[mat] = Number(fc);
      }
    }
    if (monthHasOtImport(overlays, month) && Array.isArray(otSnap?.employees)) {
      for (const e of otSnap.employees) {
        const mat = String(e.matricule || '').trim();
        if (!mat) continue;
        if (Number.isFinite(e.hours)) ovtHoursByMatricule[mat] = e.hours;
        if (Number.isFinite(e.costFc)) ovtCostFcByMatricule[mat] = e.costFc;
      }
    }
    return NextResponse.json({
      year,
      month,
      fxRateFcPerUsd: overlays.generationMeta?.fxRateFcPerUsd ?? null,
      uploads,
      importedSources,
      imported,
      hasData,
      baseImportColumns: {
        leaveDaysByMatricule,
        leaveValueFcByMatricule,
        ovtHoursByMatricule,
        ovtCostFcByMatricule,
      },
      generationMeta: overlays.generationMeta,
      narrative: {
        highlights: n.highlights || '',
        lowlights: n.lowlights || '',
        focus: n.focus || '',
        thankYouTitle: n.thankYouTitle || 'Et merci',
        thankYouMessage: n.thankYouMessage || 'Thank You',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
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
      fxRateFcPerUsd?: number | null;
      narrative?: {
        highlights?: string;
        lowlights?: string;
        focus?: string;
        thankYouTitle?: string;
        thankYouMessage?: string;
      };
    };
    const year = Number(body.year);
    const month = Number(body.month);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Année invalide' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Mois invalide' }, { status: 400 });
    }

    const hasFx = Object.prototype.hasOwnProperty.call(body, 'fxRateFcPerUsd');
    const hasNarrative = body.narrative != null && typeof body.narrative === 'object';
    if (!hasFx && !hasNarrative) {
      return NextResponse.json({ error: 'Aucun champ à enregistrer' }, { status: 400 });
    }

    let fx: number | null | undefined;
    if (hasFx) {
      const fxRaw = body.fxRateFcPerUsd;
      fx =
        fxRaw == null || fxRaw === ('' as unknown)
          ? null
          : Number(fxRaw);
      if (fx != null && (!(fx > 0) || !Number.isFinite(fx))) {
        return NextResponse.json({ error: 'Taux invalide' }, { status: 400 });
      }
    }

    const { overlays } = await getExcoOverlays(year, month);
    const next = {
      ...emptyExcoOverlays(),
      ...overlays,
    };

    if (hasFx) {
      next.generationMeta = {
        fxRateFcPerUsd: fx ?? null,
        generatedAt: new Date().toISOString(),
        sourceFiles: overlays.generationMeta?.sourceFiles || [],
      };
    }

    if (hasNarrative) {
      next.narrative = {
        ...emptyExcoOverlays().narrative,
        ...overlays.narrative,
        highlights: String(body.narrative?.highlights ?? overlays.narrative?.highlights ?? ''),
        lowlights: String(body.narrative?.lowlights ?? overlays.narrative?.lowlights ?? ''),
        focus: String(body.narrative?.focus ?? overlays.narrative?.focus ?? ''),
        thankYouTitle: String(
          body.narrative?.thankYouTitle
          ?? overlays.narrative?.thankYouTitle
          ?? 'Et merci',
        ),
        thankYouMessage: String(
          body.narrative?.thankYouMessage
          ?? overlays.narrative?.thankYouMessage
          ?? 'Thank You',
        ),
      };
    }

    const actor = await getAuditActor();
    const summaryParts = [
      hasFx ? `taux ${fx ?? '—'}` : null,
      hasNarrative ? 'summary' : null,
    ].filter(Boolean);
    await withAudit(
      {
        module: 'exco',
        action: 'update',
        entityType: 'exco-params',
        entityId: `${year}-${String(month).padStart(2, '0')}`,
        summary: `Params EXCO ${month}/${year} · ${summaryParts.join(' · ')}`,
        path: '/api/exco/params',
        method: 'PUT',
      },
      () => saveExcoOverlays(year, month, next, actor?.userName),
    );

    const uploads = await listExcoUploads(year, month);
    return NextResponse.json({
      ok: true,
      year,
      month,
      fxRateFcPerUsd: next.generationMeta?.fxRateFcPerUsd ?? null,
      uploads,
      narrative: {
        highlights: next.narrative?.highlights || '',
        lowlights: next.narrative?.lowlights || '',
        focus: next.narrative?.focus || '',
        thankYouTitle: next.narrative?.thankYouTitle || 'Et merci',
        thankYouMessage: next.narrative?.thankYouMessage || 'Thank You',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

void parsePeriod;
