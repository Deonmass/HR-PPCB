import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { buildMouvementsExcelBuffer } from '@/lib/mouvements-excel-export.server';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.mouvements', action: 'export' },
    { menuId: 'employes.mouvements', action: 'view' },
    { menuId: 'employes.liste', action: 'export' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const { buffer, filename } = await buildMouvementsExcelBuffer();
    await auditSimpleAction({
      module: 'mouvements',
      action: 'export',
      summary: `Export changements de poste (${filename})`,
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
