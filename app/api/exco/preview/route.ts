import { NextResponse } from 'next/server';
import { buildExcoPreviewHtml } from '@/lib/exco-preview-html';
import { buildExcoReport } from '@/lib/exco-report';
import { checkPermission } from '@/lib/require-permission';

export const runtime = 'nodejs';

/**
 * Aperçu HTML du deck (slides), affiché dans la fenêtre de l’app — pas un téléchargement.
 */
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
    const html = buildExcoPreviewHtml(report);

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur aperçu';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
