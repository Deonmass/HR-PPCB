import { NextResponse } from 'next/server';
import {
  buildSanteExportBuffer,
  buildSanteExportFilename,
} from '@/lib/sante-export.server';
import { listSanteVisits } from '@/lib/sante-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'sante.donnees', action: 'export' },
    { menuId: 'sante.dashboard', action: 'export' },
    { menuId: 'sante', action: 'export' },
  ]);
  if (denied) return denied;

  try {
    const visits = await listSanteVisits();
    const buffer = await buildSanteExportBuffer(visits);
    const filename = buildSanteExportFilename();
    await auditSimpleAction({
      module: 'sante',
      action: 'export',
      summary: `Export pathologies (${visits.length} cas)`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
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
