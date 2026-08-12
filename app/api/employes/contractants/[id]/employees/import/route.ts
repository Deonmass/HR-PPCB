import { NextResponse } from 'next/server';
import { parseContractantEmployeesImportBuffer } from '@/lib/contractants-import';
import { getContractant, replaceContractantEmployees } from '@/lib/contractants-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { logAuditError } from '@/lib/audit-log-store';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';

interface Ctx {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: Ctx) {
  const denied = await checkAnyPermission([
    { menuId: 'employes.contractants', action: 'edit' },
    { menuId: 'employes.contractants', action: 'create' },
    { menuId: 'employes.liste', action: 'edit' },
    { menuId: 'employes.liste', action: 'create' },
  ]);
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const existing = await getContractant(id);
    if (!existing) {
      return NextResponse.json({ error: 'Contractant introuvable' }, { status: 404 });
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Fichier Excel requis' }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Format invalide — utilisez un fichier Excel (.xlsx / .xls)' },
        { status: 400 },
      );
    }

    const buffer = await file.arrayBuffer();
    const parsed = parseContractantEmployeesImportBuffer(buffer);
    const result = await replaceContractantEmployees(id, parsed.rows);
    if (!result) {
      return NextResponse.json({ error: 'Contractant introuvable' }, { status: 404 });
    }

    await auditSimpleAction({
      module: 'contractants',
      action: 'import',
      summary: `Import employés « ${existing.denomination} » — ${result.imported} ligne(s)`,
      details: `Feuille « ${parsed.sheetName} », ${parsed.skipped} ignorée(s)`,
      meta: {
        contractantId: id,
        imported: result.imported,
        skipped: parsed.skipped,
        sheetName: parsed.sheetName,
        fileName: file.name,
      },
    });

    return NextResponse.json({
      imported: result.imported,
      skipped: parsed.skipped,
      sheetName: parsed.sheetName,
      contractant: result.contractant,
    });
  } catch (err) {
    const actor = await getAuditActor();
    const message = err instanceof Error ? err.message : 'Erreur import';
    await logAuditError({
      message,
      details: `Échec import employés contractant : ${message}`,
      module: 'contractants',
      path: '/api/employes/contractants/[id]/employees/import',
      method: 'POST',
      stack: err instanceof Error ? err.stack : undefined,
      user: actor,
    });
    const status = /introuvable|vide|en-tête|colonne|format|valide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
