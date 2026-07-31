import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  changeUserPassword,
  getSession,
  getSessionCookieName,
} from '@/lib/auth-store';
import { passwordPolicyError } from '@/lib/password-policy';
import { withAudit } from '@/lib/with-audit';

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await getSession(token);
  if (!session?.user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      oldPassword?: string;
      newPassword?: string;
      confirmPassword?: string;
    };
    const oldPassword = body.oldPassword ?? '';
    const newPassword = body.newPassword ?? '';

    if (!oldPassword) {
      return NextResponse.json({ error: 'Ancien mot de passe requis' }, { status: 400 });
    }
    if (body.confirmPassword !== undefined && body.confirmPassword !== newPassword) {
      return NextResponse.json({ error: 'La confirmation ne correspond pas' }, { status: 400 });
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }

    const user = session.user;
    await withAudit(
      {
        module: 'settings.utilisateurs',
        moduleLabel: 'Utilisateurs',
        action: 'update',
        actionLabel: 'Mot de passe',
        entityType: 'auth.password',
        entityId: user.id,
        summary: `Changement de mot de passe — ${user.displayName || user.username}`,
        // Ne jamais consigner les mots de passe dans les logs.
        getBefore: async () => null,
        getAfter: () => null,
        undoable: false,
        path: '/api/auth/change-password',
        method: 'POST',
      },
      () => changeUserPassword(user.id, oldPassword, newPassword),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
