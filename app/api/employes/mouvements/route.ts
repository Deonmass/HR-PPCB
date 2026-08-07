import { NextResponse } from 'next/server';
import { getAuditActor, withAudit } from '@/lib/with-audit';
import {
  buildMouvementsDashboard,
  createMouvement,
  listMouvements,
} from '@/lib/mouvements-store';
import type { MouvementInput } from '@/lib/mouvements-types';
import { checkAnyPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.mouvements', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const mouvements = await listMouvements();
    const dashboard = buildMouvementsDashboard(mouvements);
    return NextResponse.json({ mouvements, dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.mouvements', action: 'create' },
    { menuId: 'employes.mouvements', action: 'edit' },
    { menuId: 'employes.liste', action: 'create' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as MouvementInput;
    const actor = await getAuditActor();
    const createdBy = actor?.userName || undefined;
    const saved = await withAudit(
      {
        module: 'mouvements',
        action: 'create',
        entityType: 'mouvement',
        entityId: body.agentMatricule || '—',
        summary: `Mouvement ${body.type} — ${body.agentNom || body.agentMatricule}`,
        path: '/api/employes/mouvements',
        method: 'POST',
      },
      () => createMouvement(body, createdBy),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
