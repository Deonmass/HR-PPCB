import { NextResponse } from 'next/server';
import {
  cancelVoyage,
  completeVoyage,
  confirmVoyage,
  deleteVoyage,
  getVoyage,
  reopenVoyage,
  updateVoyage,
} from '@/lib/charroi-store';
import type { CharroiVoyageConfirmInput, CharroiVoyageInput } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const EDIT = [
  { menuId: 'charroi.voyages', action: 'edit' as const },
  { menuId: 'charroi', action: 'edit' as const },
];
const DEL = [
  { menuId: 'charroi.voyages', action: 'delete' as const },
  { menuId: 'charroi', action: 'delete' as const },
];

type Params = { params: Promise<{ id: string }> };

type PatchBody = CharroiVoyageInput & Partial<CharroiVoyageConfirmInput> & {
  action?: 'confirm' | 'complete' | 'cancel' | 'reopen';
  vehiculeLocation?: string;
};

function voyageError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Erreur inattendue';
  if (/introuvable/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 404 });
  }
  if (/requis|invalide|différents|déjà|annulé|Confirmez|rouvert|effectué/i.test(message)) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 500 });
}

function summaryOf(action: string, nom: string, numero: string): string {
  const who = `${numero} ${nom}`.trim();
  if (action === 'confirm') return `Confirmation voyage ${who}`;
  if (action === 'complete') return `Voyage effectué ${who}`;
  if (action === 'cancel') return `Annulation voyage ${who}`;
  if (action === 'reopen') return `Réouverture voyage ${who}`;
  return `Modification voyage ${who}`;
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    const voyageId = id?.trim();
    if (!voyageId) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const before = await getVoyage(voyageId);
    if (!before) return NextResponse.json({ error: 'Voyage introuvable' }, { status: 404 });
    const body = (await request.json()) as PatchBody;
    const action = body.action ?? 'update';
    const item = await withAudit(
      {
        module: 'charroi.voyages',
        action: 'update',
        entityType: 'charroi.voyage',
        entityId: voyageId,
        summary: summaryOf(action, before.passagerNom, before.numero),
        getBefore: async () => before,
        path: `/api/charroi/voyages/${voyageId}`,
        method: 'PATCH',
      },
      () => {
        if (body.action === 'confirm') {
          return confirmVoyage(voyageId, {
            chauffeurNom: body.chauffeurNom ?? '',
            chauffeurMatricule: body.chauffeurMatricule,
            chauffeurInterne: body.chauffeurInterne,
            vehiculeMode: body.vehiculeMode === 'location' ? 'location' : 'flotte',
            vehiculeId: body.vehiculeId,
            vehiculeLocation: body.vehiculeLocation,
            foodAllowance: body.foodAllowance,
            foodForTheRoad: body.foodForTheRoad,
            tollGate: body.tollGate,
          });
        }
        if (body.action === 'complete') {
          return completeVoyage(voyageId, {
            dateArrivee: body.dateArrivee,
            heureArrivee: body.heureArrivee,
          });
        }
        if (body.action === 'cancel') return cancelVoyage(voyageId);
        if (body.action === 'reopen') return reopenVoyage(voyageId);
        return updateVoyage(voyageId, body);
      },
    );
    return NextResponse.json(item);
  } catch (err) {
    return voyageError(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkAnyPermission(DEL);
  if (denied) return denied;
  try {
    const { id } = await params;
    const voyageId = id?.trim();
    if (!voyageId) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const before = await getVoyage(voyageId);
    if (!before) return NextResponse.json({ error: 'Voyage introuvable' }, { status: 404 });
    await withAudit(
      {
        module: 'charroi.voyages',
        action: 'delete',
        entityType: 'charroi.voyage',
        entityId: voyageId,
        summary: `Suppression voyage ${before.numero} ${before.passagerNom}`,
        getBefore: async () => before,
        getAfter: () => null,
        path: `/api/charroi/voyages/${voyageId}`,
        method: 'DELETE',
      },
      async () => {
        await deleteVoyage(voyageId);
        return true;
      },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    return voyageError(err);
  }
}
