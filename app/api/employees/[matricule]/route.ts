import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { deleteEmployee, getEmployee, upsertEmployee, updateEmployeeDocument } from '@/lib/employees-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { Employee } from '@/lib/types';
import { emptyEmployeeHrProfile } from '@/lib/types';

type Params = { params: Promise<{ matricule: string }> };

export async function GET(_: Request, { params }: Params) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
  ]);
  if (denied) return denied;
  try {
    const { matricule } = await params;
    const employee = await getEmployee(matricule);
    if (!employee) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
    return NextResponse.json(employee);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request, { params }: Params) {
  const denied = await checkPermission('employes.liste', 'edit');
  if (denied) return denied;
  try {
    const { matricule } = await params;
    const body = (await request.json()) as Employee;
    if (body.matricule !== matricule) {
      return NextResponse.json({ error: 'Matricule incohérent' }, { status: 400 });
    }
    const current = await getEmployee(matricule);
    const saved = await upsertEmployee({
      ...emptyEmployeeHrProfile(),
      ...(current ?? {}),
      ...body,
    });
    return NextResponse.json(saved);
  } catch (err) {
    if (err instanceof Error && /raison exit/i.test(err.message)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const denied = await checkPermission('employes.check-documents', 'edit');
  if (denied) return denied;
  try {
    const { matricule } = await params;
    const body = await request.json();

    if (body.docKey && body.value) {
      const updated = await updateEmployeeDocument(matricule, body.docKey, body.value);
      if (!updated) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: 'Requête invalide' }, { status: 400 });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_: Request, { params }: Params) {
  const denied = await checkPermission('employes.liste', 'delete');
  if (denied) return denied;
  try {
    const { matricule } = await params;
    const ok = await deleteEmployee(matricule);
    if (!ok) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
