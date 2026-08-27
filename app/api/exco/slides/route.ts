import { NextResponse } from 'next/server';
import { buildExcoReport } from '@/lib/exco-report';
import { buildExcoSlidesPayload } from '@/lib/exco-slides-data';
import { checkPermission } from '@/lib/require-permission';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const now = new Date();
    const year = Number(url.searchParams.get('year') || now.getFullYear());
    const month = Number(url.searchParams.get('month') || now.getMonth() + 1);
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'Année invalide' }, { status: 400 });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Mois invalide' }, { status: 400 });
    }
    const report = await buildExcoReport(year, month);
    return NextResponse.json(buildExcoSlidesPayload(report));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
