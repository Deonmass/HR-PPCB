import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  deleteTaille,
  readVillageCatalog,
  upsertTaille,
} from '@/lib/village-store';
import type { VillageTailleFormData } from '@/lib/village-types';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'village.maisons', action: 'view' },
    { menuId: 'village.dependants-dashboard', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const { tailles } = await readVillageCatalog();
    return NextResponse.json({ tailles });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'village.maisons', action: 'create' },
    { menuId: 'village.maisons', action: 'edit' },
  ]);
  if (denied) return denied;
  try {
    const body = (await request.json()) as VillageTailleFormData;
    const saved = await upsertTaille(body);
    return NextResponse.json(saved);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkAnyPermission([{ menuId: 'village.maisons', action: 'delete' }]);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code') ?? '';
    const ok = await deleteTaille(code);
    if (!ok) return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
