import { NextResponse } from 'next/server';
import { getAuditActor, withAudit } from '@/lib/with-audit';
import { createRecrutement, getRecrutementBundle } from '@/lib/recrutement-store';
import type { RecrutementInput } from '@/lib/recrutement-types';
import { checkAnyPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.recrutement', action: 'view' },
    { menuId: 'employes.postes', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const data = await getRecrutementBundle();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.recrutement', action: 'create' },
    { menuId: 'employes.recrutement', action: 'edit' },
    { menuId: 'employes.postes', action: 'create' },
    { menuId: 'employes.postes', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as RecrutementInput;
    const actor = await getAuditActor();
    const saved = await withAudit(
      {
        module: 'recrutement',
        action: 'create',
        entityType: 'recrutement',
        entityId: body.position || '—',
        summary: `Recrutement ${body.category} — ${body.position}`,
        path: '/api/employes/recrutement',
        method: 'POST',
      },
      () => createRecrutement(body, actor?.userName || undefined),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
