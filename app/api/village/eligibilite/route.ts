import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-json-store';
import { readEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';
import { buildKimpeseEligibiliteRows } from '@/lib/village-eligibilite-build';
import {
  ELIGIBILITE_CRITERIA,
  ELIGIBILITE_MAX_TOTAL,
} from '@/lib/village-eligibilite';
import {
  readVillageEligibilite,
  saveVillageEligibilite,
} from '@/lib/village-eligibilite-store';

export const runtime = 'nodejs';

const VIEW = [
  { menuId: 'village.maisons', action: 'view' as const },
  { menuId: 'village.dependants-dashboard', action: 'view' as const },
  { menuId: 'village.dependants-liste', action: 'view' as const },
];

const EDIT = [
  { menuId: 'village.maisons', action: 'edit' as const },
  { menuId: 'village.maisons', action: 'create' as const },
  { menuId: 'village.dependants-liste', action: 'edit' as const },
];

function apiError(err: unknown) {
  const raw = err instanceof Error ? err.message : 'Erreur inattendue';
  const technical = /Unexpected token|is not valid JSON|ECONNREFUSED|ENOENT|stack/i.test(raw);
  const message = technical
    ? 'Erreur serveur lors du traitement. Réessayez dans un moment.'
    : raw;
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
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
    return NextResponse.json({
      criteria: ELIGIBILITE_CRITERIA,
      maxTotal: ELIGIBILITE_MAX_TOTAL,
      updatedAt: data.updatedAt ?? null,
      rows,
    });
  } catch (err) {
    return apiError(err);
  }
}

export async function PUT(request: Request) {
  const denied = await checkAnyPermission(EDIT);
  if (denied) return denied;
  try {
    const body = await request.json();
    const saved = await saveVillageEligibilite(body);
    const [employees, dependantsData] = await Promise.all([
      readEmployees(),
      readDependantsData(),
    ]);
    const rows = buildKimpeseEligibiliteRows(
      employees,
      dependantsData.dependants,
      saved,
    );
    try {
      await auditSimpleAction({
        module: 'village.maisons',
        action: 'other',
        summary: `Enregistrement éligibilité village (${Object.keys(saved.entries).length} agents)`,
      });
    } catch (auditErr) {
      console.error('[village-eligibilite] audit skipped', auditErr);
    }
    return NextResponse.json({
      criteria: ELIGIBILITE_CRITERIA,
      maxTotal: ELIGIBILITE_MAX_TOTAL,
      updatedAt: saved.updatedAt ?? null,
      rows,
    });
  } catch (err) {
    return apiError(err);
  }
}
