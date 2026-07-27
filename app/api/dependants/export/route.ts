import { NextResponse } from 'next/server';
import {
  buildDependantsExportBuffer,
  buildDependantsExportFilename,
} from '@/lib/dependants-export.server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.dependants', action: 'export' },
    { menuId: 'employes.liste', action: 'export' },
  ]);
  if (denied) return denied;

  try {
    const buffer = await buildDependantsExportBuffer();
    const filename = buildDependantsExportFilename();

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
