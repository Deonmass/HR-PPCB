import 'server-only';

import { cookies } from 'next/headers';
import { getSession, getSessionCookieName } from './auth-store';
import type { SessionUser } from './auth-types';
import { appendAuditLog, logAuditError } from './audit-log-store';
import type { AuditAction, AuditActor, AppendAuditLogInput } from './audit-log-types';
import { hasUndoHandler } from './audit-undo-registry';

export async function getAuditActor(): Promise<AuditActor | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(getSessionCookieName())?.value;
    const session = await getSession(token);
    if (!session?.user) return null;
    return actorFromSessionUser(session.user);
  } catch {
    return null;
  }
}

export function actorFromSessionUser(user: SessionUser): AuditActor {
  return {
    userId: user.id,
    userName: user.displayName || user.username,
    userEmail: user.email,
  };
}

export interface WithAuditOptions {
  module: string;
  moduleLabel?: string;
  action: AuditAction;
  actionLabel?: string;
  entityType?: string;
  entityId?: string | ((result: unknown) => string | undefined);
  summary: string | ((result: unknown) => string);
  details?: string | ((result: unknown, before: unknown, after: unknown) => string);
  getBefore?: () => Promise<unknown>;
  getAfter?: (result: unknown) => Promise<unknown> | unknown;
  undoable?: boolean;
  meta?: Record<string, unknown>;
  user?: AuditActor | null;
  path?: string;
  method?: string;
  /** Si false, n’enregistre pas d’erreur audit en cas d’échec (défaut true). */
  logErrors?: boolean;
}

export async function withAudit<T>(
  options: WithAuditOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const actor = options.user === undefined ? await getAuditActor() : options.user;
  let before: unknown;
  try {
    before = options.getBefore ? await options.getBefore() : undefined;
  } catch (err) {
    console.error('[withAudit] getBefore failed:', err);
    before = undefined;
  }

  try {
    const result = await fn();

    let after: unknown;
    try {
      after = options.getAfter ? await options.getAfter(result) : result;
    } catch (err) {
      console.error('[withAudit] getAfter failed:', err);
      after = result;
    }

    const entityId =
      typeof options.entityId === 'function'
        ? options.entityId(result) ?? options.entityId(after)
        : options.entityId;

    const summary =
      typeof options.summary === 'function' ? options.summary(result) : options.summary;

    const details =
      typeof options.details === 'function'
        ? options.details(result, before, after)
        : options.details ?? summary;

    const undoable =
      typeof options.undoable === 'boolean'
        ? options.undoable
        : Boolean(
          options.entityType
          && hasUndoHandler(options.entityType)
          && (
            (options.action === 'create' && after != null)
            || ((options.action === 'update' || options.action === 'delete') && before != null)
          ),
        );

    const payload: AppendAuditLogInput = {
      userId: actor?.userId,
      userName: actor?.userName,
      userEmail: actor?.userEmail,
      module: options.module,
      moduleLabel: options.moduleLabel,
      action: options.action,
      actionLabel: options.actionLabel,
      entityType: options.entityType,
      entityId: entityId != null ? String(entityId) : undefined,
      summary,
      details,
      before,
      after,
      undoable,
      meta: options.meta,
    };

    await appendAuditLog(payload);
    return result;
  } catch (err) {
    if (options.logErrors !== false) {
      const message = err instanceof Error ? err.message : 'Erreur inattendue';
      const stack = err instanceof Error ? err.stack : undefined;
      await logAuditError({
        message,
        details: `Échec de l’action « ${options.action} » sur ${options.module}: ${message}`,
        module: options.module,
        moduleLabel: options.moduleLabel,
        path: options.path,
        method: options.method,
        stack,
        context: {
          action: options.action,
          entityType: options.entityType,
          entityId: typeof options.entityId === 'string' ? options.entityId : undefined,
          summary: typeof options.summary === 'string' ? options.summary : undefined,
        },
        user: actor,
      });
    }
    throw err;
  }
}

/** Helper pour les exports/imports (non annulables). */
export async function auditSimpleAction(input: {
  module: string;
  moduleLabel?: string;
  action: 'export' | 'import' | 'other';
  summary: string;
  details?: string;
  meta?: Record<string, unknown>;
  user?: AuditActor | null;
}): Promise<void> {
  const actor = input.user === undefined ? await getAuditActor() : input.user;
  await appendAuditLog({
    userId: actor?.userId,
    userName: actor?.userName,
    userEmail: actor?.userEmail,
    module: input.module,
    moduleLabel: input.moduleLabel,
    action: input.action,
    summary: input.summary,
    details: input.details ?? input.summary,
    undoable: false,
    meta: input.meta,
  });
}
