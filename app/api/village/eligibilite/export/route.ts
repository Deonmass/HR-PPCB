import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-json-store';
import { readEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';
import {
  buildEligibiliteFamilyExport,
  buildKimpeseEligibiliteRows,
} from '@/lib/village-eligibilite-build';
import {
  buildVillageEligibiliteWorkbookBuffer,
  villageEligibiliteExportFilename,
} from '@/lib/village-eligibilite-export.server';
import { readVillageEligibilite } from '@/lib/village-eligibilite-store';

export const runtime = 'nodejs';
export const maxDuration = 10;

const VIEW = [
  { menuId: 'village.maisons', action: 'view' as const },
  { menuId: 'village.dependants-dashboard', action: 'view' as const },
  { menuId: 'village.dependants-liste', action: 'view' as const },
];

function apiError(err: unknown) {
  const raw = err instanceof Error ? err.message : 'Erreur inattendue';
  const technical = /Unexpected token|is not valid JSON|ECONNREFUSED|ENOENT|stack/i.test(raw);
  const message = technical
    ? 'Erreur serveur pendant l’export. Réessayez dans un moment.'
    : raw;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const denied = await checkAnyPermission([
    ...VIEW,
    { menuId: 'village.maisons', action: 'export' },
  ]);
  if (denied) return denied;
  try {
    const started = Date.now();
    const [employees, dependantsData, data] = await Promise.all([
      readEmployees(),
      readDependantsData(),
      readVillageEligibilite(),
    ]);
    const rows = buildKimpeseEligibiliteRows(
      employees,
      dependantsData.dependants,
      data,
    );
    const { base, detail } = buildEligibiliteFamilyExport(
      rows,
      dependantsData.dependants,
    );
    const buffer = await buildVillageEligibiliteWorkbookBuffer(rows, base, detail);
    const filename = villageEligibiliteExportFilename();
    const elapsed = Date.now() - started;
    try {
      await auditSimpleAction({
        module: 'village.maisons',
        action: 'export',
        summary: `Export Excel éligibilité village (${rows.length} agents, ${detail.length} lignes famille, ${elapsed}ms)`,
      });
    } catch (auditErr) {
      console.error('[village-eligibilite-export] audit skipped', auditErr);
    }
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Export-Duration-Ms': String(elapsed),
      },
    });
  } catch (err) {
    return apiError(err);
  }
}
