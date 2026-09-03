import { NextResponse } from 'next/server';
import { buildCongeExportBuffer } from '@/lib/conge-export.server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const MENU = 'employes.conge';

export async function GET() {
  const denied = await checkPermission(MENU, 'export');
  if (denied) return denied;

  try {
    const { buffer, filename } = await buildCongeExportBuffer();
    await auditSimpleAction({
      module: MENU,
      action: 'export',
      summary: `Export planning de congé (${filename})`,
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
