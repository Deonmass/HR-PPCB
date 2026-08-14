'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AuditHrDashboardPanels } from '@/components/audit/AuditHrDashboardPanels';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import { formatAuditDateFr } from '@/lib/audit-hr-compute';
import {
  AUDIT_HR_CONFIRMATIONS,
  AUDIT_HR_SEVERITIES,
  emptyAuditHrActionInput,
  type AuditHrActionInput,
  type AuditHrActionView,
  type AuditHrConfirmation,
  type AuditHrDashboard,
  type AuditHrSeverity,
  type AuditHrStatus,
} from '@/lib/audit-hr-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import {
  buildColumnFilterValues,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

type ModalMode = 'create' | 'edit' | 'complete' | 'view';
type PageTab = 'dashboard' | 'actions';
type EditableField =
  | 'owner'
  | 'action'
  | 'issueCreationDate'
  | 'dueDate'
  | 'closingDate'
  | 'confirmationAudit'
  | 'severity'
  | 'commentaire';

type ColFilterKey =
  | 'owner'
  | 'action'
  | 'issue'
  | 'due'
  | 'close'
  | 'days'
  | 'status'
  | 'confirmation'
  | 'severity'
  | 'commentaire';

type ColFilters = Record<ColFilterKey, string[]>;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function statusClass(status: AuditHrStatus): string {
  if (status === 'Closed') return 'audit-hr-badge audit-hr-badge-closed';
  if (status === 'Overdue') return 'audit-hr-badge audit-hr-badge-overdue';
  return 'audit-hr-badge audit-hr-badge-ongoing';
}

function severityClass(severity: string): string {
  if (severity === 'High') return 'audit-hr-sev audit-hr-sev-high';
  if (severity === 'Low') return 'audit-hr-sev audit-hr-sev-low';
  return 'audit-hr-sev audit-hr-sev-medium';
}

function inputFromAction(a: AuditHrActionView): AuditHrActionInput {
  return {
    owner: a.owner,
    action: a.action,
    issueCreationDate: a.issueCreationDate,
    dueDate: a.dueDate,
    closingDate: a.closingDate,
    confirmationAudit: a.confirmationAudit,
    commentaire: a.commentaire,
    severity: a.severity,
  };
}

const emptyColFilters = (): ColFilters => ({
  owner: [],
  action: [],
  issue: [],
  due: [],
  close: [],
  days: [],
  status: [],
  confirmation: [],
  severity: [],
  commentaire: [],
});

const COL_GETTERS: Record<ColFilterKey, (a: AuditHrActionView) => string> = {
  owner: (a) => a.owner,
  action: (a) => a.action,
  issue: (a) => formatAuditDateFr(a.issueCreationDate) || '—',
  due: (a) => formatAuditDateFr(a.dueDate) || '—',
  close: (a) => formatAuditDateFr(a.closingDate) || '—',
  days: (a) => (a.daysOverdue == null ? '—' : String(a.daysOverdue)),
  status: (a) => a.status,
  confirmation: (a) => a.confirmationAudit,
  severity: (a) => a.severity,
  commentaire: (a) => a.commentaire,
};

