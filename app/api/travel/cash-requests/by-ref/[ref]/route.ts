import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { getCashRequestByMissionRef } from '@/lib/cash-request-store';
import { checkAnyPermission } from '@/lib/require-permission';

type Params = { params: Promise<{ ref: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: 'travel.etablir', action: 'edit' },
    { menuId: 'travel.mission.kinshasa', action: 'view' },
    { menuId: 'travel.mission.zamba', action: 'view' },
    { menuId: 'travel.mission.zamba-consultant', action: 'view' },
    { menuId: 'travel.mission.lubudi', action: 'view' },
  ]);
  if (denied) return denied;  try {
    const { ref } = await params;
    const decodedRef = decodeURIComponent(ref);
    const record = await getCashRequestByMissionRef(decodedRef);
    if (!record) {
      return NextResponse.json({ error: 'Document introuvable' }, { status: 404 });
    }
    return NextResponse.json(record);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
