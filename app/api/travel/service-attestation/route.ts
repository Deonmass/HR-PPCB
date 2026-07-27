import { NextResponse } from 'next/server';
import {
  createServiceAttestation,
  listServiceAttestations,
  deleteServiceAttestation,
} from '@/lib/service-attestation-store';
import type { ServiceAttestationFormData } from '@/lib/service-attestation-types';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';

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
    { menuId: 'travel.historique', action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
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
    { menuId: 'travel.etablir', action: 'create' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as Partial<ServiceAttestationFormData>;
    const error = validateForm(body);
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    const record = await createServiceAttestation({
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
    });

    return NextResponse.json(record);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.attestation', action: 'delete' },
    { menuId: 'travel.historique', action: 'delete' },
  ]);
  if (denied) return denied;

  try {
    const id = new URL(request.url).searchParams.get('id')?.trim();
    if (!id) {
      return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
    }
    const removed = await deleteServiceAttestation(id);
    if (!removed) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
