import { NextResponse } from 'next/server';
import { createDependant, readDependantsData } from '@/lib/dependants-store';
import type { DependantFormData } from '@/lib/dependants-types';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.dependants', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'village.dependants-dashboard', action: 'view' },
    { menuId: 'village.dependants-liste', action: 'view' },
    { menuId: 'village.maisons', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const data = await readDependantsData();
    return NextResponse.json(data);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.dependants', action: 'create' },
    { menuId: 'employes.liste', action: 'create' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as DependantFormData;
    if (!body.matricule || !body.nom || !body.statut) {
      return NextResponse.json({ error: 'Matricule, nom et statut requis' }, { status: 400 });
    }
    const created = await createDependant(body);
    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
