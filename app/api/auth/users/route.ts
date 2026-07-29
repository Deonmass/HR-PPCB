import { NextResponse } from 'next/server';
import {
  deleteUser,
  listUsers,
  upsertUser,
} from '@/lib/auth-store';
import { checkPermission } from '@/lib/require-permission';
import type { AuthUser } from '@/lib/auth-types';
import { withAudit } from '@/lib/with-audit';

const MENU = 'settings.utilisateurs';

export async function GET() {
  const denied = await checkPermission(MENU, 'view');
  if (denied) return denied;
  const users = await listUsers();
  return NextResponse.json(users);
}

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;
  try {
    const body = (await request.json()) as Partial<AuthUser> & { password?: string };
    const username = body.username?.trim() ?? '';
    const user = await withAudit(
      {
        module: 'settings.utilisateurs',
        action: 'create',
        entityType: 'auth.user',
        entityId: (result) => (result as { id?: string })?.id,
        summary: (result) => {
          const u = result as { username?: string; displayName?: string };
          return `Création utilisateur ${u.displayName || u.username}`;
        },
        path: '/api/auth/users',
        method: 'POST',
      },
      () =>
        upsertUser({
          id: body.id?.trim() || username,
          username,
          displayName: body.displayName ?? '',
          initials: body.initials ?? '',
          email: body.email,
          matricule: body.matricule,
          active: body.active ?? true,
          password: body.password,
        }),
    );
    return NextResponse.json(user, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  try {
    const body = (await request.json()) as Partial<AuthUser> & { password?: string };
    if (!body.id?.trim()) {
      return NextResponse.json({ error: 'ID utilisateur requis' }, { status: 400 });
    }
    const before = (await listUsers()).find((u) => u.id === body.id);
    const user = await withAudit(
      {
        module: 'settings.utilisateurs',
        action: 'update',
        entityType: 'auth.user',
        entityId: body.id,
        summary: `Modification utilisateur ${body.displayName || body.username || body.id}`,
        getBefore: async () => before ?? null,
        path: '/api/auth/users',
        method: 'PUT',
      },
      () =>
        upsertUser({
          id: body.id!,
          username: body.username ?? '',
          displayName: body.displayName ?? '',
          initials: body.initials ?? '',
          email: body.email,
          matricule: body.matricule,
          active: body.active ?? true,
          password: body.password,
        }),
    );
    return NextResponse.json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkPermission(MENU, 'delete');
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
  if (id === 'admin') {
    return NextResponse.json({ error: 'Impossible de supprimer le compte admin' }, { status: 400 });
  }
  const before = (await listUsers()).find((u) => u.id === id);
  const ok = await withAudit(
    {
      module: 'settings.utilisateurs',
      action: 'delete',
      entityType: 'auth.user',
      entityId: id,
      summary: `Suppression utilisateur ${before?.displayName || before?.username || id}`,
      getBefore: async () => before ?? null,
      getAfter: () => null,
      path: '/api/auth/users',
      method: 'DELETE',
    },
    () => deleteUser(id),
  );
  if (!ok) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
