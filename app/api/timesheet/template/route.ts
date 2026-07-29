import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import { TIMESHEET_TEMPLATE_PATH } from '@/lib/excel-export-template-paths';
import { checkAnyPermission } from '@/lib/require-permission';
import { TIMESHEET_MENU } from '@/lib/timesheet-permissions';
import { auditSimpleAction } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: TIMESHEET_MENU.self, action: 'view' },
    { menuId: TIMESHEET_MENU.department, action: 'view' },
    { menuId: TIMESHEET_MENU.all, action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const buffer = await fs.readFile(TIMESHEET_TEMPLATE_PATH);
    await auditSimpleAction({
      module: 'timesheet',
      action: 'export',
      summary: 'Téléchargement modèle timesheet',
      details: 'Template Timesheet.xlsx',
    });
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'inline; filename="Timesheet template.xlsx"',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Modèle timesheet introuvable' }, { status: 404 });
  }
}
