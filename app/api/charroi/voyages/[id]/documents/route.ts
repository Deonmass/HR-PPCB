import { NextResponse } from 'next/server';
import { buildCharroiDriverDocs, charroiDriverDocsFileName } from '@/lib/charroi-voyage-docs';
import { getVoyage } from '@/lib/charroi-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const VIEW = [
  { menuId: 'charroi.voyages', action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const { id } = await params;
    const voyage = await getVoyage(id?.trim() ?? '');
    if (!voyage) return NextResponse.json({ error: 'Voyage introuvable' }, { status: 404 });
    const buffer = await buildCharroiDriverDocs(voyage);
    const filename = charroiDriverDocsFileName(voyage);
    await auditSimpleAction({
      module: 'charroi.voyages',
      action: 'export',
      summary: `Documents chauffeur ${voyage.numero} ${voyage.chauffeurNom}`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Génération impossible';
    const status = /requis|introuvable/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status: /introuvable/i.test(message) ? 404 : status });
  }
}
