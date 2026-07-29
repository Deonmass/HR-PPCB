import { NextResponse } from 'next/server';
import {
  buildProjectsExportBuffer,
  buildProjectsExportFilename,
} from '@/lib/projects-export.server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkPermission('project.projects', 'export');
  if (denied) return denied;

  try {
    const buffer = await buildProjectsExportBuffer();
    const filename = buildProjectsExportFilename();
    await auditSimpleAction({
      module: 'projects',
      action: 'export',
      summary: `Export projets (${filename})`,
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
