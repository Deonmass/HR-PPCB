import { NextResponse } from 'next/server';
import { buildDashboardFromEmployees } from '@/lib/documents';
import { readEmployees } from '@/lib/employees-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkPermission('employes.check-documents', 'view');
  if (denied) return denied;

  try {
    const employees = await readEmployees();
    return NextResponse.json({
      employees,
      dashboard: buildDashboardFromEmployees(employees),
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
