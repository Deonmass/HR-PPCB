import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  deleteMaison,
  readVillageCatalog,
  upsertMaison,
} from '@/lib/village-store';
import type { VillageMaisonFormData } from '@/lib/village-types';

const VIEW = [
  { menuId: 'village.maisons', action: 'view' as const },
  { menuId: 'village.dependants-dashboard', action: 'view' as const },
  { menuId: 'village.dependants-liste', action: 'view' as const },
];

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const data = await readVillageCatalog();
    return NextResponse.json(data);
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
    const body = (await request.json()) as VillageMaisonFormData;
    const saved = await upsertMaison(body);
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
    const numero = searchParams.get('numero') ?? '';
    const ok = await deleteMaison(numero);
    if (!ok) return NextResponse.json({ error: 'Maison introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
