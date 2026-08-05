import { NextResponse } from 'next/server';
import { buildRrfExcelBuffer, buildRrfPdfBuffer } from '@/lib/rrf-export.server';
import {
  deleteRrfHistory,
  listRrfHistory,
  upsertRrfHistory,
} from '@/lib/rrf-history-store';
import type { RrfFormData } from '@/lib/rrf-types';
import { RRF_EMPTY_FORM } from '@/lib/rrf-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';

const MENU = 'documents.rrf';

const EXPORT_ANY = [
  { menuId: MENU, action: 'view' as const },
  { menuId: MENU, action: 'export' as const },
  { menuId: MENU, action: 'create' as const },
];

function sanitizeForm(body: unknown): RrfFormData {
  const raw = (body && typeof body === 'object' ? body : {}) as Partial<RrfFormData>;
  const benefits = raw.benefits && typeof raw.benefits === 'object' ? raw.benefits : {};
  return {
    ...RRF_EMPTY_FORM,
    ...raw,
    benefits: {
      ...RRF_EMPTY_FORM.benefits,
      ...benefits,
    },
  };
}

function fileBase(form: RrfFormData): string {
  const slug = (form.positionTitle || form.jobTitle || 'rrf')
    .trim()
    .replace(/[^\w\- ]+/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 40) || 'rrf';
  return `RRF-${slug}`;
}

/** GET — historique RRF (1 ligne par dossier, récent en premier). */
export async function GET() {
  const denied = await checkAnyPermission(EXPORT_ANY);
  if (denied) return denied;

  const items = await listRrfHistory();
  return NextResponse.json(
    [...items].sort((a, b) =>
      (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt),
    ),
  );
}

/**
 * POST
 * - { action: 'save', form, historyId? } → 1 ligne upsert (crée ou met à jour)
 * - { format: 'xlsx' | 'pdf', form } → export fichier (ne crée pas de ligne historique)
 */
export async function POST(request: Request) {
  const denied = await checkAnyPermission(EXPORT_ANY);
  if (denied) return denied;

  try {
    const body = (await request.json()) as {
      action?: string;
      format?: string;
      form?: unknown;
      historyId?: string;
      /** Ignoré : les exports ne journalisent plus (1 seule ligne via save). */
      skipHistory?: boolean;
    };
    const form = sanitizeForm(body.form);

    if (!form.positionTitle.trim() && !form.jobTitle.trim()) {
      return NextResponse.json(
        { error: 'Position / job title requis' },
        { status: 400 },
      );
    }

    if (String(body.action || '').toLowerCase() === 'save') {
      const actor = await getAuditActor();
      const fileName = `${fileBase(form)}.json`;
      const entry = await upsertRrfHistory({
        id: body.historyId?.trim() || undefined,
        format: 'saved',
        fileName,
        form,
        issuedBy: actor?.userName,
      });
      await auditSimpleAction({
        module: MENU,
        moduleLabel: 'RRF',
        action: 'other',
        summary: `RRF enregistré — ${form.positionTitle || form.jobTitle}`,
      });
      return NextResponse.json(entry);
    }

    const format = String(body.format || 'xlsx').toLowerCase() === 'pdf' ? 'pdf' : 'xlsx';
    const base = fileBase(form);
    const fileName = `${base}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;

    // Export fichier uniquement — pas d’ajout d’historique (évite 3 lignes save/excel/pdf).
    if (format === 'pdf') {
      const buffer = await buildRrfPdfBuffer(form);
      await auditSimpleAction({
        module: MENU,
        moduleLabel: 'RRF',
        action: 'export',
        summary: `Export PDF RRF — ${form.positionTitle || form.jobTitle}`,
      });
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${fileName}"`,
        },
      });
    }

    const buffer = await buildRrfExcelBuffer(form);
    await auditSimpleAction({
      module: MENU,
      moduleLabel: 'RRF',
      action: 'export',
      summary: `Export Excel RRF — ${form.positionTitle || form.jobTitle}`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export impossible';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** DELETE ?id= — supprime une entrée d’historique. */
export async function DELETE(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'delete' },
    { menuId: MENU, action: 'edit' },
    { menuId: MENU, action: 'create' },
  ]);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id')?.trim();
  if (!id) {
    return NextResponse.json({ error: 'Identifiant requis' }, { status: 400 });
  }

  const removed = await deleteRrfHistory(id);
  if (!removed) {
    return NextResponse.json({ error: 'Entrée introuvable' }, { status: 404 });
  }

  await auditSimpleAction({
    module: MENU,
    moduleLabel: 'RRF',
    action: 'other',
    summary: `Suppression entrée historique RRF — ${id}`,
  });

  return NextResponse.json({ ok: true });
}
