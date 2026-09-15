import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionCookieName, getSessionUser, getSessionPermissions } from '@/lib/auth-store';

function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(getSessionCookieName(), '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const user = await getSessionUser(token);
  if (!user) {
    const response = NextResponse.json({ user: null }, { status: 401 });
    clearSessionCookie(response);
    return response;
  }
  const menus = await getSessionPermissions(token);
  return NextResponse.json({ user, menus });
}
