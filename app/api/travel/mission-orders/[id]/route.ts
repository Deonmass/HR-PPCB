import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import {
  deleteMissionOrderHistoryRow,
  getMissionOrderHistoryRow,
} from '@/lib/mission-order-history-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { getMissionSite } from '@/lib/travel-mission-sites';
import { withAudit } from '@/lib/with-audit';

interface Props {
  params: Promise<{ id: string }>;
}

export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params;
  if (!id?.trim()) {
    return NextResponse.json({ error: 'Identifiant manquant' }, { status: 400 });
  }

  try {
    const row = await getMissionOrderHistoryRow(id);
    if (!row) {
      return NextResponse.json({ error: 'Ligne introuvable' }, { status: 404 });
    }

    const denied = await checkAnyPermission([
      { menuId: 'travel.etablir', action: 'delete' },
      { menuId: getMissionSite(row.site).menuId, action: 'delete' },
    ]);
    if (denied) return denied;

    const removed = await withAudit(
      {
        module: getMissionSite(row.site).menuId,
        action: 'delete',
        entityType: 'travel.mission-order',
        entityId: id,
        summary: `Suppression ordre de mission ${row.missionRef || id}`,
        details: `Ordre de mission ${row.missionRef || id} (${row.employeeName || '—'}) supprimé.`,
        undoable: false,
        path: `/api/travel/mission-orders/${id}`,
        method: 'DELETE',
      },
      () => deleteMissionOrderHistoryRow(id),
    );

    return NextResponse.json({ ok: true, row: removed });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
