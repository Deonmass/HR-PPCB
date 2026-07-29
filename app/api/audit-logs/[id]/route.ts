import { NextResponse } from 'next/server';
import { deleteAuditLog, getAuditLog } from '@/lib/audit-log-store';
import { checkPermission } from '@/lib/require-permission';
import { withAudit } from '@/lib/with-audit';

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const denied = await checkPermission('parametres.logs', 'view');
  if (denied) return denied;
  try {
    const { id } = await params;
    const entry = await getAuditLog(id);
    if (!entry) return NextResponse.json({ error: 'Log introuvable' }, { status: 404 });
    return NextResponse.json(entry);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const denied = await checkPermission('parametres.logs', 'delete');
  if (denied) return denied;
  try {
    const { id } = await params;
    const before = await getAuditLog(id);
    const ok = await withAudit(
      {
        module: 'audit',
        action: 'delete',
        entityType: 'audit.log',
        entityId: id,
        summary: `Suppression log d’audit ${id}`,
        details: before
          ? `Suppression du log « ${before.summary} » (${before.action})`
          : `Suppression log ${id}`,
        getBefore: async () => before ?? null,
        getAfter: () => null,
        undoable: false,
        path: `/api/audit-logs/${id}`,
        method: 'DELETE',
      },
      () => deleteAuditLog(id),
    );
    if (!ok) return NextResponse.json({ error: 'Log introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
