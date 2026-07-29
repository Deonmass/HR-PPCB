import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';
import {
  buildTravelHistoryExportBuffer,
  buildTravelHistoryExportFilename,
} from '@/lib/travel-history-export.server';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkPermission('travel.historique', 'export');
  if (denied) return denied;

  try {
    const buffer = await buildTravelHistoryExportBuffer();
    const filename = buildTravelHistoryExportFilename();
    await auditSimpleAction({
      module: 'travel.historique',
      action: 'export',
      summary: `Export historique de voyage (${filename})`,
      details: `Fichier Excel exporté : ${filename}`,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
