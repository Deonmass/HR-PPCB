import { NextResponse } from 'next/server';
import {
  deleteContractantEmployee,
  updateContractantEmployee,
} from '@/lib/contractants-store';
import type { ContractantEmployeeInput } from '@/lib/contractants-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string; empId: string }>;
}

export async function PUT(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'edit' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const { id, empId } = await context.params;
    const body = (await request.json()) as ContractantEmployeeInput;
    const saved = await withAudit(
      {
        module: 'contractants',
        action: 'update',
        entityType: 'contractant-employee',
        entityId: empId,
        summary: `Modification employé contractant — ${body.nom || empId}`,
        path: `/api/employes/contractants/${id}/employees/${empId}`,
        method: 'PUT',
      },
      () => updateContractantEmployee(id, empId, body),
    );
    if (!saved) {
      return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
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
    const { id, empId } = await context.params;
    const ok = await withAudit(
      {
        module: 'contractants',
        action: 'delete',
        entityType: 'contractant-employee',
        entityId: empId,
        summary: `Suppression employé contractant ${empId}`,
        path: `/api/employes/contractants/${id}/employees/${empId}`,
        method: 'DELETE',
      },
      () => deleteContractantEmployee(id, empId),
    );
    if (!ok) {
      return NextResponse.json({ error: 'Employé introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
