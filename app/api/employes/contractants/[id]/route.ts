import { NextResponse } from 'next/server';
import {
  canAccessContractantId,
  getContractantScopeFromMenus,
} from '@/lib/contractant-scope';
import {
  deleteContractant,
  getContractant,
  updateContractant,
} from '@/lib/contractants-store';
import type { ContractantInput } from '@/lib/contractants-types';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

async function denyIfOutsideScope(contractantId: string): Promise<NextResponse | null> {
  const session = await getActiveSession();
  const scope = getContractantScopeFromMenus(session?.menus);
  if (!canAccessContractantId(contractantId, scope)) {
    return NextResponse.json(
      { error: 'Ce contractant n’est pas dans votre périmètre.' },
      { status: 403 },
    );
  }
  return null;
}

export async function GET(_request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'employes.airtime', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const outside = await denyIfOutsideScope(id);
    if (outside) return outside;
    const contractant = await getContractant(id);
    if (!contractant) {
      return NextResponse.json({ error: 'Contractant introuvable' }, { status: 404 });
    }
    return NextResponse.json(contractant);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const outside = await denyIfOutsideScope(id);
    if (outside) return outside;
    const body = (await request.json()) as ContractantInput;
    const saved = await withAudit(
      {
        module: 'contractants',
        action: 'update',
        entityType: 'contractant',
        entityId: id,
        summary: `Modification contractant — ${body.denomination || id}`,
        path: `/api/employes/contractants/${id}`,
        method: 'PUT',
      },
      () => updateContractant(id, body),
    );
    if (!saved) {
      return NextResponse.json({ error: 'Contractant introuvable' }, { status: 404 });
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
    { menuId: 'employes.contractants', action: 'delete' },
    { menuId: 'employes.liste', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const outside = await denyIfOutsideScope(id);
    if (outside) return outside;
    const ok = await withAudit(
      {
        module: 'contractants',
        action: 'delete',
        entityType: 'contractant',
        entityId: id,
        summary: `Suppression contractant ${id}`,
        path: `/api/employes/contractants/${id}`,
        method: 'DELETE',
      },
      () => deleteContractant(id),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Contractant introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
