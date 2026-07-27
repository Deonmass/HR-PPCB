import { NextRequest, NextResponse } from 'next/server';
import {
  buildDashboardExportBuffer,
  buildDashboardExportFilename,
} from '@/lib/check-documents-dashboard-export.server';
import { filterEmployees, type EmployeeFilters } from '@/lib/employee-filters';
import { excelErrorResponse } from '@/lib/excel-io';
import { readEmployees } from '@/lib/employees-store';
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
    const employees = await readEmployees();
    const filtered = filterEmployees(employees, filters);
    const buffer = await buildDashboardExportBuffer(filtered, filters);
    const filename = buildDashboardExportFilename(filters);

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
