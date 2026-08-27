import { NextResponse } from 'next/server';
import { buildExcoReport } from '@/lib/exco-report';
import {
  buildExcoExcelBuffer,
  buildExcoExcelFilename,
} from '@/lib/exco-excel-export';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'export');
  if (denied) {
    const viewDenied = await checkPermission('exco.rapport', 'view');
    if (viewDenied) return viewDenied;
  }

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
    const buffer = await buildExcoExcelBuffer(report);
    const filename = buildExcoExcelFilename(year, month);

    await auditSimpleAction({
      module: 'exco',
      action: 'export',
      summary: `Export Excel EXCO ${filename}`,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’export Excel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
