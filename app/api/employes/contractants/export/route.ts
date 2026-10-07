import { NextResponse } from 'next/server';
import { getContractantScopeFromMenus } from '@/lib/contractant-scope';
import { buildContractantsListExcelBuffer } from '@/lib/contractants-list-export.server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const PERMS = [
  { menuId: 'employes.contractants', action: 'export' as const },
  { menuId: 'employes.contractants', action: 'view' as const },
  { menuId: 'employes.liste', action: 'export' as const },
  { menuId: 'employes.liste', action: 'view' as const },
];

export async function GET() {
  const denied = await checkAnyPermission(PERMS);
  if (denied) return denied;

  try {
    const session = await getActiveSession();
    const scope = getContractantScopeFromMenus(session?.menus);
    const { buffer, filename } = await buildContractantsListExcelBuffer(scope);
    await auditSimpleAction({
      module: 'contractants',
      action: 'export',
      summary: `Export liste contractants (${filename})`,
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
