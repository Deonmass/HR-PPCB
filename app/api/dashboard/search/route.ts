import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, getSessionCookieName } from '@/lib/auth-store';
import { searchHome } from '@/lib/home-dashboard-search';

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q') || '';
  if (q.trim().length < 1) {
    return NextResponse.json({ query: q, results: [] });
  }

  try {
    const payload = await searchHome(session.menus, q, 24);
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Recherche impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
