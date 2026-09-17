import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { parseTraineeCostWorkbook } from '@/lib/training-import';
import { mergeTrainingCostEntries, buildTrainingDashboard } from '@/lib/training-store';
import { auditSimpleAction } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'training', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseTraineeCostWorkbook(buffer);
    const { store, added, updated } = await mergeTrainingCostEntries(rows, file.name);
    const dash = buildTrainingDashboard(store);

    await auditSimpleAction({
      module: 'training',
      action: 'import',
      summary: `Import coûts formation (${file.name}) — +${added} / ~${updated}`,
    });

    return NextResponse.json({
      ok: true,
      added,
      updated,
      rows: rows.length,
      dashboard: dash,
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
