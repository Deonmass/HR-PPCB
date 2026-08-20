import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { previewNextMissionRef } from '@/lib/mission-order-history-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { isMissionSiteId, MISSION_SITES } from '@/lib/travel-mission-sites';

function siteViewEntries() {
  return [
    { menuId: 'travel.etablir' as const, action: 'view' as const },
    ...MISSION_SITES.map((site) => ({ menuId: site.menuId, action: 'view' as const })),
  ];
}

export async function GET(request: Request) {
  const denied = await checkAnyPermission(siteViewEntries());
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const siteParam = searchParams.get('site')?.trim() ?? '';
  const dateParam = searchParams.get('date')?.trim() ?? '';

  if (!isMissionSiteId(siteParam)) {
    return NextResponse.json({ error: 'Site d’ordre de mission requis' }, { status: 400 });
  }

  const siteDenied = await checkAnyPermission([
    { menuId: 'travel.etablir', action: 'view' },
    { menuId: MISSION_SITES.find((site) => site.id === siteParam)!.menuId, action: 'view' },
  ]);
  if (siteDenied) return siteDenied;

  try {
    const parsed = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
    const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    const ref = await previewNextMissionRef(siteParam, date);
    return NextResponse.json({ ref, site: siteParam });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
