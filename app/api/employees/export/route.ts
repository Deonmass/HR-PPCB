import { NextResponse } from 'next/server';
import {
  buildEmployeesExportBuffer,
  buildEmployeesHrExportFilename,
} from '@/lib/employees-export.server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkPermission('employes.liste', 'export');
  if (denied) return denied;

  try {
    const buffer = await buildEmployeesExportBuffer();
    const filename = buildEmployeesHrExportFilename();

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
