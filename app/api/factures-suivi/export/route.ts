import { NextResponse } from 'next/server';
import {
  buildFacturesSuiviExportBuffer,
  buildFacturesSuiviExportFilename,
} from '@/lib/factures-fournisseurs/export.server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkPermission('factures.fournisseur.factures', 'export');
  if (denied) return denied;

  try {
    const buffer = await buildFacturesSuiviExportBuffer();
    const filename = buildFacturesSuiviExportFilename();
    await auditSimpleAction({
      module: 'factures-suivi',
      action: 'export',
      summary: `Export factures (${filename})`,
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