export default function AuditHrPage() {
  const { can } = usePermissions();
  const canCreate = can('audit.points', 'create');
  const canEdit = can('audit.points', 'edit');
  const canDelete = can('audit.points', 'delete');
  const canExport = can('audit.points', 'export');

  const [tab, setTab] = useState<PageTab>('dashboard');
  const [asOf, setAsOf] = useState(todayIso);
  const [actions, setActions] = useState<AuditHrActionView[]>([]);
  const [dashboard, setDashboard] = useState<AuditHrDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [q, setQ] = useState('');
  const [colFilters, setColFilters] = useState<ColFilters>(emptyColFilters);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AuditHrActionInput>(emptyAuditHrActionInput());

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    action: AuditHrActionView | null;
  } | null>(null);

  const [inlineEdit, setInlineEdit] = useState<{
    id: string;
    field: EditableField;
  } | null>(null);
  const [inlineValue, setInlineValue] = useState('');
  const inlineRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/audit-hr?asOf=${encodeURIComponent(asOf)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur de chargement');
      setActions(json.actions || []);
      setDashboard(json.dashboard || null);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [asOf]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!inlineEdit) return;
    inlineRef.current?.focus();
  }, [inlineEdit]);

  const owners = useMemo(
    () =>
      [...new Set(actions.map((a) => a.owner).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'fr'),
      ),
    [actions],
  );

  const filterValues = useMemo(
    () => buildColumnFilterValues(actions, COL_GETTERS),
    [actions],
  );

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return actions.filter((a) => {
      for (const key of Object.keys(COL_GETTERS) as ColFilterKey[]) {
        if (!matchesColumnFilter(colFilters[key], COL_GETTERS[key](a))) return false;
      }
      if (!query) return true;
      return (
        a.action.toLowerCase().includes(query) ||
        a.owner.toLowerCase().includes(query) ||
        a.commentaire.toLowerCase().includes(query)
      );
    });
  }, [actions, q, colFilters]);

  const setColFilter = (key: ColFilterKey, next: string[]) => {
    setColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const openCreate = () => {
    setModalMode('create');
    setEditingId(null);
    setForm(emptyAuditHrActionInput());
    setModalOpen(true);
  };

  const openEdit = (a: AuditHrActionView) => {
    setModalMode('edit');
    setEditingId(a.id);
    setForm(inputFromAction(a));
    setModalOpen(true);
  };

  const openComplete = (a: AuditHrActionView) => {
    setModalMode('complete');
    setEditingId(a.id);
    setForm({
      ...inputFromAction(a),
      closingDate: a.closingDate || asOf,
      confirmationAudit: a.confirmationAudit || 'Oui',
    });
    setModalOpen(true);
  };

  const openView = (a: AuditHrActionView) => {
    setModalMode('view');
    setEditingId(a.id);
    setForm(inputFromAction(a));
    setModalOpen(true);
  };

  const saveModal = async () => {
    if (modalMode === 'view') {
      setModalOpen(false);
      return;
    }
    setSaving(true);
    try {
      if (modalMode === 'create') {
        const res = await fetch('/api/audit-hr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur');
        showSuccess('Action ajoutée');
      } else if (modalMode === 'complete' && editingId) {
        const res = await fetch(`/api/audit-hr/${encodeURIComponent(editingId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            complete: true,
            closingDate: form.closingDate || asOf,
            confirmationAudit: form.confirmationAudit,
            commentaire: form.commentaire,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur');
        showSuccess('Action clôturée');
      } else if (editingId) {
        const res = await fetch(`/api/audit-hr/${encodeURIComponent(editingId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erreur');
        showSuccess('Action mise à jour');
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const removeAction = async (a: AuditHrActionView) => {
    const ok = await confirmDelete(`Supprimer l’action « ${a.action.slice(0, 60)} » ?`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/audit-hr/${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Erreur');
      showSuccess('Action supprimée');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const patchActionField = async (a: AuditHrActionView, field: EditableField, value: string) => {
    if (!canEdit) return;
    const payload: AuditHrActionInput = {
      ...inputFromAction(a),
      [field]: value,
    };
    try {
      const res = await fetch(`/api/audit-hr/${encodeURIComponent(a.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      await load();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  const startInline = (a: AuditHrActionView, field: EditableField) => {
    if (!canEdit) return;
    const raw =
      field === 'issueCreationDate' || field === 'dueDate' || field === 'closingDate'
        ? a[field] || ''
        : String(a[field] ?? '');
    setInlineEdit({ id: a.id, field });
    setInlineValue(raw);
  };

  const commitInline = async (a: AuditHrActionView) => {
    if (!inlineEdit || inlineEdit.id !== a.id) return;
    const field = inlineEdit.field;
    const next = inlineValue;
    setInlineEdit(null);
    const prev =
      field === 'issueCreationDate' || field === 'dueDate' || field === 'closingDate'
        ? a[field] || ''
        : String(a[field] ?? '');
    if (next === prev) return;
    await patchActionField(a, field, next);
  };

  const exportFile = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/audit-hr/export?asOf=${encodeURIComponent(asOf)}`);
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Export impossible');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const el = document.createElement('a');
      el.href = url;
      el.download = `Audit_HR_${asOf}.xlsm`;
      el.click();
      URL.revokeObjectURL(url);
      showSuccess('Export téléchargé');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Erreur d’export');
    } finally {
      setExporting(false);
    }
  };

  const openContextMenu = (event: { preventDefault: () => void; clientX: number; clientY: number }, action: AuditHrActionView | null) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, action });
  };

  const contextItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    const a = contextMenu.action;
    const items: ContextMenuItem[] = [];
    if (a) {
      items.push({
        id: 'view',
        label: 'Voir',
        icon: 'view',
        onClick: () => openView(a),
      });
      if (canEdit) {
        items.push({
          id: 'edit',
          label: 'Modifier',
          icon: 'edit',
          onClick: () => openEdit(a),
        });
        if (a.status !== 'Closed') {
          items.push({
            id: 'complete',
            label: 'Compléter / clôturer',
            icon: 'doc',
            onClick: () => openComplete(a),
          });
        }
      }
      if (canDelete) {
        items.push({
          id: 'delete',
          label: 'Supprimer',
          icon: 'delete',
          danger: true,
          onClick: () => void removeAction(a),
        });
      }
    }
    if (canCreate) {
      items.push({
        id: 'add',
        label: 'Ajouter',
        icon: 'add',
        onClick: openCreate,
      });
    }
    return items;
  }, [contextMenu, canEdit, canDelete, canCreate]);

  const modalTitle =
    modalMode === 'create'
      ? 'Ajouter une action'
      : modalMode === 'complete'
        ? 'Compléter / clôturer'
        : modalMode === 'edit'
          ? 'Mettre à jour l’action'
          : 'Détail action';

  const readOnly = modalMode === 'view';
  const completeOnly = modalMode === 'complete';

  const renderEditable = (
    a: AuditHrActionView,
    field: EditableField,
    display: ReactNode,
    inputType: 'text' | 'date' | 'select' | 'textarea' = 'text',
    options?: string[],
  ) => {
    const editing = inlineEdit?.id === a.id && inlineEdit.field === field;
    if (editing) {
      if (inputType === 'select' && options) {
        return (
            <select
            ref={(el) => {
              inlineRef.current = el;
            }}
            className="audit-hr-inline-input"
            value={inlineValue}
            onChange={(e) => setInlineValue(e.target.value)}
            onBlur={() => void commitInline(a)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void commitInline(a);
              if (e.key === 'Escape') setInlineEdit(null);
            }}
          >
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        );
      }
      if (inputType === 'textarea') {
        return (
          <textarea
            ref={(el) => {
              inlineRef.current = el;
            }}
            className="audit-hr-inline-input"
            rows={2}
            value={inlineValue}
            onChange={(e) => setInlineValue(e.target.value)}
            onBlur={() => void commitInline(a)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setInlineEdit(null);
            }}
          />
        );
      }
      return (
        <input
          ref={(el) => {
            inlineRef.current = el;
          }}
          type={inputType}
          className="audit-hr-inline-input"
          value={inlineValue}
          onChange={(e) => setInlineValue(e.target.value)}
          onBlur={() => void commitInline(a)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void commitInline(a);
            if (e.key === 'Escape') setInlineEdit(null);
          }}
        />
      );
    }
    return (
      <div
        className={`audit-hr-cell${canEdit ? ' is-editable' : ''}`}
        onDoubleClick={() => startInline(a, field)}
        title={canEdit ? 'Double-clic pour modifier' : undefined}
      >
        {display}
      </div>
    );
  };

  return (
    <PermissionGate menuId="audit.points" action="view">
      <div className="audit-hr-page">
        <div className="audit-hr-sticky">
          <div className="page-header page-header-with-tabs audit-hr-header">
            <div className="audit-hr-header-left">
              <h2>Audit points</h2>
              <p>Suivi HR Audit — Dashboard + Actions (EXCO / Gouvernance)</p>
            </div>
            <div className="page-header-actions audit-hr-header-actions">
              <div className="tabs header-tabs header-tabs-compact audit-hr-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'dashboard'}
                  className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`}
                  onClick={() => setTab('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'actions'}
                  className={`tab-btn tab-btn-sm${tab === 'actions' ? ' active' : ''}`}
                  onClick={() => setTab('actions')}
                >
                  Actions
                </button>
              </div>
              <label className="audit-hr-asof">
                Progression au
                <input
                  type="date"
                  className="search-input"
                  value={asOf}
                  onChange={(e) => setAsOf(e.target.value)}
                />
              </label>
              <RefreshButton onClick={() => void load()} loading={loading} />
              {canExport && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={exporting}
                  onClick={() => void exportFile()}
                >
                  {exporting ? <span className="btn-spinner" /> : null}
                  Exporter
                </button>
              )}
            </div>
          </div>
        </div>

        {tab === 'dashboard' &&
          (dashboard ? (
            <AuditHrDashboardPanels dashboard={dashboard} />
          ) : (
            <div className="panel panel-padded">{loading ? 'Chargement…' : 'Aucune donnée'}</div>
          ))}

        {tab === 'actions' && (
          <div className="panel panel-padded audit-hr-actions-panel">
            <div className="audit-hr-actions-toolbar">
              <input
                className="search-input audit-hr-search"
                placeholder="Rechercher action, owner, commentaire…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              {canCreate && (
                <button type="button" className="btn btn-primary btn-sm" onClick={openCreate}>
                  + Ajouter
                </button>
              )}
            </div>

            <div
              className="audit-hr-table-wrap"
              onContextMenu={(e) => {
                if ((e.target as HTMLElement).closest('tr[data-row]')) return;
                openContextMenu(e, null);
              }}
            >
              <table className="data-table audit-hr-table">
                <thead>
                  <tr>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Owner"
                        values={filterValues.owner}
                        selected={colFilters.owner}
                        onChange={(next) => setColFilter('owner', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Action"
                        values={filterValues.action}
                        selected={colFilters.action}
                        onChange={(next) => setColFilter('action', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Issue"
                        values={filterValues.issue}
                        selected={colFilters.issue}
                        onChange={(next) => setColFilter('issue', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Due"
                        values={filterValues.due}
                        selected={colFilters.due}
                        onChange={(next) => setColFilter('due', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Close"
                        values={filterValues.close}
                        selected={colFilters.close}
                        onChange={(next) => setColFilter('close', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="J+"
                        values={filterValues.days}
                        selected={colFilters.days}
                        onChange={(next) => setColFilter('days', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Status"
                        values={filterValues.status}
                        selected={colFilters.status}
                        onChange={(next) => setColFilter('status', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Conf."
                        values={filterValues.confirmation}
                        selected={colFilters.confirmation}
                        onChange={(next) => setColFilter('confirmation', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Sev."
                        values={filterValues.severity}
                        selected={colFilters.severity}
                        onChange={(next) => setColFilter('severity', next)}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Commentaire"
                        values={filterValues.commentaire}
                        selected={colFilters.commentaire}
                        onChange={(next) => setColFilter('commentaire', next)}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={10} className="text-muted">
                        Chargement…
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    filtered.map((a) => (
                      <tr
                        key={a.id}
                        data-row
                        onContextMenu={(e) => openContextMenu(e, a)}
                      >
                        <td className="audit-hr-owner-cell">
                          {renderEditable(a, 'owner', a.owner || '—')}
                        </td>
                        <td className="audit-hr-action-cell">
                          {renderEditable(
                            a,
                            'action',
                            <button type="button" className="linkish" onClick={() => openView(a)}>
                              {a.action}
                            </button>,
                            'textarea',
                          )}
                        </td>
                        <td>
                          {renderEditable(
                            a,
                            'issueCreationDate',
                            formatAuditDateFr(a.issueCreationDate) || '—',
                            'date',
                          )}
                        </td>
                        <td>
                          {renderEditable(
                            a,
                            'dueDate',
                            formatAuditDateFr(a.dueDate) || '—',
                            'date',
                          )}
                        </td>
                        <td>
                          {renderEditable(
                            a,
                            'closingDate',
                            formatAuditDateFr(a.closingDate) || '—',
                            'date',
                          )}
                        </td>
                        <td>{a.daysOverdue ?? '—'}</td>
                        <td>
                          <span className={statusClass(a.status)}>{a.status}</span>
                        </td>
                        <td>
                          {renderEditable(
                            a,
                            'confirmationAudit',
                            a.confirmationAudit,
                            'select',
                            [...AUDIT_HR_CONFIRMATIONS],
                          )}
                        </td>
                        <td>
                          {renderEditable(
                            a,
                            'severity',
                            <span className={severityClass(a.severity)}>{a.severity}</span>,
                            'select',
                            [...AUDIT_HR_SEVERITIES],
                          )}
                        </td>
                        <td className="audit-hr-comment">
                          {renderEditable(
                            a,
                            'commentaire',
                            a.commentaire || '—',
                            'textarea',
                          )}
                        </td>
                      </tr>
                    ))}
                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-muted">
                        Aucune action
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {contextMenu && contextItems.length > 0 && (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextItems}
            onClose={() => setContextMenu(null)}
          />
        )}

        {modalOpen && (
          <div className="modal-backdrop" onClick={() => !saving && setModalOpen(false)}>
            <div className="modal modal-form audit-hr-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{modalTitle}</h2>
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  <label className="form-group">
                    <span>Owner</span>
                    <input
                      list="audit-hr-owners"
                      disabled={readOnly || completeOnly}
                      value={form.owner}
                      onChange={(e) => setForm((f) => ({ ...f, owner: e.target.value }))}
                    />
                    <datalist id="audit-hr-owners">
                      {owners.map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  </label>
                  <label className="form-group">
                    <span>Severity</span>
                    <select
                      disabled={readOnly || completeOnly}
                      value={form.severity || 'Medium'}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          severity: e.target.value as AuditHrSeverity,
                        }))
                      }
                    >
                      {AUDIT_HR_SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group form-group-full">
                    <span>Action</span>
                    <textarea
                      rows={3}
                      disabled={readOnly || completeOnly}
                      value={form.action}
                      onChange={(e) => setForm((f) => ({ ...f, action: e.target.value }))}
                    />
                  </label>
                  <label className="form-group">
                    <span>Issue creation date</span>
                    <input
                      type="date"
                      disabled={readOnly || completeOnly}
                      value={form.issueCreationDate || ''}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, issueCreationDate: e.target.value }))
                      }
                    />
                  </label>
                  <label className="form-group">
                    <span>Due date</span>
                    <input
                      type="date"
                      disabled={readOnly || completeOnly}
                      value={form.dueDate || ''}
                      onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                    />
                  </label>
                  <label className="form-group">
                    <span>Closing date</span>
                    <input
                      type="date"
                      disabled={readOnly && !completeOnly}
                      value={form.closingDate || ''}
                      onChange={(e) => setForm((f) => ({ ...f, closingDate: e.target.value }))}
                    />
                  </label>
                  <label className="form-group">
                    <span>Confirmation audit</span>
                    <select
                      disabled={readOnly && !completeOnly}
                      value={form.confirmationAudit || 'Non'}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          confirmationAudit: e.target.value as AuditHrConfirmation,
                        }))
                      }
                    >
                      {AUDIT_HR_CONFIRMATIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-group form-group-full">
                    <span>Commentaire</span>
                    <textarea
                      rows={3}
                      disabled={readOnly && !completeOnly}
                      value={form.commentaire || ''}
                      onChange={(e) => setForm((f) => ({ ...f, commentaire: e.target.value }))}
                    />
                  </label>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={saving}
                  onClick={() => setModalOpen(false)}
                >
                  {modalMode === 'view' ? 'Fermer' : 'Annuler'}
                </button>
                {modalMode !== 'view' && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => void saveModal()}
                  >
                    {saving ? <span className="btn-spinner" /> : null}
                    {modalMode === 'complete'
                      ? 'Clôturer'
                      : modalMode === 'create'
                        ? 'Ajouter'
                        : 'Enregistrer'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}
