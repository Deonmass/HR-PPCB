import { NextResponse } from 'next/server';
import {
  createDepartmentId,
  deleteDepartment,
  listDepartments,
  upsertDepartment,
} from '@/lib/settings-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { DepartmentSetting } from '@/lib/auth-types';

const MENU = 'settings.departements';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
  ]);
  if (denied) return denied;
  const departments = await listDepartments();
  return NextResponse.json(departments);
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  const body = (await request.json()) as Partial<DepartmentSetting>;
  const name = body.name?.trim() ?? '';
  const item = await upsertDepartment({
    id: body.id?.trim() || createDepartmentId(name),
    name,
    code: body.code?.trim(),
    active: body.active ?? true,
  });
  return NextResponse.json(item, { status: 201 });
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  const body = (await request.json()) as DepartmentSetting;
  const item = await upsertDepartment(body);
  return NextResponse.json(item);
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  const ok = await deleteDepartment(id);
  if (!ok) return NextResponse.json({ error: 'Département introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
