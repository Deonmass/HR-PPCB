import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import {
  buildTrainingExcelBuffer,
  buildTrainingPptxBuffer,
} from '@/lib/training-export';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const PERMS = [
  { menuId: 'training', action: 'export' as const },
  { menuId: 'training', action: 'view' as const },
];

export async function GET(request: Request) {
  const denied = await checkAnyPermission(PERMS);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const format = (searchParams.get('format') || 'pptx').toLowerCase();

  try {
    if (format === 'excel' || format === 'xlsx') {
      const { buffer, filename } = await buildTrainingExcelBuffer();
      await auditSimpleAction({
        module: 'training',
        action: 'export',
        summary: `Export Excel Training (${filename})`,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
        },
      });
    }

    const { buffer, filename } = await buildTrainingPptxBuffer();
    await auditSimpleAction({
      module: 'training',
      action: 'export',
      summary: `Export PPTX Training (${filename})`,
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
