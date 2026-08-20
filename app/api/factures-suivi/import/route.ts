import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { parseFacturesSuiviImportBuffer } from '@/lib/factures-fournisseurs/import';
import { importFacturesSuiviRows } from '@/lib/factures-fournisseurs/store';
import { checkPermission } from '@/lib/require-permission';
import { logAuditError } from '@/lib/audit-log-store';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';

const MENU = 'factures.fournisseur.factures';

export async function POST(request: Request) {
  const denied = await checkPermission(MENU, 'create');
  if (denied) return denied;

  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier Excel requis' }, { status: 400 });
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseFacturesSuiviImportBuffer(buffer);
    const result = await importFacturesSuiviRows(parsed.rows, {
      sourceRowCount: parsed.sourceRowCount,
      invalidRows: parsed.invalidRows,
    });

    await auditSimpleAction({
      module: 'factures-suivi',
      action: 'import',
      summary: `Import factures — ${result.imported} importée(s), ${result.skipped} ignorée(s) sur ${result.sourceRowCount}`,
      details: `Feuille « ${parsed.sheetName} », ${result.sourceRowCount} ligne(s) source, ${result.uniqueRowCount} ligne(s) unique(s)`,
      meta: {
        imported: result.imported,
        skipped: result.skipped,
        sourceRowCount: result.sourceRowCount,
        uniqueRowCount: result.uniqueRowCount,
        sheetName: parsed.sheetName,
        fileName: file.name,
      },
    });

    return NextResponse.json({
      ...result,
      sheetName: parsed.sheetName,
      totalRows: result.sourceRowCount,
    });
  } catch (err) {
    const actor = await getAuditActor();
    const message = err instanceof Error ? err.message : 'Erreur import';
    await logAuditError({
      message,
      details: `Échec import factures : ${message}`,
      module: 'factures-suivi',
      path: '/api/factures-suivi/import',
      method: 'POST',
      stack: err instanceof Error ? err.stack : undefined,
      user: actor,
    });
    const { status } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
