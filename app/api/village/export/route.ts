import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { readEmployees } from '@/lib/employees-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { readAffectationHistory } from '@/lib/village-affectation-history';
import { readAffectationSuggestions } from '@/lib/village-affectation-suggestions';
import {
  buildVillageExportBuffer,
  buildVillageExportFilename,
} from '@/lib/village-export.server';
import { readVillageCatalog } from '@/lib/village-store';

export async function GET() {
  const denied = await checkAnyPermission([
    { menuId: 'village.dependants-dashboard', action: 'export' },
    { menuId: 'village.dependants-liste', action: 'export' },
    { menuId: 'village.maisons', action: 'export' },
  ]);
  if (denied) return denied;

  try {
    // Pas de sync Excel lourde ici — l’export doit rester < 10 s.
    const [employees, dependantsData, catalog, history, suggestions] = await Promise.all([
      readEmployees(),
      readDependantsData(),
      readVillageCatalog(),
      readAffectationHistory().catch(() => []),
      readAffectationSuggestions().catch(() => []),
    ]);
    const buffer = await buildVillageExportBuffer(
      employees,
      dependantsData.dependants,
      catalog.maisons,
      catalog.tailles,
      history,
      suggestions,
    );
    const filename = buildVillageExportFilename();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
