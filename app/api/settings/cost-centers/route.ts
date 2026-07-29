import { NextResponse } from 'next/server';
import {
  createCostCenterId,
  deleteCostCenter,
  listCostCenters,
  upsertCostCenter,
} from '@/lib/settings-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { CostCenterSetting } from '@/lib/auth-types';
import { withAudit } from '@/lib/with-audit';

const MENU = 'settings.centres';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: 'factures.fournisseur.factures', action: 'view' },
  ]);
  if (denied) return denied;
  const costCenters = await listCostCenters();
  return NextResponse.json(costCenters);
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  const body = (await request.json()) as Partial<CostCenterSetting>;
  const item = await withAudit(
    {
      module: 'settings.centres',
      action: 'create',
      entityType: 'settings.cost-center',
      entityId: (result) => (result as CostCenterSetting)?.id,
      summary: (result) => {
        const c = result as CostCenterSetting;
        return `Création centre de coût ${c.code || c.name || c.id}`;
      },
      path: '/api/settings/cost-centers',
      method: 'POST',
    },
    () =>
      upsertCostCenter({
        id: body.id?.trim() || createCostCenterId(),
        code: body.code?.trim() ?? '',
        name: body.name?.trim() ?? '',
        departmentId: body.departmentId,
        active: body.active ?? true,
      }),
  );
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  const body = (await request.json()) as CostCenterSetting;
  const before = (await listCostCenters()).find((c) => c.id === body.id);
  const item = await withAudit(
    {
      module: 'settings.centres',
      action: 'update',
      entityType: 'settings.cost-center',
      entityId: body.id,
      summary: `Modification centre de coût ${body.code || body.name || body.id}`,
      getBefore: async () => before ?? null,
      path: '/api/settings/cost-centers',
      method: 'PUT',
    },
    () => upsertCostCenter(body),
  );
  return NextResponse.json(item);
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  const before = (await listCostCenters()).find((c) => c.id === id);
  const ok = await withAudit(
    {
      module: 'settings.centres',
      action: 'delete',
      entityType: 'settings.cost-center',
      entityId: id,
      summary: `Suppression centre de coût ${before?.code || before?.name || id}`,
      getBefore: async () => before ?? null,
      getAfter: () => null,
      path: '/api/settings/cost-centers',
      method: 'DELETE',
    },
    () => deleteCostCenter(id),
  );
  if (!ok) return NextResponse.json({ error: 'Centre de coût introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
