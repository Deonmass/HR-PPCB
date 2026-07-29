import { NextResponse } from 'next/server';
import {
  listAuditFilterOptions,
  readAuditLogs,
} from '@/lib/audit-log-store';
import type { AuditAction } from '@/lib/audit-log-types';
import { AUDIT_ACTION_LABELS } from '@/lib/audit-log-types';
import { checkPermission } from '@/lib/require-permission';

export async function GET(request: Request) {
  const denied = await checkPermission('parametres.logs', 'view');
  if (denied) return denied;

  try {
    const url = new URL(request.url);
    const exportMode = url.searchParams.get('export') === '1';

    const module = url.searchParams.get('module') || undefined;
    const action = (url.searchParams.get('action') || undefined) as AuditAction | undefined;
    const userId = url.searchParams.get('userId') || undefined;
    const q = url.searchParams.get('q') || undefined;
    const monthParam = url.searchParams.get('month') || undefined; // "YYYY-MM"

    if (exportMode) {
      // Fetch all matching entries (no pagination)
      const page = await readAuditLogs({ limit: 99999, offset: 0, module, action, userId, q });
      let filtered = page.entries;

      if (monthParam) {
        filtered = filtered.filter((e) => e.at.startsWith(monthParam));
      }

      // Build CSV
      const cols = ['Date', 'ID', 'Module', 'Action', 'Utilisateur', 'Email', 'Résumé', 'Détails'];
      const escape = (v: unknown) => {
        const s = v == null ? '' : String(v).replace(/"/g, '""');
        return `"${s}"`;
      };
      const rows = filtered.map((e) => [
        escape(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }).format(new Date(e.at))),
        escape(e.id),
        escape(e.moduleLabel),
        escape(AUDIT_ACTION_LABELS[e.action] ?? e.action),
        escape(e.userName),
        escape(e.userEmail ?? ''),
        escape(e.summary),
        escape(e.details),
      ]);
      const csv = [cols.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
      const label = monthParam ? `logs-${monthParam}` : 'logs-complet';
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${label}.csv"`,
        },
      });
    }

    const limit = Number(url.searchParams.get('limit') || 200);
    const offset = Number(url.searchParams.get('offset') || 0);

    const [page, options] = await Promise.all([
      readAuditLogs({ limit, offset, module, action, userId, q }),
      listAuditFilterOptions(),
    ]);

    return NextResponse.json({
      ...page,
      modules: options.modules,
      users: options.users,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erreur de lecture des logs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
