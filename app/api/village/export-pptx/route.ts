import { NextResponse } from 'next/server';
import { readDependantsData } from '@/lib/dependants-json-store';
import { excelErrorResponse } from '@/lib/excel-io';
import { readEmployees } from '@/lib/employees-json-store';
import { checkAnyPermission } from '@/lib/require-permission';
import { normalizeVillagePresentation } from '@/lib/village-presentation';
import { readVillagePresentation } from '@/lib/village-presentation-store';
import {
  buildVillagePptxBuffer,
  buildVillagePptxFilename,
} from '@/lib/village-pptx-export';
import { readVillageCatalog } from '@/lib/village-store';
import { auditSimpleAction, getAuditActor } from '@/lib/with-audit';
import { logAuditError } from '@/lib/audit-log-store';

export const runtime = 'nodejs';

const EXPORT = [
  { menuId: 'village.maisons', action: 'export' as const },
  { menuId: 'village.dependants-dashboard', action: 'export' as const },
  { menuId: 'village.dependants-liste', action: 'export' as const },
];

async function exportPptx(rawPresentation?: unknown) {
  const [employees, dependantsData, catalog] = await Promise.all([
    readEmployees(),
    readDependantsData(),
    readVillageCatalog(),
  ]);
  const presentation = rawPresentation
    ? normalizeVillagePresentation(rawPresentation, employees)
    : await readVillagePresentation(employees);
  const buffer = await buildVillagePptxBuffer(
    employees,
    dependantsData.dependants,
    catalog.maisons,
    catalog.tailles,
    presentation,
  );
  const filename = buildVillagePptxFilename();
  await auditSimpleAction({
    module: 'village.maisons',
    action: 'export',
    summary: `Export présentation village (${filename})`,
    details: `Fichier PowerPoint exporté : ${filename}`,
  });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export async function GET() {
  const denied = await checkAnyPermission(EXPORT);
  if (denied) return denied;
  try {
    return await exportPptx();
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    await logAuditError({
      message,
      details: `Échec export PPTX village: ${message}`,
      module: 'village.maisons',
      path: '/api/village/export-pptx',
      method: 'GET',
      stack: err instanceof Error ? err.stack : undefined,
      user: await getAuditActor(),
    });
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission(EXPORT);
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => null);
    return await exportPptx(body);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    await logAuditError({
      message,
      details: `Échec export PPTX village: ${message}`,
      module: 'village.maisons',
      path: '/api/village/export-pptx',
      method: 'POST',
      stack: err instanceof Error ? err.stack : undefined,
      user: await getAuditActor(),
    });
    return NextResponse.json({ error: message }, { status });
  }
}
