import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { deleteCashRequestById, getCashRequest } from '@/lib/cash-request-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { deleteTravelHistoryRow, readTravelHistory } from '@/lib/travel-history-store';
import { withAudit } from '@/lib/with-audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.historique', action: 'view' },
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: 'travel.etablir', action: 'edit' },
  ]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const record = await getCashRequest(id);
    if (!record) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'delete' },
    { menuId: 'travel.historique', action: 'delete' },
  ]);
  if (denied) return denied;
  try {
    const { id } = await params;
    const record = await getCashRequest(id);
    if (!record) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }

    await withAudit(
      {
        module: 'travel.etablir',
        action: 'delete',
        entityType: 'travel.cash-request',
        entityId: id,
        summary: `Suppression document voyage ${record.missionRef || id}`,
        details: () =>
          `Document « ${record.fileName} » (${record.employeeName}) supprimé${record.missionRef ? ` — mission ${record.missionRef}` : ''}.`,
        getBefore: async () => record,
        getAfter: () => null,
        path: `/api/travel/cash-requests/${id}`,
        method: 'DELETE',
        logErrors: true,
      },
      async () => {
        await deleteCashRequestById(id);

        // Supprime aussi la ligne liée dans l'historique des missions (non bloquant).
        if (record.missionRef) {
          try {
            const history = await readTravelHistory();
            const row = history.rows.find(
              (item) => item.recordId === id || item.ref === record.missionRef,
            );
            if (row) await deleteTravelHistoryRow(row.rowIndex, row.ref);
          } catch {
            // La ligne d'historique peut déjà avoir été supprimée.
          }
        }
        return { ok: true as const };
      },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
