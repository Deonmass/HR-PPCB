import { NextRequest, NextResponse } from 'next/server';
import {
  buildCheckDocumentsExportBuffer,
  buildCheckDocumentsExportFilename,
} from '@/lib/check-documents-export.server';
import type { EmployeeFilters } from '@/lib/employee-filters';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';

function parseFilters(request: NextRequest): EmployeeFilters {
  const { searchParams } = request.nextUrl;
  return {
    search: searchParams.get('search')?.trim() ?? '',
    dept: searchParams.get('dept')?.trim() ?? '',
  };
}

export async function GET(request: NextRequest) {
  const denied = await checkPermission('employes.check-documents', 'export');
  if (denied) return denied;

  const filters = parseFilters(request);

  try {
    const buffer = await buildCheckDocumentsExportBuffer(filters);
    const filename = buildCheckDocumentsExportFilename(filters);

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
