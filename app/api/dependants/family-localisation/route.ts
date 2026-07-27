import { NextResponse } from 'next/server';
import { updateFamilyLocalisation } from '@/lib/dependants-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';

export async function PUT(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.dependants', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = await request.json() as { matricule?: string; localisation?: string };
    const matricule = body.matricule?.trim() ?? '';
    const localisation = body.localisation?.trim() ?? '';
    if (!matricule || !localisation) {
      return NextResponse.json(
        { error: 'Matricule et localisation requis' },
        { status: 400 },
      );
    }

    const updated = await updateFamilyLocalisation(matricule, localisation);
    return NextResponse.json({ dependants: updated });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
