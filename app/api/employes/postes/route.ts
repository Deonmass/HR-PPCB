import { NextResponse } from 'next/server';
import {
  createVacantPoste,
  getPostesBundle,
  renamePosteTitle,
  updateCatalogPoste,
  updateEmployeePoste,
} from '@/lib/postes-store';
import type {
  CatalogPosteUpdate,
  EmployeePosteUpdate,
  VacantPosteInput,
} from '@/lib/postes-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'employes.postes', action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
  ]);
  if (denied) return denied;

  try {
    const data = await getPostesBundle();
    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.postes', action: 'create' },
    { menuId: 'employes.postes', action: 'edit' },
    { menuId: 'employes.liste', action: 'create' },
    { menuId: 'employes.liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      action?: string;
      vacant?: VacantPosteInput;
      employee?: EmployeePosteUpdate;
      rename?: { from: string; to: string };
      catalog?: CatalogPosteUpdate;
    };

    if (body.action === 'update-catalog' && body.catalog) {
      const result = await withAudit(
        {
          module: 'postes',
          action: 'update',
          entityType: 'poste',
          entityId: body.catalog.fromTitle,
          summary: `Màj poste catalogue « ${body.catalog.fromTitle} » → « ${body.catalog.title} »`,
          path: '/api/employes/postes',
          method: 'POST',
        },
        () => updateCatalogPoste(body.catalog!),
      );
      return NextResponse.json(result);
    }

    if (body.action === 'rename' && body.rename) {
      const result = await withAudit(
        {
          module: 'postes',
          action: 'update',
          entityType: 'poste',
          entityId: body.rename.from,
          summary: `Renommage poste « ${body.rename.from} » → « ${body.rename.to} »`,
          path: '/api/employes/postes',
          method: 'POST',
        },
        () => renamePosteTitle(body.rename!.from, body.rename!.to),
      );
      return NextResponse.json(result);
    }

    if (body.action === 'update-employee' && body.employee) {
      const saved = await withAudit(
        {
          module: 'postes',
          action: 'update',
          entityType: 'employee-poste',
          entityId: body.employee.matricule,
          summary: `Màj poste employé ${body.employee.matricule}`,
          path: '/api/employes/postes',
          method: 'POST',
        },
        () => updateEmployeePoste(body.employee!),
      );
      return NextResponse.json(saved);
    }

    // default: create vacant
    const vacant = body.vacant || (body as VacantPosteInput);
    const saved = await withAudit(
      {
        module: 'postes',
        action: 'create',
        entityType: 'vacant-poste',
        entityId: vacant.title || '—',
        summary: `Poste vacant « ${vacant.title} »`,
        path: '/api/employes/postes',
        method: 'POST',
      },
      () => createVacantPoste(vacant),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|introuvable/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
