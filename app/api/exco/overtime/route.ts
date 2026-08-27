import { NextResponse } from 'next/server';
import { buildExcoOtView } from '@/lib/exco-ot-view';
import { getExcoOverlays } from '@/lib/exco-store';
import { checkPermission } from '@/lib/require-permission';

/** Vue Overtime agrégée (CPU + Leave Annual → USD). */
export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month'));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Période invalide' }, { status: 400 });
    }
    const { overlays } = await getExcoOverlays(year, month);
    const fxParam = url.searchParams.get('fxRate');
    const fx =
      fxParam != null && fxParam !== ''
        ? Number(fxParam)
        : overlays.generationMeta?.fxRateFcPerUsd ?? null;
    const view = await buildExcoOtView({ year, month, fxRateFcPerUsd: fx });
    return NextResponse.json(view);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur Overtime';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
