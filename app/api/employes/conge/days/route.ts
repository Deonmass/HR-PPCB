import { NextResponse } from 'next/server';
import { getCongeBundle, patchCongeDays } from '@/lib/conge-store';
import type { CongeDayPatch } from '@/lib/conge-types';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

const MENU = 'employes.conge';

export async function PATCH(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;

  try {
    const body = (await request.json()) as { patches?: CongeDayPatch[] };
    const patches = Array.isArray(body.patches) ? body.patches : [];
    await withAudit(
      {
        module: MENU,
        action: 'update',
        entityType: 'conge-day',
        entityId: patches[0]?.matricule || '—',
        summary:
          patches.length === 1
            ? `Code congé ${patches[0].matricule} ${patches[0].iso} → ${patches[0].code || 'IN'}`
            : `Mise à jour ${patches.length} jour(s) de congé`,
        path: '/api/employes/conge/days',
        method: 'PATCH',
      },
      () => patchCongeDays(patches),
    );
    const bundle = await getCongeBundle();
    return NextResponse.json({ bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /requis|invalide|introuvable|Dimanche|embauche/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
