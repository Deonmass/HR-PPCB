import { NextResponse } from 'next/server';
import { deleteRecrutement, getRecrutementById, updateRecrutement } from '@/lib/recrutement-store';
import type { RecrutementInput } from '@/lib/recrutement-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.recrutement', action: 'edit' },
    { menuId: 'employes.postes', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as RecrutementInput;
    const saved = await withAudit(
      {
        module: 'recrutement',
        action: 'update',
        entityType: 'recrutement',
        entityId: id,
        summary: `Modification recrutement ${body.position || id}`,
        path: `/api/employes/recrutement/${id}`,
        method: 'PUT',
        getBefore: () => getRecrutementById(id),
      },
      () => updateRecrutement(id, body),
    );
    if (!saved) {
      return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 });
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
    { menuId: 'employes.recrutement', action: 'delete' },
    { menuId: 'employes.postes', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const before = await getRecrutementById(id);
    const ok = await withAudit(
      {
        module: 'recrutement',
        action: 'delete',
        entityType: 'recrutement',
        entityId: id,
        summary: `Suppression recrutement ${before?.position || id}`,
        path: `/api/employes/recrutement/${id}`,
        method: 'DELETE',
        getBefore: async () => before,
      },
      () => deleteRecrutement(id),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
