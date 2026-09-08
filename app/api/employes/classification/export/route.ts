import { NextResponse } from 'next/server';
import { buildClassificationExportBuffer } from '@/lib/classification-export.server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.classification', action: 'export' },
    { menuId: 'employes.classification', action: 'view' },
    { menuId: 'employes.postes', action: 'export' },
    { menuId: 'employes.liste', action: 'export' },
  ]);
  if (denied) return denied;

  try {
    const { buffer, filename } = await buildClassificationExportBuffer();
    await auditSimpleAction({
      module: 'employes.classification',
      action: 'export',
      summary: `Export classification des postes (${filename})`,
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
