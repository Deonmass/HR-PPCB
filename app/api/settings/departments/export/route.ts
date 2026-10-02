import { NextResponse } from 'next/server';
import { buildDepartmentsServicesExcelBuffer } from '@/lib/departments-services-export.server';
import { listDepartments, listServices } from '@/lib/settings-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'settings.departements', action: 'export' },
    { menuId: 'settings.departements', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const [departments, services] = await Promise.all([listDepartments(), listServices()]);
    const { buffer, filename } = await buildDepartmentsServicesExcelBuffer(departments, services);
    await auditSimpleAction({
      module: 'settings.departements',
      action: 'export',
      summary: `Export Excel départements / services (${departments.length} dép.)`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
