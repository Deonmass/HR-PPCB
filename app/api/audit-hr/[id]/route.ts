import { NextResponse } from 'next/server';
import {
  completeAuditHrAction,
  deleteAuditHrAction,
  updateAuditHrAction,
} from '@/lib/audit-hr-store';
import type { AuditHrActionInput, AuditHrConfirmation } from '@/lib/audit-hr-types';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor, withAudit } from '@/lib/with-audit';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await checkPermission('audit.points', 'edit');
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as AuditHrActionInput & {
      complete?: boolean;
      confirmationAudit?: AuditHrConfirmation | '';
    };
    const actor = await getAuditActor();

    if (body.complete) {
      const saved = await withAudit(
        {
          module: 'audit-hr',
          action: 'update',
          entityType: 'audit-action',
          entityId: id,
          summary: `Clôture action audit ${id}`,
          path: `/api/audit-hr/${id}`,
          method: 'PUT',
        },
        () =>
          completeAuditHrAction(
            id,
            {
              closingDate: body.closingDate,
              confirmationAudit: body.confirmationAudit,
              commentaire: body.commentaire,
            },
            actor?.userName,
          ),
      );
      if (!saved) return NextResponse.json({ error: 'Action introuvable' }, { status: 404 });
      return NextResponse.json(saved);
    }

    const saved = await withAudit(
      {
        module: 'audit-hr',
        action: 'update',
        entityType: 'audit-action',
        entityId: id,
        summary: `Màj action audit — ${(body.action || '').slice(0, 80)}`,
        path: `/api/audit-hr/${id}`,
        method: 'PUT',
      },
      () => updateAuditHrAction(id, body, actor?.userName),
    );
    if (!saved) return NextResponse.json({ error: 'Action introuvable' }, { status: 404 });
    return NextResponse.json(saved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
    const status = /requis|invalide/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const denied = await checkPermission('audit.points', 'delete');
  if (denied) return denied;

  try {
    const { id } = await context.params;
    const ok = await withAudit(
      {
        module: 'audit-hr',
        action: 'delete',
        entityType: 'audit-action',
        entityId: id,
        summary: `Suppression action audit ${id}`,
        path: `/api/audit-hr/${id}`,
        method: 'DELETE',
      },
      () => deleteAuditHrAction(id),
    );
    if (!ok) return NextResponse.json({ error: 'Action introuvable' }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de suppression';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
