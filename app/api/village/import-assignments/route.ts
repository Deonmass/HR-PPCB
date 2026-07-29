import { NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import { checkAnyPermission } from '@/lib/require-permission';
import { importVillageHousingAssignments } from '@/lib/village-import-assignments.server';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';
import { logAuditError } from '@/lib/audit-log-store';

/** Importe les affectations logement village (liste capture → employés). */
export async function POST() {
  const denied = await checkAnyPermission([
    { menuId: 'village.maisons', action: 'edit' },
    { menuId: 'village.dependants-liste', action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const result = await importVillageHousingAssignments();
    await auditSimpleAction({
      module: 'village.assign',
      action: 'import',
      summary: 'Import affectations logement village',
      details: `Import terminé : ${JSON.stringify(result)}`,
      meta: { result },
    });
    return NextResponse.json(result);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    await logAuditError({
      message,
      details: `Échec import affectations village: ${message}`,
      module: 'village.assign',
      path: '/api/village/import-assignments',
      method: 'POST',
      stack: err instanceof Error ? err.stack : undefined,
      user: await getAuditActor(),
    });
    return NextResponse.json({ error: message }, { status });
  }
}
