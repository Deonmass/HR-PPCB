import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { listMissionOrderHistory } from '@/lib/mission-order-history-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { getMissionSite, isMissionSiteId, MISSION_SITES } from '@/lib/travel-mission-sites';

export async function GET(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'view' },
    ...MISSION_SITES.map((site) => ({ menuId: site.menuId, action: 'view' as const })),
  ]);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const siteParam = searchParams.get('site')?.trim() ?? '';

  if (!isMissionSiteId(siteParam)) {
    return NextResponse.json({ error: 'Site d’ordre de mission requis' }, { status: 400 });
  }

  const site = getMissionSite(siteParam);
  const siteDenied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: site.menuId, action: 'view' },
  ]);
  if (siteDenied) return siteDenied;

  try {
    const rows = await listMissionOrderHistory(siteParam);
    return NextResponse.json({ rows });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
