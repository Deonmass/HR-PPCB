import { NextResponse } from 'next/server';
import {
  deleteUser,
  listUsers,
  upsertUser,
} from '@/lib/auth-store';
import { checkPermission } from '@/lib/require-permission';
import type { AuthUser } from '@/lib/auth-types';

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
    const user = await upsertUser({
      id: body.id?.trim() || username,
      username,
      displayName: body.displayName ?? '',
      initials: body.initials ?? '',
      email: body.email,
      matricule: body.matricule,
      active: body.active ?? true,
      password: body.password,
    });
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
    const user = await upsertUser({
      id: body.id,
      username: body.username ?? '',
      displayName: body.displayName ?? '',
      initials: body.initials ?? '',
      email: body.email,
      matricule: body.matricule,
      active: body.active ?? true,
      password: body.password,
    });
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
  const ok = await deleteUser(id);
  if (!ok) return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
