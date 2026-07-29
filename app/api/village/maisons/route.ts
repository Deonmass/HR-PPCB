import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  deleteMaison,
  readVillageCatalog,
  upsertMaison,
} from '@/lib/village-store';
import type { VillageMaison, VillageMaisonFormData } from '@/lib/village-types';
import { withAudit } from '@/lib/with-audit';

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
    const numero = body.numero?.trim() ?? '';
    const catalog = await readVillageCatalog();
    const existing = catalog.maisons.find(
      (m) => m.numero.trim().toLowerCase() === numero.toLowerCase(),
    );
    const saved = await withAudit(
      {
        module: 'village.maisons',
        action: existing ? 'update' : 'create',
        entityType: 'village.maison',
        entityId: (result) => (result as VillageMaison)?.numero,
        summary: (result) => {
          const m = result as VillageMaison;
          return `${existing ? 'Modification' : 'Création'} maison ${m.numero}`;
        },
        getBefore: async () => existing ?? null,
        path: '/api/village/maisons',
        method: 'POST',
      },
      () => upsertMaison(body),
    );
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
    const catalog = await readVillageCatalog();
    const before = catalog.maisons.find(
      (m) => m.numero.trim().toLowerCase() === numero.trim().toLowerCase(),
    );
    const ok = await withAudit(
      {
        module: 'village.maisons',
        action: 'delete',
        entityType: 'village.maison',
        entityId: numero,
        summary: `Suppression maison ${numero}`,
        getBefore: async () => before ?? null,
        getAfter: () => null,
        path: '/api/village/maisons',
        method: 'DELETE',
      },
      () => deleteMaison(numero),
    );
    if (!ok) return NextResponse.json({ error: 'Maison introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
