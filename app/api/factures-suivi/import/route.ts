import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { parseFacturesSuiviImportBuffer } from '@/lib/factures-fournisseurs/import';
import { importFacturesSuiviRows } from '@/lib/factures-fournisseurs/store';
import { checkPermission } from '@/lib/require-permission';

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
    const result = await importFacturesSuiviRows(parsed.rows);

    return NextResponse.json({
      ...result,
      sheetName: parsed.sheetName,
      totalRows: parsed.rows.length,
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
