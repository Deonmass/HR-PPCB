import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  deleteTaille,
  readVillageCatalog,
  upsertTaille,
} from '@/lib/village-store';
import type { VillageTaille, VillageTailleFormData } from '@/lib/village-types';
import { withAudit } from '@/lib/with-audit';

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
    const code = body.code?.trim() ?? '';
    const catalog = await readVillageCatalog();
    const existing = catalog.tailles.find(
      (t) => t.code.trim().toLowerCase() === code.toLowerCase(),
    );
    const saved = await withAudit(
      {
        module: 'village.maisons',
        action: existing ? 'update' : 'create',
        entityType: 'village.taille',
        entityId: (result) => (result as VillageTaille)?.code,
        summary: (result) => {
          const t = result as VillageTaille;
          return `${existing ? 'Modification' : 'Création'} taille ${t.code}`;
        },
        getBefore: async () => existing ?? null,
        path: '/api/village/tailles',
        method: 'POST',
      },
      () => upsertTaille(body),
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
    const code = searchParams.get('code') ?? '';
    const catalog = await readVillageCatalog();
    const before = catalog.tailles.find(
      (t) => t.code.trim().toLowerCase() === code.trim().toLowerCase(),
    );
    const ok = await withAudit(
      {
        module: 'village.maisons',
        action: 'delete',
        entityType: 'village.taille',
        entityId: code,
        summary: `Suppression taille ${code}`,
        getBefore: async () => before ?? null,
        getAfter: () => null,
        path: '/api/village/tailles',
        method: 'DELETE',
      },
      () => deleteTaille(code),
    );
    if (!ok) return NextResponse.json({ error: 'Taille introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
