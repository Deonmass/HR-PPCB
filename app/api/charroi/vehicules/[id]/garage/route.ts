import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import {
  envoyerVehiculeAuGarage,
  getVehicule,
  remettreVehiculeEnService,
} from '@/lib/charroi-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const EDIT = [
  { menuId: 'charroi.vehicules', action: 'edit' as const },
  { menuId: 'charroi', action: 'edit' as const },
];

type Params = { params: Promise<{ id: string }> };

function businessError(err: unknown): string | null {
  const message = err instanceof Error ? err.message : '';
  if (/^Date |^La raison |^La date |^Ce véhicule/.test(message)) return message;
  return null;
}

export async function POST(request: Request, { params }: Params) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const { id } = await params;
    if (!id?.trim()) return NextResponse.json({ error: 'ID requis' }, { status: 400 });
    const body = (await request.json()) as {
      action?: string;
      dateEntree?: string;
      dateSortie?: string;
      raison?: string;
    };
    const before = await getVehicule(id.trim());
    if (!before) return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });

    const action = String(body.action || '').trim();
    if (action !== 'entree' && action !== 'sortie') {
      return NextResponse.json({ error: 'Action garage invalide' }, { status: 400 });
    }

    const item = await withAudit(
      {
        module: 'charroi.vehicules',
        action: 'update',
        entityType: 'charroi.vehicule',
        entityId: id.trim(),
        summary: action === 'entree'
          ? `Envoi au garage ${before.plaque || before.marque || id.trim()}`
          : `Remise en service ${before.plaque || before.marque || id.trim()}`,
        path: `/api/charroi/vehicules/${id}/garage`,
        method: 'POST',
        defer: true,
        getBefore: async () => before,
      },
      () => (
        action === 'entree'
          ? envoyerVehiculeAuGarage(id.trim(), {
            dateEntree: String(body.dateEntree || ''),
            raison: String(body.raison || ''),
          })
          : remettreVehiculeEnService(id.trim(), {
            dateSortie: String(body.dateSortie || ''),
          })
      ),
    );
    if (!item) return NextResponse.json({ error: 'Véhicule introuvable' }, { status: 404 });
    return NextResponse.json(item);
  } catch (err) {
    const message = businessError(err);
    if (message) return NextResponse.json({ error: message }, { status: 400 });
    const mapped = excelErrorResponse(err);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
