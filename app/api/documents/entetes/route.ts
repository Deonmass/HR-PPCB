import { NextResponse } from 'next/server';
import {
  DOCX_MIME,
  listLetterheadStatuses,
  readLetterheadBuffer,
  replaceLetterheadFile,
} from '@/lib/letterheads';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'documents.entetes';

const VIEW_ANY = [
  { menuId: MENU, action: 'view' as const },
  { menuId: MENU, action: 'export' as const },
  { menuId: 'documents.exit', action: 'view' as const },
  { menuId: 'travel.historique', action: 'view' as const },
];

/** Liste (sans query) ou téléchargement (?id=). */
export async function GET(request: Request) {
  const denied = await checkAnyPermission(VIEW_ANY);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json(await listLetterheadStatuses());
  }

  const result = await readLetterheadBuffer(id);
  if (!result) {
    return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
  }
  const { template, buffer } = result;
  const safeName = template.downloadName.replace(/"/g, '');
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': DOCX_MIME,
      'Content-Disposition': `attachment; filename="${safeName}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'no-store',
    },
  });
}

/** Remplacement du fichier (multipart: id + file). */
export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data requis' }, { status: 400 });
    }
    const form = await request.formData();
    const id = String(form.get('id') || '').trim();
    const file = form.get('file');
    if (!id) return NextResponse.json({ error: 'id requis' }, { status: 400 });
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier .docx requis' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      return NextResponse.json({ error: 'Seuls les fichiers .docx sont acceptés' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    const status = await withAudit(
      {
        module: MENU,
        action: 'update',
        entityType: 'letterhead',
        entityId: id,
        summary: `Remplacement en-tête ${id}`,
        details: () => `Fichier remplacé : ${file.name} (${buffer.length} octets)`,
        path: '/api/documents/entetes',
        method: 'PUT',
      },
      () => replaceLetterheadFile(id, buffer),
    );

    return NextResponse.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Remplacement impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
