import { NextResponse } from 'next/server';
import { checkAnyPermission } from '@/lib/require-permission';
import { createSickLeaveAttestation } from '@/lib/sick-leave-store';
import type { SickLeaveAttestationInput } from '@/lib/sick-leave-types';
import { getAuditActor, withAudit } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.conge-maladie', action: 'create' },
    { menuId: 'sante', action: 'create' },
  ]);
  if (denied) return denied;
  try {
    const body = (await request.json()) as SickLeaveAttestationInput;
    const actor = await getAuditActor();
    const saved = await withAudit(
      {
        module: 'sante.conge-maladie',
        action: 'create',
        entityType: 'sante.sick-leave.attestation',
        entityId: (result) => (result as { id?: string })?.id,
        summary: `Attestation maladie — ${body.nom} (${body.matricule})`,
        path: '/api/sante/conge-maladie/attestations',
        method: 'POST',
        defer: true,
      },
      () => createSickLeaveAttestation(body, actor?.userEmail || actor?.userName),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
