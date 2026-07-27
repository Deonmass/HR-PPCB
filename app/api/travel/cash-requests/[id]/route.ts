import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { getCashRequest } from '@/lib/cash-request-store';
import { checkPermission } from '@/lib/require-permission';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await checkPermission('travel.historique', 'view');
  if (denied) return denied;  try {
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
