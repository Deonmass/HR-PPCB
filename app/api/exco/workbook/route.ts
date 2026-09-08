import { NextResponse } from 'next/server';
import { loadBundledExcoWorkbook } from '@/lib/exco-bundled-source';
import { checkPermission } from '@/lib/require-permission';

/** Charge New report du mois (sources/YYYY-MM) + extraction PPTX. */
export async function GET(request: Request) {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const year = Number(url.searchParams.get('year'));
    const month = Number(url.searchParams.get('month'));
    const light = url.searchParams.get('light') === '1';
    const period =
      Number.isInteger(year) && year >= 2000 && year <= 2100
      && Number.isInteger(month) && month >= 1 && month <= 12
        ? { year, month }
        : undefined;
    const payload = await loadBundledExcoWorkbook(period, { light });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chargement impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
