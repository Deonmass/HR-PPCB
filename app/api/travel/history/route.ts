import { NextResponse } from 'next/server';
import { deleteCashRequestByMissionRef } from '@/lib/cash-request-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';
import { deleteTravelHistoryRow, readTravelHistory } from '@/lib/travel-history-store';

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

    await deleteTravelHistoryRow(rowIndex, ref);
    await deleteCashRequestByMissionRef(ref);

    return NextResponse.json({ ok: true });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
