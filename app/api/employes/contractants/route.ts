import { NextResponse } from 'next/server';
import {
  createContractant,
  listContractants,
} from '@/lib/contractants-store';
import type { ContractantInput } from '@/lib/contractants-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const contractants = await listContractants();
    return NextResponse.json({ contractants });
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
