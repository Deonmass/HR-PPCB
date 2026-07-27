import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkPermission } from '@/lib/require-permission';
import { previewNextMissionRef } from '@/lib/travel-history-store';

export async function GET() {
  const denied = await checkPermission('travel.etablir', 'view');
  if (denied) return denied;  try {
    const ref = await previewNextMissionRef(new Date());
    return NextResponse.json({ ref });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
