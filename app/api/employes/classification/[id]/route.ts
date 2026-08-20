import { NextResponse } from 'next/server';
import {
  deleteClassificationPoste,
  updateClassificationPoste,
} from '@/lib/classification-store';
import type { ClassificationPosteInput } from '@/lib/classification-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.classification', action: 'edit' },
    { menuId: 'employes.postes', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as ClassificationPosteInput;
    const saved = await withAudit(
      {
        module: 'classification',
        action: 'update',
        entityType: 'classification-poste',
        entityId: id,
        summary: `Modification poste classifié — ${body.title || id}`,
        path: `/api/employes/classification/${id}`,
        method: 'PUT',
      },
      () => updateClassificationPoste(id, body),
    );
    if (!saved) {
      return NextResponse.json({ error: 'Poste introuvable' }, { status: 404 });
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
    { menuId: 'employes.classification', action: 'delete' },
    { menuId: 'employes.postes', action: 'delete' },
    { menuId: 'employes.liste', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const ok = await withAudit(
      {
        module: 'classification',
        action: 'delete',
        entityType: 'classification-poste',
        entityId: id,
        summary: `Suppression poste classifié — ${id}`,
        path: `/api/employes/classification/${id}`,
        method: 'DELETE',
      },
      () => deleteClassificationPoste(id),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Poste introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
