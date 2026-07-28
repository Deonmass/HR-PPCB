import { NextResponse } from 'next/server';
import {
  buildGuestHouseExportFilename,
  buildGuestHouseTemplateExportBuffer,
  resolveGuestHouseExportMonth,
} from '@/lib/guest-house-export.server';
import { getGuestHouseBundle } from '@/lib/guest-house-store';
import { checkPermission } from '@/lib/require-permission';

export async function GET(request: Request) {
  const denied = await checkPermission('village.guest-house', 'export');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const monthParam = url.searchParams.get('month');
    const { key } = resolveGuestHouseExportMonth(monthParam);
    const data = await getGuestHouseBundle();
    const { buffer, monthKey } = await buildGuestHouseTemplateExportBuffer(data, key);
    const filename = buildGuestHouseExportFilename(monthKey);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Export impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
