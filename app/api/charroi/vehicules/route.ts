import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { createVehicule, listVehicules } from '@/lib/charroi-store';
import type { CharroiVehiculeInput } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const VIEW = [
  { menuId: 'charroi.vehicules', action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];
const CREATE = [
  { menuId: 'charroi.vehicules', action: 'create' as const },
  { menuId: 'charroi', action: 'create' as const },
];

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const items = await listVehicules();
    return NextResponse.json(items);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission(CREATE);
  if (denied) return denied;
  try {
    const body = (await request.json()) as CharroiVehiculeInput;
    if (!String(body.marque ?? '').trim() && !String(body.plaque ?? '').trim()) {
      return NextResponse.json({ error: 'Marque ou plaque requise' }, { status: 400 });
    }
    const item = await withAudit(
      {
        module: 'charroi.vehicules',
        action: 'create',
        entityType: 'charroi.vehicule',
        entityId: (result) => (result as { id?: string })?.id,
        summary: (result) => {
          const v = result as { plaque?: string; marque?: string; id?: string };
          return `Création véhicule ${v.plaque || v.marque || v.id}`;
        },
        details: (_r, _b, after) =>
          `Nouveau véhicule enregistré : ${JSON.stringify(after ?? {}, null, 0)}`,
        path: '/api/charroi/vehicules',
        method: 'POST',
      },
      () => createVehicule(body),
    );
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
