import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { readExitedEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'documents.composition-familiale', action: 'view' },
    { menuId: 'documents.mouvement-travailleur', action: 'view' },
    { menuId: 'documents.exit', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const exits = await readExitedEmployees();
    return NextResponse.json(exits);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
