import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-json-store';
import { readEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { normalizeVillagePresentation } from '@/lib/village-presentation';
import { readVillagePresentation } from '@/lib/village-presentation-store';
import { buildVillagePreviewHtml } from '@/lib/village-preview-html';
import {
  buildMaisonOccupancy,
  buildVillageDashboardStats,
  buildZambaAgentsFromEmployees,
  splitVillageKimpese,
} from '@/lib/village-agents';
import { readVillageCatalog } from '@/lib/village-store';
import { logAuditError } from '@/lib/audit-log-store';
import { getAuditActor } from '@/lib/with-audit';

export const runtime = 'nodejs';

const PREVIEW = [
  { menuId: 'village.maisons', action: 'export' as const },
  { menuId: 'village.maisons', action: 'view' as const },
  { menuId: 'village.dependants-dashboard', action: 'export' as const },
  { menuId: 'village.dependants-liste', action: 'export' as const },
];

async function previewHtml(rawPresentation?: unknown) {
  const [employees, dependantsData, catalog] = await Promise.all([
    readEmployees(),
    readDependantsData(),
    readVillageCatalog(),
  ]);
  const presentation = rawPresentation
    ? normalizeVillagePresentation(rawPresentation, employees)
    : await readVillagePresentation(employees);
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
  const html = buildVillagePreviewHtml(
    presentation,
    stats,
    occupancy,
    catalog.tailles,
  );
  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function fail(err: unknown, method: string) {
  const message = err instanceof Error ? err.message : 'Erreur aperçu';
  try {
    await logAuditError({
      message,
      details: `Échec aperçu PPTX village: ${message}`,
      module: 'village.maisons',
      path: '/api/village/preview',
      method,
      stack: err instanceof Error ? err.stack : undefined,
      user: await getAuditActor(),
    });
  } catch {
    // ignore
  }
  return NextResponse.json({ error: message }, { status: 500 });
}

export async function GET() {
  const denied = await checkAnyPermission(PREVIEW);
  if (denied) return denied;
  try {
    return await previewHtml();
  } catch (err) {
    return fail(err, 'GET');
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission(PREVIEW);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    return await previewHtml(body);
  } catch (err) {
    return fail(err, 'POST');
  }
}
