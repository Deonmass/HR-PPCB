'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import type { AuditAction, AuditLogEntry } from '@/lib/audit-log-types';
import { AUDIT_ACTION_LABELS } from '@/lib/audit-log-types';
import { confirmAction, confirmDelete, showError, showSuccess } from '@/lib/swal';

const PAGE_SIZE = 200;

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'short',
      timeStyle: 'medium',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function prettyJson(value: unknown): string {
  if (value === undefined) return '—';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

// ── Action badge ──────────────────────────────────────────────────────────────
const ACTION_BADGE_STYLES: Record<AuditAction, { label: string; icon: string; cls: string }> = {
  create:  { label: 'Création',     icon: '＋', cls: 'audit-badge-create'  },
  update:  { label: 'Modification', icon: '✎',  cls: 'audit-badge-update'  },
  delete:  { label: 'Suppression',  icon: '✕',  cls: 'audit-badge-delete'  },
  export:  { label: 'Export',       icon: '↗',  cls: 'audit-badge-export'  },
  import:  { label: 'Import',       icon: '↙',  cls: 'audit-badge-import'  },
  undo:    { label: 'Annulation',   icon: '↩',  cls: 'audit-badge-undo'    },
  login:   { label: 'Connexion',    icon: '→',  cls: 'audit-badge-login'   },
  logout:  { label: 'Déconnexion',  icon: '←',  cls: 'audit-badge-logout'  },
  error:   { label: 'Erreur',       icon: '⚠',  cls: 'audit-badge-error'   },
  other:   { label: 'Autre',        icon: '·',  cls: 'audit-badge-other'   },
};

function ActionBadge({ action }: { action: AuditAction }) {
  const cfg = ACTION_BADGE_STYLES[action] ?? ACTION_BADGE_STYLES.other;
  return (
    <span className={`audit-action-badge ${cfg.cls}`}>
      <span className="audit-badge-icon">{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

// ── Right-click contextual menu (portal, auto-position) ──────────────────────
type MenuAction = 'view' | 'undo' | 'delete';

interface CtxState {
  entry: AuditLogEntry;
  x: number;
  y: number;
}

interface PortalMenuProps {
  ctx: CtxState;
  busyId: string | null;
  canUndo: boolean;
  canDelete: boolean;
  onClose: () => void;
  onAction: (action: MenuAction, entry: AuditLogEntry) => void;
}

function PortalContextMenu({ ctx, busyId, canUndo, canDelete, onClose, onAction }: PortalMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { entry, x, y } = ctx;
  const busy = busyId === entry.id;

  // Auto-position so dropdown never overflows the viewport
  const [pos, setPos] = useState({ top: y, left: x });
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = el.getBoundingClientRect();
    setPos({
      top:  y + rect.height > vh ? Math.max(0, y - rect.height) : y,
      left: x + rect.width  > vw ? Math.max(0, x - rect.width)  : x,
    });
  }, [x, y]);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', down);
      document.removeEventListener('keydown', key);
    };
  }, [onClose]);

  const items: { action: MenuAction; icon: string; label: string; disabled?: boolean; danger?: boolean }[] = [
    { action: 'view',   icon: '👁',  label: 'Voir le détail' },
    ...(canUndo ? [{
      action: 'undo' as MenuAction,
      icon: '↩',
      label: entry.undone ? 'Déjà annulée' : 'Annuler l\'action',
      disabled: !entry.undoable || entry.undone || busy,
    }] : []),
    ...(canDelete ? [{
      action: 'delete' as MenuAction,
      icon: '🗑',
      label: 'Supprimer le log',
      disabled: busy,
      danger: true,
    }] : []),
  ];

  return createPortal(
    <div
      ref={ref}
      className="audit-ctx-dropdown"
      style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
    >
      {items.map((item) => (
        <button
          key={item.action}
          type="button"
          className={`audit-ctx-item${item.danger ? ' audit-ctx-item-danger' : ''}${item.disabled ? ' audit-ctx-item-disabled' : ''}`}
          disabled={item.disabled}
          onClick={() => {
            onClose();
            if (!item.disabled) onAction(item.action, entry);
          }}
        >
          <span className="audit-ctx-item-icon">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  );
}

// ── Export modal ──────────────────────────────────────────────────────────────
function ExportModal({
  onClose,
  buildExportUrl,
}: {
  onClose: () => void;
  buildExportUrl: (month?: string) => string;
}) {
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [mode, setMode] = useState<'all' | 'month'>('month');
  const [month, setMonth] = useState(defaultMonth);

  const handleExport = () => {
    const url = buildExportUrl(mode === 'month' ? month : undefined);
    window.open(url, '_blank');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-form" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Exporter les logs</h3>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>Période</label>
            <div className="radio-group" style={{ display: 'flex', gap: '1rem', marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={mode === 'all'} onChange={() => setMode('all')} />
                Tous les logs
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={mode === 'month'} onChange={() => setMode('month')} />
                Par mois
              </label>
            </div>
          </div>
          {mode === 'month' && (
            <div className="form-group">
              <label>Mois</label>
              <input
                type="month"
                className="search-input"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          )}
          <p className="text-muted" style={{ fontSize: '0.78rem', marginTop: 8 }}>
            Le fichier CSV sera généré selon les filtres actifs (module, action, utilisateur, recherche).
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>Annuler</button>
          <button type="button" className="btn btn-primary" onClick={handleExport}>
            ↗ Télécharger CSV
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
type FilterOptions = {
  modules: { id: string; label: string }[];
  users: { id: string; name: string }[];
};

export default function AuditLogsPage() {
  const { can } = usePermissions();
  const canUndoAction = can('parametres.logs', 'undo');
  const canDeleteLog  = can('parametres.logs', 'delete');
  const canExport     = can('parametres.logs', 'export');

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [options, setOptions] = useState<FilterOptions>({ modules: [], users: [] });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<CtxState | null>(null);

  const load = useCallback(async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
      if (module) params.set('module', module);
      if (action) params.set('action', action);
      if (userId) params.set('userId', userId);
      if (q.trim()) params.set('q', q.trim());

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Impossible de charger les logs');
        return;
      }
      const nextEntries = (json.entries ?? []) as AuditLogEntry[];
      setEntries((prev) => (append ? [...prev, ...nextEntries] : nextEntries));
      setTotal(Number(json.total) || 0);
      setOptions({
        modules: Array.isArray(json.modules) ? json.modules : [],
        users:   Array.isArray(json.users)   ? json.users   : [],
      });
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [module, action, userId, q]);

  useEffect(() => { void load(0, false); }, [load]);

  const canLoadMore = entries.length < total;

  const actionOptions = useMemo(
    () => (Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((id) => ({ id, label: AUDIT_ACTION_LABELS[id] })),
    [],
  );

  const buildExportUrl = useCallback((month?: string) => {
    const params = new URLSearchParams({ export: '1' });
    if (module) params.set('module', module);
    if (action) params.set('action', action);
    if (userId) params.set('userId', userId);
    if (q.trim()) params.set('q', q.trim());
    if (month) params.set('month', month);
    return `/api/audit-logs?${params.toString()}`;
  }, [module, action, userId, q]);

  const openDetail = async (id: string) => {
    const res = await fetch(`/api/audit-logs/${encodeURIComponent(id)}`);
    const json = await res.json();
    if (!res.ok) { await showError(json.error || 'Log introuvable'); return; }
    setDetail(json as AuditLogEntry);
  };

  const handleUndo = async (entry: AuditLogEntry) => {
    if (!entry.undoable || entry.undone) return;
    if (!(await confirmAction('Annuler cette action ?', `La modification « ${entry.summary} » sera restaurée à l'état précédent.`, 'Annuler l\'action'))) return;
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/audit-logs/${encodeURIComponent(entry.id)}/undo`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { await showError(json.error || 'Annulation impossible'); return; }
      await showSuccess('Action annulée');
      setDetail(null);
      await load(0, false);
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (entry: AuditLogEntry) => {
    if (!(await confirmDelete('Supprimer ce log ?', 'Cela n\'annule pas la donnée — nettoyage d\'historique seulement.'))) return;
    setBusyId(entry.id);
    try {
      const res = await fetch(`/api/audit-logs/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { await showError((json as { error?: string }).error || 'Suppression impossible'); return; }
      await showSuccess('Log supprimé');
      if (detail?.id === entry.id) setDetail(null);
      await load(0, false);
    } finally {
      setBusyId(null);
    }
  };

  const handleMenuAction = (menuAction: MenuAction, entry: AuditLogEntry) => {
    if (menuAction === 'view')   void openDetail(entry.id);
    if (menuAction === 'undo')   void handleUndo(entry);
    if (menuAction === 'delete') void handleDelete(entry);
  };

  const handleRowCtx = (e: React.MouseEvent, entry: AuditLogEntry) => {
    e.preventDefault();
    setCtxMenu({ entry, x: e.clientX, y: e.clientY });
  };

  if (loading && entries.length === 0) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <div className="audit-logs-page">
      <div className="page-header audit-logs-sticky-header">
        <div>
          <div className="page-header-title-row">
            <h2>Logs</h2>
            <RefreshButton onClick={() => load(0, false)} loading={loading} />
          </div>
          <p>
            {entries.length} / {total} entrée{total > 1 ? 's' : ''} — plus récentes en premier
          </p>
        </div>
      </div>

      <div className="panel settings-search-panel">
        <div className="panel-toolbar settings-search-toolbar audit-logs-filters">
          <input
            type="search"
            className="search-input"
            placeholder="Rechercher dans les détails…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="search-input audit-filter-select" value={module} onChange={(e) => setModule(e.target.value)}>
            <option value="">Tous les modules</option>
            {options.modules.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <select className="search-input audit-filter-select" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Toutes les actions</option>
            {actionOptions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
          <select className="search-input audit-filter-select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Tous les utilisateurs</option>
            {options.users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {canExport && (
            <button type="button" className="audit-export-btn" onClick={() => setShowExport(true)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exporter
            </button>
          )}
        </div>
      </div>

      <div className="panel panel-padded audit-logs-table-panel audit-logs-fill">
        <div className="table-scroll audit-table-scroll-fill">
          <table className="data-table audit-logs-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Module</th>
                <th>Utilisateur</th>
                <th>Action</th>
                <th>Détails</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted" style={{ textAlign: 'center' }}>
                    Aucun log pour ces filtres.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className={`audit-row-clickable${entry.action === 'error' ? ' audit-row-error' : entry.undone ? ' audit-row-undone' : ''}`}
                    onContextMenu={(e) => handleRowCtx(e, entry)}
                    title="Clic droit pour les actions"
                  >
                    <td className="audit-col-date">
                      <div>{formatDate(entry.at)}</div>
                      <div className="text-muted audit-id">{entry.id}</div>
                    </td>
                    <td>
                      <div>{entry.moduleLabel}</div>
                    </td>
                    <td>
                      <div>{entry.userName}</div>
                      {entry.userEmail ? <div className="text-muted">{entry.userEmail}</div> : null}
                    </td>
                    <td className="audit-col-action">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="audit-col-details">
                      <div className="audit-summary">{entry.summary}</div>
                      {entry.undone ? <span className="settings-badge inactive">Annulée</span> : null}
                      {entry.action === 'error' ? <span className="settings-badge">Erreur</span> : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {canLoadMore && (
          <div className="audit-load-more">
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={loadingMore}
              onClick={() => load(entries.length, true)}
            >
              {loadingMore ? 'Chargement…' : `Charger plus (${total - entries.length} restantes)`}
            </button>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal modal-form audit-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Détail du log</h3>
              <button type="button" className="modal-close" onClick={() => setDetail(null)}>×</button>
            </div>
            <div className="modal-body audit-detail-body">
              <div className="audit-detail-grid">
                <div><span className="text-muted">Date</span><div>{formatDate(detail.at)}</div></div>
                <div><span className="text-muted">ID</span><div>{detail.id}</div></div>
                <div><span className="text-muted">Module</span><div>{detail.moduleLabel}</div></div>
                <div>
                  <span className="text-muted">Action</span>
                  <div><ActionBadge action={detail.action} /></div>
                </div>
                <div><span className="text-muted">Utilisateur</span><div>{detail.userName}{detail.userEmail ? ` · ${detail.userEmail}` : ''}</div></div>
                <div><span className="text-muted">Entité</span><div>{detail.entityType || '—'}{detail.entityId ? ` · ${detail.entityId}` : ''}</div></div>
              </div>
              <div className="form-group">
                <label>Résumé</label>
                <p>{detail.summary}</p>
              </div>
              <div className="form-group">
                <label>Détails</label>
                <pre className="audit-pre">{detail.details}</pre>
              </div>
              {detail.error && (
                <div className="form-group audit-error-block">
                  <label>Erreur</label>
                  <pre className="audit-pre">
{[
  detail.error.message,
  detail.error.code   ? `Code: ${detail.error.code}`       : '',
  detail.error.path   ? `Chemin: ${detail.error.path}`     : '',
  detail.error.method ? `Méthode: ${detail.error.method}`  : '',
  detail.error.status != null ? `HTTP: ${detail.error.status}` : '',
  detail.error.stack  || '',
  detail.error.context ? prettyJson(detail.error.context)  : '',
].filter(Boolean).join('\n')}
                  </pre>
                </div>
              )}
              <div className="audit-json-split">
                <div className="form-group">
                  <label>Avant</label>
                  <pre className="audit-pre">{prettyJson(detail.before)}</pre>
                </div>
                <div className="form-group">
                  <label>Après</label>
                  <pre className="audit-pre">{prettyJson(detail.after)}</pre>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>Fermer</button>
              {canUndoAction && (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!detail.undoable || detail.undone || busyId === detail.id}
                  onClick={() => handleUndo(detail)}
                >
                  ↩ Annuler l&apos;action
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Export modal */}
      {showExport && (
        <ExportModal onClose={() => setShowExport(false)} buildExportUrl={buildExportUrl} />
      )}

      {/* Right-click portal context menu */}
      {ctxMenu && (
        <PermissionGate menuId="parametres.logs" action="view">
          <PortalContextMenu
            ctx={ctxMenu}
            busyId={busyId}
            canUndo={canUndoAction}
            canDelete={canDeleteLog}
            onClose={() => setCtxMenu(null)}
            onAction={(a, e) => { setCtxMenu(null); handleMenuAction(a, e); }}
          />
        </PermissionGate>
      )}
    </div>
  );
}
