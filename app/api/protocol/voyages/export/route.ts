import { NextResponse } from 'next/server';
import {
  buildProtocolVoyageExportBuffer,
  buildProtocolVoyageExportFilename,
  filterProtocolVoyagesForExport,
  protocolVoyagePeriodLabel,
  type ProtocolVoyageExportQuery,
} from '@/lib/protocol-voyage-export.server';
import { listProtocolVoyages } from '@/lib/protocol-voyage-store';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'protocol.voyages';

function parseQuery(url: URL): ProtocolVoyageExportQuery {
  const year = Number(url.searchParams.get('year') || '');
  const month = Number(url.searchParams.get('month') || '');
  const q = url.searchParams.get('q')?.trim() || '';
  return {
    year: Number.isFinite(year) && year > 1900 ? year : undefined,
    month: Number.isFinite(month) && month >= 1 && month <= 12 ? month : undefined,
    q: q || undefined,
  };
}

export async function GET(request: Request) {
  const denied = await checkPermission(MENU, 'export');
  if (denied) return denied;
  try {
    const query = parseQuery(new URL(request.url));
    const items = filterProtocolVoyagesForExport(await listProtocolVoyages(), query);
    const buffer = await withAudit(
      {
        module: MENU,
        action: 'export',
        entityType: 'protocol.voyage',
        summary: `Export Excel gestion de voyage (${items.length} ligne(s), ${protocolVoyagePeriodLabel(query)})`,
        path: '/api/protocol/voyages/export',
        method: 'GET',
      },
      async () => buildProtocolVoyageExportBuffer(items, query),
    );
    const filename = buildProtocolVoyageExportFilename(query);
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
