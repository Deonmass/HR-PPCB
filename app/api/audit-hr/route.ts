import { NextResponse } from 'next/server';
import {
  buildAuditHrDashboard,
  enrichAuditAction,
} from '@/lib/audit-hr-compute';
import {
  createAuditHrAction,
  listAuditHrActions,
} from '@/lib/audit-hr-store';
import type { AuditHrActionInput } from '@/lib/audit-hr-types';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(request: Request) {
  const denied = await checkPermission('audit.points', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const asOf = (url.searchParams.get('asOf') || todayIso()).slice(0, 10);
    const actions = await listAuditHrActions();
    const asOfDate = new Date(`${asOf}T00:00:00`);
    const views = actions.map((a) => enrichAuditAction(a, asOfDate));
    const dashboard = buildAuditHrDashboard(actions, asOf);
    return NextResponse.json({ asOf, actions: views, dashboard });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de chargement';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const denied = await checkPermission('audit.points', 'create');
  if (denied) return denied;

  try {
    const body = (await request.json()) as AuditHrActionInput;
    const actor = await getAuditActor();
    const saved = await withAudit(
      {
        module: 'audit-hr',
        action: 'create',
        entityType: 'audit-action',
        entityId: body.owner || '—',
        summary: `Action audit — ${body.action?.slice(0, 80) || 'nouvelle'}`,
        path: '/api/audit-hr',
        method: 'POST',
      },
      () => createAuditHrAction(body, actor?.userName),
    );
    return NextResponse.json(saved, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur d’enregistrement';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
