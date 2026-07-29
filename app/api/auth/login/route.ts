import { NextResponse } from 'next/server';
import {
  authenticateUser,
  createSession,
  getSessionCookieName,
} from '@/lib/auth-store';
import { logAuditError } from '@/lib/audit-log-store';
import { actorFromSessionUser } from '@/lib/with-audit';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const auth = await authenticateUser(body.username ?? '', body.password ?? '');
    if (!auth) {
      await logAuditError({
        message: 'Identifiants invalides',
        details: `Échec de connexion pour « ${body.username?.trim() || '—'} »`,
        module: 'auth',
        path: '/api/auth/login',
        method: 'POST',
        status: 401,
        context: { username: body.username?.trim() },
      });
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
    }

    const session = await createSession(auth.user, auth.menus);
    const actor = actorFromSessionUser(auth.user);

    const response = NextResponse.json({ user: auth.user, menus: auth.menus });
    response.cookies.set(getSessionCookieName(), session.token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      expires: new Date(session.expiresAt),
    });
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de connexion';
    await logAuditError({
      message,
      details: `Erreur login: ${message}`,
      module: 'auth',
      path: '/api/auth/login',
      method: 'POST',
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
