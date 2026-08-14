import { NextResponse } from 'next/server';
import {
  buildAuditHrExportBuffer,
  buildAuditHrExportFilename,
} from '@/lib/audit-hr-export.server';
import { listAuditHrActions } from '@/lib/audit-hr-store';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const denied = await checkPermission('audit.points', 'export');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const asOf = (url.searchParams.get('asOf') || todayIso()).slice(0, 10);
    const actions = await listAuditHrActions();
    const buffer = await buildAuditHrExportBuffer(actions, asOf);
    const filename = buildAuditHrExportFilename(asOf);

    await auditSimpleAction({
      module: 'audit-hr',
      moduleLabel: 'Audit points',
      action: 'export',
      summary: `Export Audit HR ${asOf} (${actions.length} actions)`,
    });

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.ms-excel.sheet.macroEnabled.12',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’export';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
