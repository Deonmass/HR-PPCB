import { NextResponse } from 'next/server';
import {
  createServiceAttestation,
  listServiceAttestations,
  deleteServiceAttestation,
  getServiceAttestation,
} from '@/lib/service-attestation-store';
import type { ServiceAttestationFormData } from '@/lib/service-attestation-types';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

function validateForm(body: Partial<ServiceAttestationFormData>): string | null {
  if (!body.documentDate?.trim()) return 'La date du document est requise';
  if (!body.hodName?.trim()) return 'Le nom du responsable est requis';
  if (!body.hodFunction?.trim()) return 'La fonction du responsable est requise';
  if (!body.employeeName?.trim()) return 'Le nom de l\'employé est requis';
  if (!body.employeeMatricule?.trim()) return 'Le matricule est requis';
  if (!body.employeeFunction?.trim()) return 'La fonction est requise';
  if (!body.employeeDepartment?.trim()) return 'Le département est requis';
  return null;
}

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'travel.attestation', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const records = await listServiceAttestations();
    return NextResponse.json({ records });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.attestation', action: 'create' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<ServiceAttestationFormData>;
    const error = validateForm(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const record = await withAudit(
      {
        module: 'travel.attestation',
        action: 'create',
        entityType: 'travel.attestation',
        entityId: (result) => (result as { id?: string } | null)?.id,
        summary: `Création attestation de service — ${body.employeeName!.trim()}`,
        details: (result) => {
          const created = result as { id?: string; employeeMatricule?: string } | null;
          return `Attestation créée pour ${body.employeeName!.trim()} (${body.employeeMatricule!.trim()})${created?.id ? ` — id ${created.id}` : ''}.`;
        },
        getAfter: (result) => result,
        path: '/api/travel/service-attestation',
        method: 'POST',
        logErrors: true,
      },
      () =>
        createServiceAttestation({
          language: body.language === 'en' ? 'en' : 'fr',
          documentDate: body.documentDate!.trim(),
          hodGenre: body.hodGenre?.trim() || 'Monsieur',
          hodName: body.hodName!.trim(),
          hodFunction: body.hodFunction!.trim(),
          employeeGenre: body.employeeGenre?.trim() || 'Monsieur',
          employeeName: body.employeeName!.trim(),
          employeeMatricule: body.employeeMatricule!.trim(),
          dateEmbauche: body.dateEmbauche?.trim() || '',
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
  const denied = await checkAnyPermission([
    { menuId: 'travel.attestation', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }

    const removed = await withAudit(
      {
        module: 'travel.attestation',
        action: 'delete',
        entityType: 'travel.attestation',
        entityId: id,
        summary: `Suppression attestation de service ${id}`,
        details: (_result, before) => {
          const row = before as { employeeName?: string; employeeMatricule?: string } | null;
          const who = row?.employeeName?.trim()
            ? `${row.employeeName}${row.employeeMatricule ? ` (${row.employeeMatricule})` : ''}`
            : id;
          return `Attestation de service « ${who} » supprimée.`;
        },
        getBefore: () => getServiceAttestation(id),
        getAfter: () => null,
        path: '/api/travel/service-attestation',
        method: 'DELETE',
        logErrors: true,
      },
      () => deleteServiceAttestation(id),
    );

    if (!removed) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
