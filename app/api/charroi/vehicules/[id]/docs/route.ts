import { NextResponse } from 'next/server';
import {
  addVehiculeDocPaiement,
  deleteVehiculeDocPaiement,
  getVehicule,
  updateVehiculeDocPaiement,
} from '@/lib/charroi-store';
import type { CharroiDocKind } from '@/lib/charroi-types';
import { CHARROI_DOC_KINDS, CHARROI_DOC_LABELS } from '@/lib/charroi-types';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const EDIT = [
  { menuId: 'charroi.vehicules', action: 'edit' as const },
  { menuId: 'charroi', action: 'edit' as const },
];

type Params = { params: Promise<{ id: string }> };

function isDocKind(value: unknown): value is CharroiDocKind {
  return typeof value === 'string' && (CHARROI_DOC_KINDS as string[]).includes(value);
}

type DocBody = {
  kind?: unknown;
  entryId?: unknown;
  dateDebut?: unknown;
  dateFin?: unknown;
  preuveUrl?: unknown;
  urlPreuve?: unknown;
};

function parseBody(raw: unknown): DocBody {
  return (raw && typeof raw === 'object' ? raw : {}) as DocBody;
}

function preuveOf(body: DocBody): string {
  return String(body.preuveUrl ?? body.urlPreuve ?? '');
}

/** Ajoute une période assurance / vignette / contrôle technique. */
export async function POST(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const body = parseBody(await request.json());
    if (!isDocKind(body.kind)) {
      return NextResponse.json(
        { error: 'Type de document requis (assurance, vignette, controleTechnique)' },
        { status: 400 },
      );
    }
    const kind = body.kind;
    const before = await getVehicule(id.trim());
    if (!before) return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });

    const item = await withAudit(
      {
        module: 'charroi.vehicules',
        action: 'update',
        entityType: 'charroi.vehicule.doc',
        entityId: id.trim(),
        summary: `Ajout ${CHARROI_DOC_LABELS[kind]} — ${before.plaque || before.marque || id.trim()}`,
        details: (_r, b, after) =>
          `Période ${CHARROI_DOC_LABELS[kind]} ajoutée.\nAvant : ${JSON.stringify(b)}\nAprès : ${JSON.stringify(after)}`,
        getBefore: async () => before,
        path: `/api/charroi/vehicules/${id}/docs`,
        method: 'POST',
      },
      () =>
        addVehiculeDocPaiement(id.trim(), kind, {
          dateDebut: String(body.dateDebut ?? ''),
          dateFin: String(body.dateFin ?? ''),
          preuveUrl: preuveOf(body),
        }),
    );
    return NextResponse.json(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Met à jour une période existante. */
export async function PATCH(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const body = parseBody(await request.json());
    if (!isDocKind(body.kind)) {
      return NextResponse.json({ error: 'Type de document requis' }, { status: 400 });
    }
    const entryId = String(body.entryId ?? '').trim();
    if (!entryId) return NextResponse.json({ error: 'entryId requis' }, { status: 400 });

    const kind = body.kind;
    const before = await getVehicule(id.trim());
    if (!before) return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });

    const item = await withAudit(
      {
        module: 'charroi.vehicules',
        action: 'update',
        entityType: 'charroi.vehicule.doc',
        entityId: id.trim(),
        summary: `Modification ${CHARROI_DOC_LABELS[kind]} — ${before.plaque || before.marque || id.trim()}`,
        details: (_r, b, after) =>
          `Période ${CHARROI_DOC_LABELS[kind]} modifiée (${entryId}).\nAvant : ${JSON.stringify(b)}\nAprès : ${JSON.stringify(after)}`,
        getBefore: async () => before,
        path: `/api/charroi/vehicules/${id}/docs`,
        method: 'PATCH',
      },
      () =>
        updateVehiculeDocPaiement(id.trim(), kind, entryId, {
          dateDebut: String(body.dateDebut ?? ''),
          dateFin: String(body.dateFin ?? ''),
          preuveUrl: preuveOf(body),
        }),
    );
    return NextResponse.json(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/** Supprime une période (body: { kind, entryId }). */
export async function DELETE(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const body = parseBody(await request.json().catch(() => ({})));
    if (!isDocKind(body.kind)) {
      return NextResponse.json({ error: 'Type de document requis' }, { status: 400 });
    }
    const entryId = String(body.entryId ?? '').trim();
    if (!entryId) return NextResponse.json({ error: 'entryId requis' }, { status: 400 });

    const kind = body.kind;
    const before = await getVehicule(id.trim());
    if (!before) return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });

    const item = await withAudit(
      {
        module: 'charroi.vehicules',
        action: 'update',
        entityType: 'charroi.vehicule.doc',
        entityId: id.trim(),
        summary: `Suppression ${CHARROI_DOC_LABELS[kind]} — ${before.plaque || before.marque || id.trim()}`,
        details: (_r, b, after) =>
          `Période ${CHARROI_DOC_LABELS[kind]} supprimée (${entryId}).\nAvant : ${JSON.stringify(b)}\nAprès : ${JSON.stringify(after)}`,
        getBefore: async () => before,
        path: `/api/charroi/vehicules/${id}/docs`,
        method: 'DELETE',
      },
      () => deleteVehiculeDocPaiement(id.trim(), kind, entryId),
    );
    return NextResponse.json(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
