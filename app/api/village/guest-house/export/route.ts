import { NextResponse } from 'next/server';
import {
  buildGuestHouseExportFilename,
  buildGuestHouseVillageExportBuffer,
} from '@/lib/guest-house-export.server';
import { getGuestHouseBundle } from '@/lib/guest-house-store';
import { checkPermission } from '@/lib/require-permission';

export async function GET() {
  const denied = await checkPermission('village.guest-house', 'export');
  if (denied) return denied;

  try {
    const data = await getGuestHouseBundle();
    const buffer = await buildGuestHouseVillageExportBuffer(data);
    const filename = buildGuestHouseExportFilename();
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
