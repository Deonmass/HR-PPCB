import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  deleteAffectationSuggestion,
  readAffectationSuggestions,
  upsertAffectationSuggestion,
} from '@/lib/village-affectation-suggestions';
import { withAudit } from '@/lib/with-audit';

const VIEW = [
  { menuId: 'village.maisons', action: 'view' as const },
  { menuId: 'village.dependants-liste', action: 'view' as const },
];

const EDIT = [
  { menuId: 'village.maisons', action: 'edit' as const },
  { menuId: 'village.maisons', action: 'create' as const },
];

export async function GET(request: Request) {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const numero = searchParams.get('numero') ?? undefined;
    const suggestions = await readAffectationSuggestions(numero || undefined);
    return NextResponse.json({ suggestions });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      id?: string;
      numeroVilla?: string;
      matricule?: string;
      nom?: string;
      commentaire?: string;
    };
    const existing = body.id
      ? (await readAffectationSuggestions()).find((s) => s.id === body.id)
      : undefined;
    const saved = await withAudit(
      {
        module: 'village.assign',
        action: existing ? 'update' : 'create',
        entityType: 'village.suggestion',
        entityId: (result) => (result as { id?: string })?.id,
        summary: (result) => {
          const s = result as { numeroVilla?: string; matricule?: string; id?: string };
          return `${existing ? 'Modification' : 'Création'} suggestion ${s.numeroVilla || s.id}`;
        },
        getBefore: async () => existing ?? null,
        path: '/api/village/suggestions',
        method: 'POST',
      },
      () =>
        upsertAffectationSuggestion({
          id: body.id,
          numeroVilla: body.numeroVilla ?? '',
          matricule: body.matricule ?? '',
          nom: body.nom,
          commentaire: body.commentaire,
        }),
    );
    return NextResponse.json(saved);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id') ?? '';
    const before = (await readAffectationSuggestions()).find((s) => s.id === id);
    const ok = await withAudit(
      {
        module: 'village.assign',
        action: 'delete',
        entityType: 'village.suggestion',
        entityId: id,
        summary: `Suppression suggestion ${id}`,
        getBefore: async () => before ?? null,
        getAfter: () => null,
        path: '/api/village/suggestions',
        method: 'DELETE',
      },
      () => deleteAffectationSuggestion(id),
    );
    if (!ok) return NextResponse.json({ error: 'Suggestion introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
