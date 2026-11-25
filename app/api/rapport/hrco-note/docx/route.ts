import { NextResponse } from 'next/server';
import { buildHrcoNoteDocx } from '@/lib/hrco-note-docx';
import { parseHrcoPeriod } from '@/lib/hrco-note';
import { loadHrcoNote } from '@/lib/hrco-note.server';
import { checkPermission } from '@/lib/require-permission';

const FILE_NAME = 'NOTE PRÉPARATOIRE DU COMITÉ DES RESSOURCES HUMAINES DU 26.docx';

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
    const buffer = await buildHrcoNoteDocx(note);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="note-preparatoire-comite-rh-26.docx"; filename*=UTF-8''${encodeURIComponent(FILE_NAME)}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de génération';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
