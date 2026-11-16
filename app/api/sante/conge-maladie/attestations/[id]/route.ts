import { NextResponse } from 'next/server';
import { checkAnyPermission } from '@/lib/require-permission';
import { deleteSickLeaveAttestation, updateSickLeaveAttestation } from '@/lib/sick-leave-store';
import type { SickLeaveAttestationInput } from '@/lib/sick-leave-types';
import { getAuditActor, withAudit } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, ctx: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.conge-maladie', action: 'edit' },
    { menuId: 'sante', action: 'edit' },
  ]);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    const body = (await request.json()) as SickLeaveAttestationInput;
    const actor = await getAuditActor();
    const saved = await withAudit(
      {
        module: 'sante.conge-maladie',
        action: 'update',
        entityType: 'sante.sick-leave.attestation',
        entityId: id,
        summary: `Attestation maladie — ${body.nom} (${body.matricule})`,
        path: `/api/sante/conge-maladie/attestations/${id}`,
        method: 'PUT',
        defer: true,
      },
      () => updateSickLeaveAttestation(id, body, actor?.userEmail || actor?.userName),
    );
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /introuvable/i.test(message) ? 404 : /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.conge-maladie', action: 'delete' },
    { menuId: 'sante', action: 'delete' },
  ]);
  if (denied) return denied;
  try {
    const { id } = await ctx.params;
    await withAudit(
      {
        module: 'sante.conge-maladie',
        action: 'delete',
        entityType: 'sante.sick-leave.attestation',
        entityId: id,
        summary: `Suppression attestation maladie ${id}`,
        path: `/api/sante/conge-maladie/attestations/${id}`,
        method: 'DELETE',
        defer: true,
      },
      () => deleteSickLeaveAttestation(id),
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    const status = /introuvable/i.test(message) ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
