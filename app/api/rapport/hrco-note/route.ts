import { NextResponse } from 'next/server';
import { parseHrcoPeriod } from '@/lib/hrco-note';
import { loadHrcoNote } from '@/lib/hrco-note.server';
import { checkPermission } from '@/lib/require-permission';

export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const note = await loadHrcoNote(parseHrcoPeriod({
      year: url.searchParams.get('year'),
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
    }));
    return NextResponse.json(note);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
