import type { AuditAction } from './audit-log-types';

export type AuditLogsListResponse = {
  entries: Array<{
    id: string;
    at: string;
    userId: string;
    userName: string;
    userEmail?: string;
    module: string;
    moduleLabel: string;
    action: AuditAction;
    actionLabel: string;
    entityType?: string;
    entityId?: string;
    summary: string;
    details: string;
    undoable: boolean;
    undone: boolean;
    undoneByLogId?: string;
    error?: {
      message: string;
      code?: string;
      path?: string;
      method?: string;
      status?: number;
    };
  }>;
  total: number;
  limit: number;
  offset: number;
  modules: { id: string; label: string }[];
  users: { id: string; name: string }[];
};

export async function fetchAuditLogs(params: {
  limit?: number;
  offset?: number;
  module?: string;
  action?: string;
  userId?: string;
  q?: string;
}): Promise<AuditLogsListResponse> {
  const search = new URLSearchParams();
  if (params.limit != null) search.set('limit', String(params.limit));
  if (params.offset != null) search.set('offset', String(params.offset));
  if (params.module) search.set('module', params.module);
  if (params.action) search.set('action', params.action);
  if (params.userId) search.set('userId', params.userId);
  if (params.q) search.set('q', params.q);
  const res = await fetch(`/api/audit-logs?${search.toString()}`);
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || 'Impossible de charger les logs');
  }
  return res.json();
}
