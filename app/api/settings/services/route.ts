import { NextResponse } from 'next/server';
import {
  createServiceId,
  deleteService,
  listServices,
  upsertService,
} from '@/lib/settings-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { ServiceSetting } from '@/lib/auth-types';
import { withAudit } from '@/lib/with-audit';

const MENU = 'settings.departements';

function asErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message.trim() ? err.message : fallback;
}

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

  const { searchParams } = new URL(request.url);
  const departmentId = searchParams.get('departmentId')?.trim();
  const services = await listServices();
  const filtered = departmentId
    ? services.filter((item) => item.departmentId === departmentId)
    : services;
  return NextResponse.json(filtered);
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  const body = (await request.json()) as Partial<ServiceSetting>;
  const name = body.name?.trim() ?? '';
  const departmentId = body.departmentId?.trim() ?? '';
  try {
    const item = await withAudit(
      {
        module: 'settings.services',
        action: 'create',
        entityType: 'settings.service',
        entityId: (result) => (result as ServiceSetting)?.id,
        summary: (result) => `Création service ${(result as ServiceSetting).name}`,
        path: '/api/settings/services',
        method: 'POST',
      },
      () =>
        upsertService({
          id: body.id?.trim() || createServiceId(departmentId, name),
          name,
          code: body.code?.trim(),
          departmentId,
          active: body.active ?? true,
        }),
    );
    return NextResponse.json(item, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: asErrorMessage(err, 'Erreur') }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  const body = (await request.json()) as ServiceSetting;
  const before = (await listServices()).find((item) => item.id === body.id);
  try {
    const item = await withAudit(
      {
        module: 'settings.services',
        action: 'update',
        entityType: 'settings.service',
        entityId: body.id,
        summary: `Modification service ${body.name || body.id}`,
        getBefore: async () => before ?? null,
        path: '/api/settings/services',
        method: 'PUT',
      },
      () => upsertService(body),
    );
    return NextResponse.json(item);
  } catch (err) {
    return NextResponse.json({ error: asErrorMessage(err, 'Erreur') }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  const before = (await listServices()).find((item) => item.id === id);
  const ok = await withAudit(
    {
      module: 'settings.services',
      action: 'delete',
      entityType: 'settings.service',
      entityId: id,
      summary: `Suppression service ${before?.name ?? id}`,
      getBefore: async () => before ?? null,
      getAfter: () => null,
      path: '/api/settings/services',
      method: 'DELETE',
    },
    () => deleteService(id),
  );
  if (!ok) return NextResponse.json({ error: 'Service introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
