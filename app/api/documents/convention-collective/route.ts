import fs from 'fs/promises';
import { NextResponse } from 'next/server';
import {
  CONVENTION_ARTICLES,
  searchConventionArticles,
} from '@/lib/convention-collective-index';
import {
  deleteConventionNote,
  listConventionNotes,
  resolveConventionPdfPath,
  upsertConventionNote,
} from '@/lib/convention-collective-store';
import { checkPermission } from '@/lib/require-permission';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';

export async function GET(request: Request) {
  const denied = await checkPermission('documents.convention-collective', 'view');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get('mode') || 'search';

  if (mode === 'pdf') {
    try {
      const filePath = resolveConventionPdfPath();
      const buffer = await fs.readFile(filePath);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="convention-collective.pdf"',
          'Cache-Control': 'private, max-age=3600',
        },
      });
    } catch {
      return NextResponse.json({ error: 'PDF introuvable' }, { status: 404 });
    }
  }

  if (mode === 'notes') {
    try {
      const notes = await listConventionNotes();
      return NextResponse.json({ notes });
    } catch (err) {
      console.error('[convention-collective] notes', err);
      return NextResponse.json({ notes: [], warning: 'Notes indisponibles' });
    }
  }

  if (mode === 'articles') {
    return NextResponse.json({ articles: CONVENTION_ARTICLES });
  }

  // Recherche : index local (ne dépend pas du store notes).
  const q = searchParams.get('q') || '';
  const hits = searchConventionArticles(q);
  let notes: Awaited<ReturnType<typeof listConventionNotes>> = [];
  try {
    notes = await listConventionNotes();
  } catch (err) {
    console.error('[convention-collective] notes during search', err);
  }
  const qNorm = q.trim().toLowerCase();
  const noteHits = !qNorm
    ? notes
    : notes.filter((n) =>
      [n.title, n.summary, n.body, ...(n.tags || [])]
        .join(' ')
        .toLowerCase()
        .includes(qNorm));

  return NextResponse.json({
    hits,
    notes: noteHits,
    query: q,
  });
}

export async function POST(request: Request) {
  const denied = await checkPermission('documents.convention-collective', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      id?: string;
      title?: string;
      summary?: string;
      body?: string;
      tags?: string[];
    };
    const actor = await getAuditActor();
    const note = await upsertConventionNote({
      id: body.id,
      title: String(body.title || ''),
      summary: String(body.summary || ''),
      body: String(body.body || ''),
      tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
      createdBy: actor?.userName,
    });
    await auditSimpleAction({
      module: 'documents.convention-collective',
      moduleLabel: 'Convention collective',
      action: 'other',
      summary: `Résumé convention — ${note.title}`,
    });
    return NextResponse.json(note);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkPermission('documents.convention-collective', 'delete');
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
  const ok = await deleteConventionNote(id);
  if (!ok) return NextResponse.json({ error: 'Introuvable' }, { status: 404 });
  await auditSimpleAction({
    module: 'documents.convention-collective',
    moduleLabel: 'Convention collective',
    action: 'other',
    summary: `Suppression résumé convention — ${id}`,
  });
  return NextResponse.json({ ok: true });
}
