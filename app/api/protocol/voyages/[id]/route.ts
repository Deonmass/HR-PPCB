import { NextResponse } from 'next/server';
import {
  deleteProtocolVoyage,
  getProtocolVoyage,
  updateProtocolVoyage,
} from '@/lib/protocol-voyage-store';
import type { ProtocolVoyageCoutInput } from '@/lib/protocol-voyage-types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'protocol.voyages';
type Params = { params: Promise<{ id: string }> };

function voyageError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Erreur inattendue';
  if (/introuvable/i.test(message)) return NextResponse.json({ error: message }, { status: 404 });
  if (/requis|invalide/i.test(message)) return NextResponse.json({ error: message }, { status: 400 });
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  try {
    const { id } = await params;
    const voyageId = id?.trim();
    if (!voyageId) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const before = await getProtocolVoyage(voyageId);
    if (!before) return NextResponse.json({ error: 'Voyage introuvable' }, { status: 404 });
    const body = (await request.json()) as ProtocolVoyageCoutInput;
    const item = await withAudit(
      {
        module: MENU,
        action: 'update',
        entityType: 'protocol.voyage',
        entityId: voyageId,
        summary: `Modification voyage ${before.numero} ${before.voyageur}`,
        getBefore: async () => before,
        path: `/api/protocol/voyages/${voyageId}`,
        method: 'PATCH',
      },
      () => updateProtocolVoyage(voyageId, body),
    );
    return NextResponse.json(item);
  } catch (err) {
    return voyageError(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  try {
    const { id } = await params;
    const voyageId = id?.trim();
    if (!voyageId) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const before = await getProtocolVoyage(voyageId);
    if (!before) return NextResponse.json({ error: 'Voyage introuvable' }, { status: 404 });
    await withAudit(
      {
        module: MENU,
        action: 'delete',
        entityType: 'protocol.voyage',
        entityId: voyageId,
        summary: `Suppression voyage ${before.numero} ${before.voyageur}`,
        getBefore: async () => before,
        getAfter: () => null,
        path: `/api/protocol/voyages/${voyageId}`,
        method: 'DELETE',
      },
      async () => {
        await deleteProtocolVoyage(voyageId);
        return true;
      },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return voyageError(err);
  }
}
