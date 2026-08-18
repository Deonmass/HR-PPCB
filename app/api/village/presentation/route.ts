import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { readEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import {
  buildMaisonOccupancy,
  buildVillageDashboardStats,
  buildZambaAgentsFromEmployees,
  resolveMaisonTypeLabel,
  splitVillageKimpese,
} from '@/lib/village-agents';
import { compareMaisonNumero } from '@/lib/table-sort';
import {
  readVillagePresentation,
  saveVillagePresentation,
} from '@/lib/village-presentation-store';
import type { VillagePresentationLive } from '@/lib/village-presentation';
import { readVillageCatalog } from '@/lib/village-store';
import { auditSimpleAction } from '@/lib/with-audit';

export const runtime = 'nodejs';

const VIEW = [
  { menuId: 'village.maisons', action: 'view' as const },
  { menuId: 'village.dependants-dashboard', action: 'view' as const },
  { menuId: 'village.dependants-liste', action: 'view' as const },
];

async function liveSnapshot(): Promise<{
  employees: Awaited<ReturnType<typeof readEmployees>>;
  live: VillagePresentationLive;
}> {
  const [employees, dependantsData, catalog] = await Promise.all([
    readEmployees(),
    readDependantsData(),
    readVillageCatalog(),
  ]);
  const stats = buildVillageDashboardStats(
    employees,
    dependantsData.dependants,
    catalog.maisons,
    catalog.tailles,
  );
  const zamba = buildZambaAgentsFromEmployees(employees, dependantsData.dependants);
  const { village } = splitVillageKimpese(zamba);
  const occupancy = buildMaisonOccupancy(
    catalog.maisons,
    catalog.tailles,
    village,
    dependantsData.dependants,
  );
  const vacant = occupancy
    .filter((m) => !m.occupied)
    .slice()
    .sort((a, b) => compareMaisonNumero(a.numero, b.numero))
    .map((m) => ({
      numero: m.numero,
      type: resolveMaisonTypeLabel(m.taille, m.typeMaison, catalog.tailles),
    }));
  const occPct = stats.maisonsTotal
    ? Math.round((stats.maisonsOccupees / stats.maisonsTotal) * 100)
    : 0;
  return {
    employees,
    live: {
      maisonsTotal: stats.maisonsTotal,
      maisonsOccupees: stats.maisonsOccupees,
      maisonsVides: stats.maisonsVides,
      village: stats.village,
      villagePersonnes: stats.villagePersonnes,
      kimpese: stats.kimpese,
      kimpesePersonnes: stats.kimpesePersonnes,
      zamba: stats.zamba,
      occPct,
      parTaille: stats.parTaille,
      tailleColumns: stats.tailleColumns,
      parDepartementTaille: stats.parDepartementTaille,
      vacant,
    },
  };
}

export async function GET() {
  const denied = await checkAnyPermission(VIEW);
  if (denied) return denied;
  try {
    const { employees, live } = await liveSnapshot();
    const presentation = await readVillagePresentation(employees);
    return NextResponse.json({ presentation, live });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PUT(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: 'village.maisons', action: 'edit' },
    { menuId: 'village.maisons', action: 'create' },
    { menuId: 'village.maisons', action: 'export' },
  ]);
  if (denied) return denied;
  try {
    const body = await request.json();
    const employees = await readEmployees();
    const presentation = await saveVillagePresentation(body, employees);
    await auditSimpleAction({
      module: 'village.maisons',
      action: 'update',
      summary: 'Enregistrement présentation village',
    });
    return NextResponse.json({ presentation });
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
