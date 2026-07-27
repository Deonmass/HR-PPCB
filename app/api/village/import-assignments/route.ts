import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { importVillageHousingAssignments } from '@/lib/village-import-assignments.server';

/** Importe les affectations logement village (liste capture → employés). */
export async function POST() {
  const denied = await checkAnyPermission([
    { menuId: 'village.maisons', action: 'edit' },
    { menuId: 'village.dependants-liste', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const result = await importVillageHousingAssignments();
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
