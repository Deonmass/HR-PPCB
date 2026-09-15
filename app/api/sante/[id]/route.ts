import { NextResponse } from 'next/server';
import { checkAnyPermission } from '@/lib/require-permission';
import { deleteSanteVisit, getSanteVisit, updateSanteVisit } from '@/lib/sante-store';
import type { SanteVisitInput } from '@/lib/sante-types';
import { getAuditActor, withAudit } from '@/lib/with-audit';

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.donnees', action: 'edit' },
    { menuId: 'sante', action: 'edit' },
  ]);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as SanteVisitInput;
    const actor = await getAuditActor();
    const before = await getSanteVisit(id);
    const saved = await withAudit(
      {
        module: 'sante',
        action: 'update',
        entityType: 'sante.visit',
        entityId: id,
        summary: `Modification cas santé — ${body.nom || id}`,
        getBefore: async () => before,
        path: `/api/sante/${id}`,
        method: 'PUT',
      },
      () => updateSanteVisit(id, body, actor?.userEmail || actor?.userName),
    );
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    const status = /introuvable/.test(message) ? 404 : /requis|invalide/.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.donnees', action: 'delete' },
    { menuId: 'sante', action: 'delete' },
  ]);
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const before = await getSanteVisit(id);
    const removed = await withAudit(
      {
        module: 'sante',
        action: 'delete',
        entityType: 'sante.visit',
        entityId: id,
        summary: `Suppression cas santé — ${before?.nom || id}`,
        getBefore: async () => before,
        path: `/api/sante/${id}`,
        method: 'DELETE',
      },
      () => deleteSanteVisit(id),
    );
    return NextResponse.json(removed);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    const status = /introuvable/.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
