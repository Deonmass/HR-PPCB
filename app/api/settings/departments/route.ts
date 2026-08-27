import { NextResponse } from 'next/server';
import {
  createDepartmentId,
  deleteDepartment,
  listDepartments,
  upsertDepartment,
} from '@/lib/settings-store';
import { syncCanonicalDepartmentsSettings } from '@/lib/settings-departments-sync';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { DepartmentSetting } from '@/lib/auth-types';
import { withAudit } from '@/lib/with-audit';

const MENU = 'settings.departements';

export async function GET(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'view' },
    { menuId: 'employes.liste', action: 'view' },
    { menuId: 'employes.contractants', action: 'view' },
    { menuId: 'employes.check-documents', action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: 'travel.mission.kinshasa', action: 'view' },
    { menuId: 'travel.mission.zamba', action: 'view' },
    { menuId: 'travel.mission.zamba-consultant', action: 'view' },
    { menuId: 'travel.mission.lubudi', action: 'view' },
    { menuId: 'travel.historique', action: 'view' },
    { menuId: 'charroi.vehicules', action: 'view' },
    { menuId: 'charroi', action: 'view' },
  ]);
  if (denied) return denied;

  const url = new URL(request.url);
  if (url.searchParams.get('sync') === '1') {
    await syncCanonicalDepartmentsSettings();
  }

  const departments = await listDepartments();
  // Actifs d’abord, puis alpha
  departments.sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1;
    return a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });
  });
  return NextResponse.json(departments);
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  const body = (await request.json()) as Partial<DepartmentSetting>;
  const name = body.name?.trim() ?? '';
  const item = await withAudit(
    {
      module: 'settings.departements',
      action: 'create',
      entityType: 'settings.department',
      entityId: (result) => (result as DepartmentSetting)?.id,
      summary: (result) => `Création département ${(result as DepartmentSetting).name}`,
      path: '/api/settings/departments',
      method: 'POST',
    },
    () =>
      upsertDepartment({
        id: body.id?.trim() || createDepartmentId(name),
        name,
        code: body.code?.trim(),
        active: body.active ?? true,
      }),
  );
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  const body = (await request.json()) as DepartmentSetting;
  const before = (await listDepartments()).find((d) => d.id === body.id);
  const item = await withAudit(
    {
      module: 'settings.departements',
      action: 'update',
      entityType: 'settings.department',
      entityId: body.id,
      summary: `Modification département ${body.name || body.id}`,
      getBefore: async () => before ?? null,
      path: '/api/settings/departments',
      method: 'PUT',
    },
    () => upsertDepartment(body),
  );
  return NextResponse.json(item);
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  const before = (await listDepartments()).find((d) => d.id === id);
  const ok = await withAudit(
    {
      module: 'settings.departements',
      action: 'delete',
      entityType: 'settings.department',
      entityId: id,
      summary: `Suppression département ${before?.name ?? id}`,
      getBefore: async () => before ?? null,
      getAfter: () => null,
      path: '/api/settings/departments',
      method: 'DELETE',
    },
    () => deleteDepartment(id),
  );
  if (!ok) return NextResponse.json({ error: 'Département introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
