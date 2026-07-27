import 'server-only';

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, getSessionCookieName } from './auth-store';
import type { PermissionAction } from './auth-types';
import { canPerformAction } from './permission-check';

async function getActiveSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  return getSession(token);
}

export async function checkPermission(
  menuId: string,
  action: PermissionAction,
): Promise<NextResponse | null> {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  if (!canPerformAction(session.menus, menuId, action)) {
    return NextResponse.json({ error: 'Permission refusée' }, { status: 403 });
  }
  return null;
}

export async function checkAnyPermission(
  entries: { menuId: string; action: PermissionAction }[],
): Promise<NextResponse | null> {
  const session = await getActiveSession();
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }
  const allowed = entries.some((entry) =>
    canPerformAction(session.menus, entry.menuId, entry.action),
  );
  if (!allowed) {
    return NextResponse.json({ error: 'Permission refusée' }, { status: 403 });
  }
  return null;
}
