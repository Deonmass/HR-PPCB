import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { parseSickLeaveWorkbook } from '@/lib/sick-leave-import';
import { mergeSickLeaveBalances } from '@/lib/sick-leave-store';
import { buildSickLeaveDashboard } from '@/lib/sick-leave-utils';
import { auditSimpleAction } from '@/lib/with-audit';

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'sante.conge-maladie', action: 'edit' },
    { menuId: 'sante.conge-maladie', action: 'create' },
    { menuId: 'sante', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get('file');
    const yearRaw = Number(form.get('year'));
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier manquant' }, { status: 400 });
    }
    const year = Number.isFinite(yearRaw) && yearRaw > 0 ? yearRaw : new Date().getFullYear();
    const buffer = Buffer.from(await file.arrayBuffer());
    const rows = await parseSickLeaveWorkbook(buffer, year, file.name);
    const { store, added, updated } = await mergeSickLeaveBalances(rows);

    await auditSimpleAction({
      module: 'sante.conge-maladie',
      action: 'import',
      summary: `Import leave balance ${year} (${file.name}) — +${added} / ~${updated}`,
    });

    return NextResponse.json({
      ok: true,
      added,
      updated,
      rows: rows.length,
      year,
      dashboard: buildSickLeaveDashboard(store.balances, store.attestations),
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
