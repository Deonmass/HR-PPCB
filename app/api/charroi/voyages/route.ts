import { NextResponse } from 'next/server';
import { createVoyage, listVoyages } from '@/lib/charroi-store';
import type { CharroiVoyageInput } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const VIEW = [
  { menuId: 'charroi.voyages', action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];
const CREATE = [
  { menuId: 'charroi.voyages', action: 'create' as const },
  { menuId: 'charroi', action: 'create' as const },
];

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

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const items = await listVoyages();
    return NextResponse.json(items);
  } catch (err) {
    return voyageError(err);
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission(CREATE);
  if (denied) return denied;
  try {
    const body = (await request.json()) as CharroiVoyageInput;
    const item = await withAudit(
      {
        module: 'charroi.voyages',
        action: 'create',
        entityType: 'charroi.voyage',
        entityId: (result) => (result as { id?: string })?.id,
        summary: (result) => {
          const voyage = result as { numero?: string; passagerNom?: string; depart?: string; destination?: string };
          return `Demande de voyage ${voyage.numero || ''} ${voyage.passagerNom || ''} ${voyage.depart || ''} → ${voyage.destination || ''}`.trim();
        },
        path: '/api/charroi/voyages',
        method: 'POST',
      },
      () => createVoyage(body),
    );
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return voyageError(err);
  }
}
