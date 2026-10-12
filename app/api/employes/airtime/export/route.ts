import { NextResponse } from 'next/server';
import { buildAirtimeExcelBuffer } from '@/lib/airtime-excel-export';
import { getAirtimeBundle } from '@/lib/airtime-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export const runtime = 'nodejs';

const MENU = 'employes.airtime';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'export' },
    { menuId: MENU, action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const bundle = await getAirtimeBundle();
    const { buffer, filename } = await buildAirtimeExcelBuffer(bundle.rows);
    const ppc = bundle.rows.filter((row) => row.matched).length;
    const contractants = bundle.rows.filter((row) => row.contractantMatched).length;
    await auditSimpleAction({
      module: MENU,
      action: 'export',
      summary: `Export Excel Airtime (${ppc} PPC, ${contractants} contractants)`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
