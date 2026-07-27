import { NextResponse } from 'next/server';
import {
  applyRoleToUser,
  createPermissionRole,
  getPermissions,
  getRolePermissionsById,
  getUserPermissions,
  listPermissionRoles,
  savePermissions,
  saveRolePermissionsData,
  saveUserPermissions,
} from '@/lib/auth-store';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import type { MenuPermission, PermissionsData } from '@/lib/auth-types';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId')?.trim();
  const roleId = searchParams.get('roleId')?.trim();

  if (userId) {
    const denied = await checkAnyPermission([
      { menuId: 'settings.permissions', action: 'view' },
      { menuId: 'settings.utilisateurs', action: 'view' },
    ]);
    if (denied) return denied;
    const menus = await getUserPermissions(userId);
    return NextResponse.json({ userId, menus });
  }

  if (roleId) {
    const denied = await checkPermission('settings.permissions', 'view');
    if (denied) return denied;
    const menus = await getRolePermissionsById(roleId);
    return NextResponse.json({ roleId, menus });
  }

  const denied = await checkPermission('settings.permissions', 'view');
  if (denied) return denied;

  const [data, roles] = await Promise.all([getPermissions(), listPermissionRoles()]);
  return NextResponse.json({ ...data, roles });
}

export async function POST(request: Request) {
  const denied = await checkPermission('settings.permissions', 'edit');
  if (denied) return denied;

  try {
    const body = (await request.json()) as
      | { action: 'createRole'; roleName: string }
      | { action: 'applyRole'; roleId: string; userId: string };

    if (body.action === 'createRole') {
      if (!body.roleName?.trim()) {
        return NextResponse.json({ error: 'Nom du rôle requis' }, { status: 400 });
      }
      const role = await createPermissionRole(body.roleName);
      return NextResponse.json(role);
    }

    if (body.action === 'applyRole') {
      if (!body.roleId || !body.userId) {
        return NextResponse.json({ error: 'Rôle et utilisateur requis' }, { status: 400 });
      }
      const saved = await applyRoleToUser(body.roleId, body.userId);
      return NextResponse.json(saved);
    }

    return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission('settings.permissions', 'edit');
  if (denied) return denied;
  try {
    const body = (await request.json()) as
      | PermissionsData
      | { userId: string; menus: MenuPermission[] }
      | { roleId: string; menus: MenuPermission[] };

    if ('roleId' in body && body.roleId && body.menus) {
      const saved = await saveRolePermissionsData(body.roleId, body.menus);
      return NextResponse.json(saved);
    }

    if ('userId' in body && body.userId && body.menus) {
      const saved = await saveUserPermissions(body.userId, body.menus);
      return NextResponse.json(saved);
    }

    const saved = await savePermissions(body as PermissionsData);
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
