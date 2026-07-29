import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { readEmployees } from '@/lib/employees-json-store';
import { getGuestHouseBundle } from '@/lib/guest-house-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { readAffectationHistory } from '@/lib/village-affectation-history';
import { readAffectationSuggestions } from '@/lib/village-affectation-suggestions';
import {
  buildVillageExportBuffer,
  buildVillageExportFilename,
} from '@/lib/village-export.server';
import { readVillageCatalog } from '@/lib/village-store';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';
import { logAuditError } from '@/lib/audit-log-store';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'village.dependants-dashboard', action: 'export' },
    { menuId: 'village.dependants-liste', action: 'export' },
    { menuId: 'village.maisons', action: 'export' },
    { menuId: 'village.guest-house', action: 'export' },
  ]);
  if (denied) return denied;

  try {
    // Pas de sync Excel lourde ici — l’export doit rester < 10 s.
    const [employees, dependantsData, catalog, history, suggestions, guestHouse] = await Promise.all([
      readEmployees(),
      readDependantsData(),
      readVillageCatalog(),
      readAffectationHistory().catch(() => []),
      readAffectationSuggestions().catch(() => []),
      getGuestHouseBundle().catch(() => null),
    ]);
    const buffer = await buildVillageExportBuffer(
      employees,
      dependantsData.dependants,
      catalog.maisons,
      catalog.tailles,
      history,
      suggestions,
      guestHouse,
    );
    const filename = buildVillageExportFilename();
    await auditSimpleAction({
      module: 'village.maisons',
      action: 'export',
      summary: `Export village (${filename})`,
      details: `Fichier Excel exporté : ${filename}`,
    });
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    await logAuditError({
      message,
      details: `Échec export village: ${message}`,
      module: 'village.maisons',
      path: '/api/village/export',
      method: 'GET',
      stack: err instanceof Error ? err.stack : undefined,
      user: await getAuditActor(),
    });
    return NextResponse.json({ error: message }, { status });
  }
}
