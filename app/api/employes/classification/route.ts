import { NextResponse } from 'next/server';
import {
  createClassificationPoste,
  listClassificationPostes,
} from '@/lib/classification-store';
import type { ClassificationPosteInput } from '@/lib/classification-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.classification', action: 'view' },
    { menuId: 'employes.postes', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const postes = await listClassificationPostes();
    return NextResponse.json({ postes });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.classification', action: 'create' },
    { menuId: 'employes.classification', action: 'edit' },
    { menuId: 'employes.postes', action: 'create' },
    { menuId: 'employes.liste', action: 'create' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as ClassificationPosteInput;
    const saved = await withAudit(
      {
        module: 'classification',
        action: 'create',
        entityType: 'classification-poste',
        entityId: body.title || '—',
        summary: `Poste classifié créé — ${body.title || '—'}`,
        path: '/api/employes/classification',
        method: 'POST',
      },
      () => createClassificationPoste(body),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
