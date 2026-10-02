import { NextResponse } from 'next/server';
import {
  filterContractantsByScope,
  getContractantScopeFromMenus,
} from '@/lib/contractant-scope';
import { withContractantAirtimePhones } from '@/lib/airtime-store';
import {
  createContractant,
  listContractants,
} from '@/lib/contractants-store';
import type { ContractantInput } from '@/lib/contractants-types';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';
import { canPerformAction } from '@/lib/permission-check';
import { withAudit } from '@/lib/with-audit';

export async function GET(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'settings.permissions', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const forPermissions = url.searchParams.get('forPermissions') === '1';
    const session = await getActiveSession();
    const all = await listContractants();

    // Admin permissions : liste complète pour cocher le périmètre.
    if (forPermissions) {
      const canEditPerms =
        session &&
        (canPerformAction(session.menus, 'settings.permissions', 'view') ||
          canPerformAction(session.menus, 'settings.permissions', 'edit'));
      if (!canEditPerms) {
        return NextResponse.json({ error: 'Permission refusée' }, { status: 403 });
      }
      return NextResponse.json({ contractants: all });
    }

    const scope = getContractantScopeFromMenus(session?.menus);
    const withPhones = await withContractantAirtimePhones(all);
    const contractants = filterContractantsByScope(withPhones, scope);
    return NextResponse.json(
      { contractants, scope },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'create' },
    { menuId: 'employes.contractants', action: 'edit' },
    { menuId: 'employes.liste', action: 'create' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  // Utilisateur limité à certains contractants : ne peut pas en créer de nouveaux.
  const session = await getActiveSession();
  const scope = getContractantScopeFromMenus(session?.menus);
  if (scope.contractantIds.length > 0) {
    return NextResponse.json(
      { error: 'Votre périmètre contractants ne permet pas de créer une nouvelle société.' },
      { status: 403 },
    );
  }

  try {
    const body = (await request.json()) as ContractantInput;
    const saved = await withAudit(
      {
        module: 'contractants',
        action: 'create',
        entityType: 'contractant',
        entityId: body.denomination || '—',
        summary: `Contractant créé — ${body.denomination || '—'}`,
        path: '/api/employes/contractants',
        method: 'POST',
      },
      () => createContractant(body),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
