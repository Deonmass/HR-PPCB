import { NextResponse } from 'next/server';
import {
  createLeaveAttestation,
  deleteLeaveAttestation,
  getLeaveAttestation,
  listLeaveAttestations,
} from '@/lib/leave-attestation-store';
import type { LeaveAttestationFormData } from '@/lib/leave-attestation-types';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

function validateForm(body: Partial<LeaveAttestationFormData>): string | null {
  if (!body.documentDate?.trim()) return 'La date du document est requise';
  if (!body.leaveStart?.trim()) return 'La date de début de congé est requise';
  if (!body.leaveEnd?.trim()) return 'La date de fin / reprise est requise';
  if (!body.hodName?.trim()) return 'Le nom du responsable est requis';
  if (!body.hodFunction?.trim()) return 'La fonction du responsable est requise';
  if (!body.employeeName?.trim()) return "Le nom de l'employé est requis";
  if (!body.employeeMatricule?.trim()) return 'Le matricule est requis';
  if (!body.employeeFunction?.trim()) return 'La fonction est requise';
  if (!body.employeeDepartment?.trim()) return 'Le département est requis';
  return null;
}

export async function GET() {
  const denied = await checkAnyPermission([{ menuId: 'documents.attestation-conge', action: 'view' }]);
  if (denied) return denied;
  try {
    const records = await listLeaveAttestations();
    return NextResponse.json({ records });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([{ menuId: 'documents.attestation-conge', action: 'create' }]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<LeaveAttestationFormData>;
    const error = validateForm(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const record = await withAudit(
      {
        module: 'documents.attestation-conge',
        action: 'create',
        entityType: 'documents.attestation-conge',
        entityId: (result) => (result as { id?: string } | null)?.id,
        summary: `Création attestation de congé — ${body.employeeName!.trim()}`,
        details: () =>
          `Congé ${body.leaveStart} → ${body.leaveEnd} pour ${body.employeeName!.trim()} (${body.employeeMatricule!.trim()}).`,
        getAfter: (result) => result,
        path: '/api/documents/leave-attestation',
        method: 'POST',
        logErrors: true,
      },
      () =>
        createLeaveAttestation({
          documentDate: body.documentDate!.trim(),
          leaveStart: body.leaveStart!.trim(),
          leaveEnd: body.leaveEnd!.trim(),
          hodGenre: body.hodGenre?.trim() || 'Monsieur',
          hodName: body.hodName!.trim(),
          hodFunction: body.hodFunction!.trim(),
          employeeGenre: body.employeeGenre?.trim() || 'Madame',
          employeeName: body.employeeName!.trim(),
          employeeMatricule: body.employeeMatricule!.trim(),
          employeeFunction: body.employeeFunction!.trim(),
          employeeDepartment: body.employeeDepartment!.trim(),
        }),
    );

    return NextResponse.json(record);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkAnyPermission([{ menuId: 'documents.attestation-conge', action: 'delete' }]);
  if (denied) return denied;

  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });

    const removed = await withAudit(
      {
        module: 'documents.attestation-conge',
        action: 'delete',
        entityType: 'documents.attestation-conge',
        entityId: id,
        summary: `Suppression attestation de congé ${id}`,
        details: (_result, before) => {
          const row = before as { employeeName?: string } | null;
          return `Attestation de congé « ${row?.employeeName || id} » supprimée.`;
        },
        getBefore: () => getLeaveAttestation(id),
        getAfter: () => null,
        path: '/api/documents/leave-attestation',
        method: 'DELETE',
        logErrors: true,
      },
      () => deleteLeaveAttestation(id),
    );

    if (!removed) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
