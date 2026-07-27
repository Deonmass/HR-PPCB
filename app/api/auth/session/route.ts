import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSessionCookieName, getSessionUser, getSessionPermissions } from '@/lib/auth-store';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const user = await getSessionUser(token);
  if (!user) {
    return NextResponse.json({ user: null }, { status: 401 });
  }
  const menus = await getSessionPermissions(token);
  return NextResponse.json({ user, menus });
}
