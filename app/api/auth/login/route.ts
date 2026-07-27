import { NextResponse } from 'next/server';
import {
  authenticateUser,
  createSession,
  getSessionCookieName,
} from '@/lib/auth-store';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: string; password?: string };
    const auth = await authenticateUser(body.username ?? '', body.password ?? '');
    if (!auth) {
      return NextResponse.json({ error: 'Identifiants invalides' }, { status: 401 });
    }

    const session = await createSession(auth.user, auth.menus);
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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
