import { NextResponse } from 'next/server';
import { createProtocolVoyage, listProtocolVoyages } from '@/lib/protocol-voyage-store';
import type { ProtocolVoyageCoutInput } from '@/lib/protocol-voyage-types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'protocol.voyages';

function voyageError(err: unknown) {
  const message = err instanceof Error ? err.message : 'Erreur inattendue';
  const status = /requis|invalide|introuvable/i.test(message) ? 400 : 500;
  return NextResponse.json({ error: message }, { status: /introuvable/i.test(message) ? 404 : status });
}

export async function GET() {
  const denied = await checkPermission(MENU, 'view');
  if (denied) return denied;
  try {
    return NextResponse.json(await listProtocolVoyages());
  } catch (err) {
    return voyageError(err);
  }
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  try {
    const body = (await request.json()) as ProtocolVoyageCoutInput;
    const item = await withAudit(
      {
        module: MENU,
        action: 'create',
        entityType: 'protocol.voyage',
        entityId: (result) => (result as { id?: string })?.id,
        summary: (result) => {
          const voyage = result as { numero?: string; voyageur?: string; destination?: string };
          return `Voyage ${voyage.numero || ''} ${voyage.voyageur || ''} ${voyage.destination || ''}`.trim();
        },
        path: '/api/protocol/voyages',
        method: 'POST',
      },
      () => createProtocolVoyage(body),
    );
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return voyageError(err);
  }
}
