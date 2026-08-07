import { NextResponse } from 'next/server';
import { deleteMouvement, updateMouvement } from '@/lib/mouvements-store';
import type { MouvementInput } from '@/lib/mouvements-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.mouvements', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as MouvementInput;
    const saved = await withAudit(
      {
        module: 'mouvements',
        action: 'update',
        entityType: 'mouvement',
        entityId: id,
        summary: `Modification mouvement ${body.agentNom || body.agentMatricule || id}`,
        path: `/api/employes/mouvements/${id}`,
        method: 'PUT',
      },
      () => updateMouvement(id, body),
    );
    if (!saved) {
      return NextResponse.json({ error: 'Mouvement introuvable' }, { status: 404 });
    }
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.mouvements', action: 'delete' },
    { menuId: 'employes.liste', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const ok = await withAudit(
      {
        module: 'mouvements',
        action: 'delete',
        entityType: 'mouvement',
        entityId: id,
        summary: `Suppression mouvement ${id}`,
        path: `/api/employes/mouvements/${id}`,
        method: 'DELETE',
      },
      () => deleteMouvement(id),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Mouvement introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
