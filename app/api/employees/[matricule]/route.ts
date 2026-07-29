import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { deleteEmployee, getEmployee, upsertEmployee, updateEmployeeDocument } from '@/lib/employees-json-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { Employee } from '@/lib/types';
import { emptyEmployeeHrProfile } from '@/lib/types';
import { withAudit } from '@/lib/with-audit';

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
    const saved = await withAudit(
      {
        module: 'employees',
        action: 'update',
        entityType: 'employee',
        entityId: matricule,
        summary: `Modification employé ${matricule}`,
        getBefore: () => getEmployee(matricule),
        path: `/api/employees/${matricule}`,
        method: 'PUT',
      },
      async () => {
        const current = await getEmployee(matricule);
        return upsertEmployee({
          ...emptyEmployeeHrProfile(),
          ...(current ?? {}),
          ...body,
        });
      },
    );
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
      const updated = await withAudit(
        {
          module: 'employees',
          action: 'update',
          entityType: 'employee',
          entityId: matricule,
          summary: `Document employé ${matricule} — ${body.docKey}`,
          getBefore: () => getEmployee(matricule),
          path: `/api/employees/${matricule}`,
          method: 'PATCH',
        },
        () => updateEmployeeDocument(matricule, body.docKey, body.value),
      );
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
    const ok = await withAudit(
      {
        module: 'employees',
        action: 'delete',
        entityType: 'employee',
        entityId: matricule,
        summary: `Suppression employé ${matricule}`,
        getBefore: () => getEmployee(matricule),
        getAfter: () => null,
        path: `/api/employees/${matricule}`,
        method: 'DELETE',
      },
      () => deleteEmployee(matricule),
    );
    if (!ok) return NextResponse.json({ error: 'Non trouvé' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
