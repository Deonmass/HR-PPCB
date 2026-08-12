import { NextResponse } from 'next/server';
import { createContractantEmployee } from '@/lib/contractants-store';
import type { ContractantEmployeeInput } from '@/lib/contractants-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'create' },
    { menuId: 'employes.contractants', action: 'edit' },
    { menuId: 'employes.liste', action: 'create' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as ContractantEmployeeInput;
    const saved = await withAudit(
      {
        module: 'contractants',
        action: 'create',
        entityType: 'contractant-employee',
        entityId: body.nom || '—',
        summary: `Employé contractant — ${body.nom || '—'}`,
        path: `/api/employes/contractants/${id}/employees`,
        method: 'POST',
      },
      () => createContractantEmployee(id, body),
    );
    if (!saved) {
      return NextResponse.json({ error: 'Contractant introuvable' }, { status: 404 });
    }
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
