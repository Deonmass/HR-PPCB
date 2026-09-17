import { NextResponse } from 'next/server';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  buildTrainingDashboard,
  getTrainingDashboard,
  updateTrainingKpis,
  upsertTrainingMonthCost,
} from '@/lib/training-store';
import type { TrainingKpis } from '@/lib/training-types';
import { auditSimpleAction } from '@/lib/with-audit';

const PERMS = [
  { menuId: 'training', action: 'view' as const },
  { menuId: 'training', action: 'edit' as const },
];

export async function GET(request: Request) {
  const denied = await checkAnyPermission(PERMS);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year')) || undefined;
  const monthRaw = searchParams.get('month');
  const month =
    monthRaw == null || monthRaw === '' || monthRaw === 'all'
      ? null
      : Number(monthRaw) || null;
  const dash = await getTrainingDashboard(year, month);
  return NextResponse.json(dash);
}

export async function PATCH(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'training', action: 'edit' },
  ]);
  if (denied) return denied;

  const body = (await request.json()) as {
    kpis?: Partial<TrainingKpis>;
    monthCost?: { year: number; month: number; hq?: number; plant?: number };
    viewYear?: number;
    viewMonth?: number | null;
  };

  let store;
  if (body.monthCost) {
    store = await upsertTrainingMonthCost(body.monthCost);
    await auditSimpleAction({
      module: 'training',
      action: 'update',
      summary: `Training cost ${body.monthCost.year}-${String(body.monthCost.month).padStart(2, '0')}`,
    });
  } else if (body.kpis) {
    store = await updateTrainingKpis(body.kpis);
    await auditSimpleAction({
      module: 'training',
      action: 'update',
      summary: 'Mise à jour KPIs Training',
    });
  } else {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  const dash = buildTrainingDashboard(
    store,
    body.viewYear ?? body.monthCost?.year ?? new Date().getFullYear(),
    body.viewMonth === undefined ? null : body.viewMonth,
    'calendar',
  );
  return NextResponse.json(dash);
}
