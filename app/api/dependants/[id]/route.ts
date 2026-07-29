import { NextResponse } from 'next/server';
import { deleteDependant, getDependantRecord, updateDependant } from '@/lib/dependants-json-store';
import type { DependantFormData } from '@/lib/dependants-types';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.dependants', action: 'edit' },
  ]);
  if (denied) return denied;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  }

  try {
    const body = (await request.json()) as DependantFormData;
    if (!body.matricule || !body.nom || !body.statut) {
      return NextResponse.json({ error: 'Matricule, nom et statut requis' }, { status: 400 });
    }
    const updated = await withAudit(
      {
        module: 'dependants',
        action: 'update',
        entityType: 'dependant',
        entityId: String(id),
        summary: `Modification dépendant #${id} — ${body.nom}`,
        getBefore: () => getDependantRecord(id),
        path: `/api/dependants/${id}`,
        method: 'PUT',
      },
      () => updateDependant(id, body),
    );
    return NextResponse.json(updated);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.dependants', action: 'delete' },
  ]);
  if (denied) return denied;

  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'Identifiant invalide' }, { status: 400 });
  }

  try {
    const deleted = await withAudit(
      {
        module: 'dependants',
        action: 'delete',
        entityType: 'dependant',
        entityId: String(id),
        summary: `Suppression dépendant #${id}`,
        getBefore: () => getDependantRecord(id),
        getAfter: () => null,
        path: `/api/dependants/${id}`,
        method: 'DELETE',
      },
      () => deleteDependant(id),
    );
    if (!deleted) {
      return NextResponse.json({ error: 'Bénéficiaire introuvable' }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
