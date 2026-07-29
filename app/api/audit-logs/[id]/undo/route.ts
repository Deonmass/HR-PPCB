import { NextResponse } from 'next/server';
import { logAuditError, undoAuditLog } from '@/lib/audit-log-store';
import { checkPermission } from '@/lib/require-permission';
import { getAuditActor } from '@/lib/with-audit';

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const denied = await checkPermission('parametres.logs', 'undo');
  if (denied) return denied;

  try {
    const { id } = await params;
    const actor = await getAuditActor();
    if (!actor) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    // undoAuditLog crée déjà une entrée d’audit action « undo »
    const result = await undoAuditLog(id, actor);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Annulation impossible';
    const status = /introuvable|déjà|ne peut pas|Aucun gestionnaire/i.test(message) ? 400 : 500;
    await logAuditError({
      message,
      details: `Échec annulation audit: ${message}`,
      module: 'audit',
      path: '/api/audit-logs/[id]/undo',
      method: 'POST',
      stack: err instanceof Error ? err.stack : undefined,
      user: await getAuditActor(),
    });
    return NextResponse.json({ error: message }, { status });
  }
}
