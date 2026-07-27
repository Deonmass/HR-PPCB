import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession, getSessionCookieName } from '@/lib/auth-store';
import { buildHomeDashboard } from '@/lib/home-dashboard-store';

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  const session = await getSession(token);
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  try {
    const dashboard = await buildHomeDashboard(session.menus);
    return NextResponse.json(dashboard);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
