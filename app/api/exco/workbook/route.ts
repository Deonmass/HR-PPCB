import { NextResponse } from 'next/server';
import { loadBundledExcoWorkbook } from '@/lib/exco-bundled-source';
import { checkPermission } from '@/lib/require-permission';

/** Charge automatiquement New report.xlsx (bundlé) + extraction PPTX. */
export async function GET() {
  const denied = await checkPermission('exco.rapport', 'view');
  if (denied) return denied;

  try {
    const payload = await loadBundledExcoWorkbook();
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Chargement impossible';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
