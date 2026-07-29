import { NextResponse } from 'next/server';
import {
  getWorkVisaDossier,
  setWorkVisaDossierStatus,
  updateWorkVisaDossier,
} from '@/lib/work-visa-store';
import type { WorkVisaDossierInput, WorkVisaDossierStatus } from '@/lib/work-visa-types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'protocol.visa-travail';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const denied = await checkPermission(MENU, 'view');
  if (denied) return denied;
  const { id } = await ctx.params;
  const dossier = await getWorkVisaDossier(id);
  if (!dossier) return NextResponse.json({ error: 'Dossier introuvable' }, { status: 404 });
  return NextResponse.json(dossier);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Partial<WorkVisaDossierInput> & {
      statusOnly?: boolean;
    };

    if (body.statusOnly && body.status) {
      const dossier = await withAudit(
        {
          module: 'protocol.visa-travail',
          action: 'update',
          entityType: 'work-visa.dossier',
          entityId: id,
          summary: `Statut dossier visa → ${body.status}`,
          getBefore: () => getWorkVisaDossier(id),
          path: `/api/protocol/work-visas/${id}`,
          method: 'PATCH',
        },
        () => setWorkVisaDossierStatus(id, body.status as WorkVisaDossierStatus),
      );
      return NextResponse.json(dossier);
    }

    const dossier = await withAudit(
      {
        module: 'protocol.visa-travail',
        action: 'update',
        entityType: 'work-visa.dossier',
        entityId: id,
        summary: (result) => {
          const d = result as { matricule?: string; nom?: string };
          return `Modification dossier visa ${d.matricule || ''} — ${d.nom || ''}`;
        },
        getBefore: () => getWorkVisaDossier(id),
        path: `/api/protocol/work-visas/${id}`,
        method: 'PATCH',
      },
      () => updateWorkVisaDossier(id, body),
    );
    return NextResponse.json(dossier);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = message.includes('introuvable') ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
