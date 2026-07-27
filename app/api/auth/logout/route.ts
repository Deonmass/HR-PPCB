import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { destroySession, getSessionCookieName } from '@/lib/auth-store';

const LOGOUT_BUDGET_MS = 3500;

function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(getSessionCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;

  if (token) {
    // Ne pas bloquer le logout si l’écriture sessions.json est lente.
    await Promise.race([
      destroySession(token).catch(() => undefined),
      new Promise<void>((resolve) => setTimeout(resolve, LOGOUT_BUDGET_MS)),
    ]);
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
