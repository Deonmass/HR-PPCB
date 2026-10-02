import { NextRequest, NextResponse } from 'next/server';
import { excelErrorResponse } from '@/lib/excel-io';
import {
  buildPostesEffectifsExcelBuffer,
  type PostesEffectifsExportSelection,
} from '@/lib/postes-effectifs-export.server';
import { getContractantScopeFromMenus } from '@/lib/contractant-scope';
import { checkAnyPermission, getActiveSession } from '@/lib/require-permission';
import { auditSimpleAction } from '@/lib/with-audit';

const PERMS = [
  { menuId: 'employes.classification', action: 'export' as const },
  { menuId: 'employes.classification', action: 'view' as const },
  { menuId: 'employes.postes', action: 'export' as const },
  { menuId: 'employes.postes', action: 'view' as const },
  { menuId: 'employes.liste', action: 'export' as const },
  { menuId: 'employes.liste', action: 'view' as const },
  { menuId: 'employes.contractants', action: 'export' as const },
  { menuId: 'employes.contractants', action: 'view' as const },
];

function parseSelection(body: unknown): PostesEffectifsExportSelection | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const raw = body as { includePpc?: unknown; contractantIds?: unknown };
  const includePpc = raw.includePpc !== false && raw.includePpc !== 'false';
  const contractantIds = Array.isArray(raw.contractantIds)
    ? raw.contractantIds.map((id) => String(id || '').trim()).filter(Boolean)
    : [];
  return { includePpc, contractantIds };
}

async function runExport(selection?: PostesEffectifsExportSelection) {
  const session = await getActiveSession();
  const scope = getContractantScopeFromMenus(session?.menus);
  const { buffer, filename } = await buildPostesEffectifsExcelBuffer(scope, selection);
  await auditSimpleAction({
    module: 'employes.postes',
    action: 'export',
    summary: `Export effectifs par poste (${filename})`,
  });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Export avec sélection (cases à cocher). */
export async function POST(req: NextRequest) {
  const denied = await checkAnyPermission(PERMS);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({}));
    return await runExport(parseSelection(body));
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}

/** Rétrocompat : exporte tout. */
export async function GET() {
  const denied = await checkAnyPermission(PERMS);
  if (denied) return denied;

  try {
    return await runExport(undefined);
  } catch (err) {
    const { status, message } = excelErrorResponse(err);
    return NextResponse.json({ error: message }, { status });
  }
}
