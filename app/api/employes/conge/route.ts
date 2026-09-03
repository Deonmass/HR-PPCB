import { NextResponse } from 'next/server';
import { getCongeBundle, importCongeWorkbook, saveCongeRules } from '@/lib/conge-store';
import type { CongeGradeRow, CongeSeniorityBand } from '@/lib/conge-types';
import { checkAnyPermission, checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';
import { logAuditError } from '@/lib/audit-log-store';

const MENU = 'employes.conge';

export async function GET() {
  const denied = await checkPermission(MENU, 'view');
  if (denied) return denied;
  try {
    const bundle = await getCongeBundle();
    return NextResponse.json({ bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkAnyPermission([
    { menuId: MENU, action: 'create' },
    { menuId: MENU, action: 'edit' },
  ]);
  if (denied) return denied;

  try {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ error: 'multipart/form-data requis' }, { status: 400 });
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
    const buffer = Buffer.from(await file.arrayBuffer());
    const store = await withAudit(
      {
        module: MENU,
        action: 'import',
        entityType: 'conge',
        entityId: file.name,
        summary: `Import planning de congé (${file.name})`,
        path: '/api/employes/conge',
        method: 'POST',
      },
      () => importCongeWorkbook(buffer, file.name),
    );
    const bundle = await getCongeBundle();
    return NextResponse.json({
      imported: store.employees.length,
      rangeStart: store.rangeStart,
      rangeEnd: store.rangeEnd,
      bundle,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur import';
    await logAuditError({
      message,
      details: `Échec import congé : ${message}`,
      module: MENU,
      path: '/api/employes/conge',
      method: 'POST',
      stack: err instanceof Error ? err.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  const denied = await checkPermission(MENU, 'edit');
  if (denied) return denied;
  try {
    const body = (await request.json()) as {
      grades?: CongeGradeRow[];
      seniorityBands?: CongeSeniorityBand[];
    };
    await withAudit(
      {
        module: MENU,
        action: 'update',
        entityType: 'conge-grades',
        entityId: 'grades',
        summary: 'Mise à jour barème de congé',
        path: '/api/employes/conge',
        method: 'PUT',
      },
      () => saveCongeRules(body.grades || [], body.seniorityBands || []),
    );
    const bundle = await getCongeBundle();
    return NextResponse.json({ bundle });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
