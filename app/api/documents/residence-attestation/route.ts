import { NextResponse } from 'next/server';
import {
  createResidenceAttestation,
  deleteResidenceAttestation,
  getResidenceAttestation,
  listResidenceAttestations,
} from '@/lib/residence-attestation-store';
import type { ResidenceAttestationFormData } from '@/lib/residence-attestation-types';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

function validateForm(body: Partial<ResidenceAttestationFormData>): string | null {
  if (!body.documentDate?.trim()) return 'La date du document est requise';
  if (!body.residenceAddress?.trim()) return "L'adresse de résidence est requise";
  if (!body.hodName?.trim()) return 'Le nom du responsable est requis';
  if (!body.hodFunction?.trim()) return 'La fonction du responsable est requise';
  if (!body.employeeName?.trim()) return "Le nom de l'employé est requis";
  if (!body.employeeMatricule?.trim()) return 'Le matricule est requis';
  if (!body.employeeFunction?.trim()) return 'La fonction est requise';
  if (!body.employeeDepartment?.trim()) return 'Le département est requis';
  return null;
}

export async function GET() {
  const denied = await checkAnyPermission([{ menuId: 'documents.attestation-residence', action: 'view' }]);
  if (denied) return denied;
  try {
    const records = await listResidenceAttestations();
    return NextResponse.json({ records });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([{ menuId: 'documents.attestation-residence', action: 'create' }]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<ResidenceAttestationFormData>;
    const error = validateForm(body);
    if (error) return NextResponse.json({ error }, { status: 400 });

    const record = await withAudit(
      {
        module: 'documents.attestation-residence',
        action: 'create',
        entityType: 'documents.attestation-residence',
        entityId: (result) => (result as { id?: string } | null)?.id,
        summary: `Création attestation de résidence — ${body.employeeName!.trim()}`,
        details: () => {
          const maison = body.maisonNumero?.trim();
          const maisonPart = maison ? `maison ${maison}` : body.residenceAddress!.trim();
          return `Résidence ${maisonPart} pour ${body.employeeName!.trim()} (${body.employeeMatricule!.trim()}).`;
        },
        getAfter: (result) => result,
        path: '/api/documents/residence-attestation',
        method: 'POST',
        logErrors: true,
      },
      () =>
        createResidenceAttestation({
          documentDate: body.documentDate!.trim(),
          maisonNumero: body.maisonNumero?.trim() || '',
          residenceAddress: body.residenceAddress!.trim(),
          hodGenre: body.hodGenre?.trim() || 'Monsieur',
          hodName: body.hodName!.trim(),
          hodFunction: body.hodFunction!.trim(),
          employeeGenre: body.employeeGenre?.trim() || 'M.',
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
  const denied = await checkAnyPermission([{ menuId: 'documents.attestation-residence', action: 'delete' }]);
  if (denied) return denied;

  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });

    const removed = await withAudit(
      {
        module: 'documents.attestation-residence',
        action: 'delete',
        entityType: 'documents.attestation-residence',
        entityId: id,
        summary: `Suppression attestation de résidence ${id}`,
        details: (_result, before) => {
          const row = before as { employeeName?: string } | null;
          return `Attestation de résidence « ${row?.employeeName || id} » supprimée.`;
        },
        getBefore: () => getResidenceAttestation(id),
        getAfter: () => null,
        path: '/api/documents/residence-attestation',
        method: 'DELETE',
        logErrors: true,
      },
      () => deleteResidenceAttestation(id),
    );

    if (!removed) return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
