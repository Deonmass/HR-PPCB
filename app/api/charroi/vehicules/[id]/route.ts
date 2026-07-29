import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { deleteVehicule, getVehicule, updateVehicule } from '@/lib/charroi-store';
import type { CharroiVehiculeInput } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const EDIT = [
  { menuId: 'charroi.vehicules', action: 'edit' as const },
  { menuId: 'charroi', action: 'edit' as const },
];
const DEL = [
  { menuId: 'charroi.vehicules', action: 'delete' as const },
  { menuId: 'charroi', action: 'delete' as const },
];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const body = (await request.json()) as CharroiVehiculeInput;
    const before = await getVehicule(id.trim());
    if (!before) return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });
    const item = await withAudit(
      {
        module: 'charroi.vehicules',
        action: 'update',
        entityType: 'charroi.vehicule',
        entityId: id.trim(),
        summary: `Modification véhicule ${before.plaque || before.marque || id.trim()}`,
        details: (_r, b, after) =>
          `Véhicule modifié.\nAvant : ${JSON.stringify(b)}\nAprès : ${JSON.stringify(after)}`,
        getBefore: async () => before,
        path: `/api/charroi/vehicules/${id}`,
        method: 'PATCH',
      },
      () => updateVehicule(id.trim(), body),
    );
    return NextResponse.json(item);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkAnyPermission(DEL);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const before = await getVehicule(id.trim());
    if (!before) return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });
    await withAudit(
      {
        module: 'charroi.vehicules',
        action: 'delete',
        entityType: 'charroi.vehicule',
        entityId: id.trim(),
        summary: `Suppression véhicule ${before.plaque || before.marque || id.trim()}`,
        details: () => `Véhicule supprimé : ${JSON.stringify(before)}`,
        getBefore: async () => before,
        getAfter: () => null,
        path: `/api/charroi/vehicules/${id}`,
        method: 'DELETE',
      },
      async () => {
        await deleteVehicule(id.trim());
        return true;
      },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
