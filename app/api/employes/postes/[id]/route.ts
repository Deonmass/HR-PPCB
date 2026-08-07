import { NextResponse } from 'next/server';
import { deleteVacantPoste, updateVacantPoste } from '@/lib/postes-store';
import type { VacantPosteInput } from '@/lib/postes-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.postes', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as VacantPosteInput;
    const saved = await withAudit(
      {
        module: 'postes',
        action: 'update',
        entityType: 'vacant-poste',
        entityId: id,
        summary: `Màj poste vacant ${body.title || id}`,
        path: `/api/employes/postes/${id}`,
        method: 'PUT',
      },
      () => updateVacantPoste(id, body),
    );
    if (!saved) {
      return NextResponse.json({ error: 'Poste vacant introuvable' }, { status: 404 });
    }
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /requis/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.postes', action: 'delete' },
    { menuId: 'employes.liste', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const ok = await withAudit(
      {
        module: 'postes',
        action: 'delete',
        entityType: 'vacant-poste',
        entityId: id,
        summary: `Suppression poste vacant ${id}`,
        path: `/api/employes/postes/${id}`,
        method: 'DELETE',
      },
      () => deleteVacantPoste(id),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Poste vacant introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
