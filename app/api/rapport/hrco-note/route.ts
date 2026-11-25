import { NextResponse } from 'next/server';
import { loadHrcoNote } from '@/lib/hrco-note.server';
import { checkPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const note = await loadHrcoNote();
    return NextResponse.json(note);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
