import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { deleteAchat, getAchat, updateAchat } from '@/lib/charroi-store';
import type { CharroiAchatInput } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const EDIT = [
  { menuId: 'charroi.achats', action: 'edit' as const },
  { menuId: 'charroi', action: 'edit' as const },
];
const DEL = [
  { menuId: 'charroi.achats', action: 'delete' as const },
  { menuId: 'charroi', action: 'delete' as const },
];

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const body = (await request.json()) as CharroiAchatInput;
    const before = await getAchat(id.trim());
    if (!before) return NextResponse.json({ error: 'Achat introuvable' }, { status: 404 });
    const item = await withAudit(
      {
        module: 'charroi.achats',
        action: 'update',
        entityType: 'charroi.achat',
        entityId: id.trim(),
        summary: `Modification achat ${before.nature || before.marque || id.trim()}`,
        getBefore: async () => before,
        path: `/api/charroi/achats/${id}`,
        method: 'PATCH',
      },
      () => updateAchat(id.trim(), body),
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
    const before = await getAchat(id.trim());
    if (!before) return NextResponse.json({ error: 'Achat introuvable' }, { status: 404 });
    await withAudit(
      {
        module: 'charroi.achats',
        action: 'delete',
        entityType: 'charroi.achat',
        entityId: id.trim(),
        summary: `Suppression achat ${before.nature || before.marque || id.trim()}`,
        getBefore: async () => before,
        getAfter: () => null,
        path: `/api/charroi/achats/${id}`,
        method: 'DELETE',
      },
      async () => {
        await deleteAchat(id.trim());
        return true;
      },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
