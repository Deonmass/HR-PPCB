import { NextResponse } from 'next/server';
import { listUsers, resetUserPassword } from '@/lib/auth-store';
import { checkPermission } from '@/lib/require-permission';
import { passwordPolicyError } from '@/lib/password-policy';
import { withAudit } from '@/lib/with-audit';

const MENU = 'settings.utilisateurs.reset';

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;

  try {
    const body = (await request.json()) as { userId?: string; newPassword?: string };
    const userId = body.userId?.trim();
    const newPassword = body.newPassword ?? '';

    if (!userId) {
      return NextResponse.json({ error: 'Utilisateur requis' }, { status: 400 });
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 400 });
    }

    const target = (await listUsers()).find((user) => user.id === userId);
    if (!target) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    await withAudit(
      {
        module: 'settings.utilisateurs',
        moduleLabel: 'Utilisateurs',
        action: 'update',
        actionLabel: 'Reset mot de passe',
        entityType: 'auth.password',
        entityId: target.id,
        summary: `Réinitialisation du mot de passe — ${target.displayName || target.username}`,
        // Ne jamais consigner les mots de passe dans les logs.
        getBefore: async () => null,
        getAfter: () => null,
        undoable: false,
        path: '/api/auth/users/reset-password',
        method: 'POST',
      },
      () => resetUserPassword(target.id, newPassword),
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
