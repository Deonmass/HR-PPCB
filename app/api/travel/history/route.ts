import { NextResponse } from 'next/server';
import { deleteCashRequestByMissionRef, getCashRequestByMissionRef } from '@/lib/cash-request-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';
import type { TravelHistoryRow } from '@/lib/travel-history-types';
import { deleteTravelHistoryRow, readTravelHistory } from '@/lib/travel-history-store';
import { withAudit } from '@/lib/with-audit';

export async function GET() {
  const denied = await checkPermission('travel.historique', 'view');
  if (denied) return denied;
  try {
    const data = await readTravelHistory();
    return NextResponse.json(data);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const denied = await checkPermission('travel.historique', 'delete');
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const ref = searchParams.get('ref')?.trim();
    const rowIndexRaw = searchParams.get('rowIndex')?.trim();

    if (!ref) {
      return NextResponse.json({ error: 'Référence mission requise' }, { status: 400 });
    }

    const rowIndex = rowIndexRaw ? Number.parseInt(rowIndexRaw, 10) : Number.NaN;
    if (!Number.isInteger(rowIndex) || rowIndex < 0) {
      return NextResponse.json({ error: 'Index de ligne invalide' }, { status: 400 });
    }

    const cashRequest = await getCashRequestByMissionRef(ref);

    await withAudit(
      {
        module: 'travel.historique',
        action: 'delete',
        entityType: 'travel.history',
        entityId: ref,
        summary: `Suppression historique voyage ${ref}`,
        details: (_result, before) => {
          const row = before as TravelHistoryRow | undefined;
          const employee = row?.employee?.trim() || 'employé inconnu';
          const cashPart = cashRequest
            ? ` Demande de caisse liée (${cashRequest.id}) également supprimée.`
            : '';
          return `Ligne historique « ${ref} » (${employee}) supprimée.${cashPart}`;
        },
        getBefore: async () => {
          const data = await readTravelHistory();
          return (
            data.rows.find((row) => row.rowIndex === rowIndex && row.ref === ref)
            ?? data.rows.find((row) => row.rowIndex === rowIndex)
            ?? data.rows.find((row) => row.ref === ref)
            ?? null
          );
        },
        getAfter: () => null,
        meta: {
          rowIndex,
          missionRef: ref,
          cashRequestId: cashRequest?.id,
          cashRequestDeleted: Boolean(cashRequest),
        },
        path: '/api/travel/history',
        method: 'DELETE',
        logErrors: true,
      },
      async () => {
        await deleteTravelHistoryRow(rowIndex, ref);
        await deleteCashRequestByMissionRef(ref);
        return { ok: true as const };
      },
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
