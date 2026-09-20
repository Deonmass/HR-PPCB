import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { buildRecrutementExcelBuffer } from '@/lib/recrutement-excel-export.server';
import {
  buildRecrutementPptxBuffer,
  buildRecrutementPreviewHtml,
} from '@/lib/recrutement-pptx-export';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const EXPORT_PERMS = [
  { menuId: 'employes.recrutement', action: 'export' as const },
  { menuId: 'employes.recrutement', action: 'view' as const },
  { menuId: 'employes.classification', action: 'export' as const },
  { menuId: 'employes.postes', action: 'export' as const },
];

export async function GET(request: Request) {
  const denied = await checkAnyPermission(EXPORT_PERMS);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'pptx').toLowerCase();

  try {
    if (format === 'preview') {
      const html = await buildRecrutementPreviewHtml();
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    if (format === 'excel' || format === 'xlsx') {
      const { buffer, filename } = await buildRecrutementExcelBuffer();
      await auditSimpleAction({
        module: 'employes.recrutement',
        action: 'export',
        summary: `Export Excel recrutement (${filename})`,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const { buffer, filename } = await buildRecrutementPptxBuffer();
    await auditSimpleAction({
      module: 'employes.recrutement',
      action: 'export',
      summary: `Export PPTX recrutement (${filename})`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
