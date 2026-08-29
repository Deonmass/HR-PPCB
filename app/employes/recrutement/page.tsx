'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  RECRUITMENT_BUDGETED,
  RECRUITMENT_CATEGORIES,
  RECRUITMENT_CONTRACTS,
  RECRUITMENT_STATUSES,
  formatDisplayDate,
  parseSlotsFromPosition,
  type RecrutementBundle,
  type RecrutementCatalogOption,
  type RecrutementCategory,
  type RecrutementDashboard,
  type RecrutementInput,
  type RecrutementRowEnriched,
} from '@/lib/recrutement-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import { useI18n } from '@/contexts/LocaleContext';
import type { MessageKey } from '@/lib/i18n';

type ModalMode = 'create' | 'edit' | 'view';
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function drillColumns(t: Translate): DashboardListColumn[] {
  return [
    { key: 'position', label: t('rec.col.position') },
    { key: 'status', label: t('rec.col.status') },
    { key: 'department', label: t('rec.col.department') },
    { key: 'location', label: t('rec.col.location') },
    { key: 'dates', label: t('rec.col.dates') },
    { key: 'catalogue', label: t('rec.col.catalogue') },
  ];
}

function statusLabel(status: string, t: Translate): string {
  switch (String(status).toLowerCase()) {
    case 'done':
      return t('rec.status.done');
    case 'ongoing':
      return t('rec.status.ongoing');
    case 'started':
      return t('rec.status.started');
    case 'not started':
      return t('rec.status.notStarted');
    default:
      return status;
  }
}

function budgetedLabel(value: string, t: Translate): string {
  const v = String(value).toLowerCase();
  if (v === 'yes' || v === 'oui') return t('rec.budgeted.yes');
  if (v === 'no' || v === 'non') return t('rec.budgeted.no');
  return value || '—';
}

function contractLabel(value: string, t: Translate): string {
  const v = String(value).toLowerCase();
  if (v === 'permanent') return t('rec.contract.permanent');
  if (v === 'outsourced') return t('rec.contract.outsourced');
  return value || '—';
}

function recCategoryLabel(category: RecrutementCategory, t: Translate): string {
  return category === 'replacement' ? t('rec.category.replacement') : t('rec.category.new');
}

const EMPTY_FORM: RecrutementInput = {
  category: 'new',
  position: '',
  grade: '',
  status: 'Not started',
  comments: '',
  budgeted: 'Yes',
  department: '',
  location: '',
  contractType: 'Permanent',
  filledAt: '',
};

function rowToCells(row: RecrutementRowEnriched, t: Translate): DashboardListRow {
  return {
    id: row.id,
    cells: {
      position: row.position,
      status: statusLabel(row.status, t),
      department: row.department || '—',
      location: row.location || '—',
      dates: row.recruitmentDates.map(formatDisplayDate).join(', ') || '—',
      catalogue: row.catalogTitle || '—',
    },
  };
}

function statusClass(status: string): string {
  switch (String(status).toLowerCase()) {
    case 'done':
      return 'rec-status-done';
    case 'ongoing':
      return 'rec-status-ongoing';
    case 'started':
      return 'rec-status-started';
    default:
      return 'rec-status-wait';
  }
}

function datesLabel(row: RecrutementRowEnriched, t: Translate): string {
  if (!row.recruitmentDates.length) return '';
  const shown = row.recruitmentDates.map(formatDisplayDate);
  return t('rec.recruitedOn', { dates: shown.join(', ') });
}

function formFromRow(row: RecrutementRowEnriched): RecrutementInput {
  return {
    category: row.category,
    position: row.position,
    grade: row.grade,
    status: row.status,
    comments: row.comments,
    budgeted: row.budgeted,
    department: row.department,
    location: row.location,
    contractType: row.contractType,
    filledAt: row.filledAt || row.recruitmentDates[0] || '',
  };
}

function RecrutementModal({
  mode,
  form,
  catalog,
  preview,
  saving,
  onChange,
  onPickCatalog,
  onClose,
  onSubmit,
  onEditFromView,
}: {
  mode: ModalMode;
  form: RecrutementInput;
  catalog: RecrutementCatalogOption[];
  preview: RecrutementRowEnriched | null;
  saving: boolean;
  onChange: (next: RecrutementInput) => void;
  onPickCatalog: (option: RecrutementCatalogOption) => void;
  onClose: () => void;
  onSubmit: () => void;
  onEditFromView?: () => void;
}) {
  const { t } = useI18n();
  const readOnly = mode === 'view';
  const title =
    mode === 'create' ? t('rec.modal.create') : mode === 'edit' ? t('rec.modal.edit') : t('rec.modal.view');
  const query = form.position.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return catalog.slice(0, 8);
    return catalog.filter((c) => c.title.toLowerCase().includes(query)).slice(0, 8);
  }, [catalog, query]);

  return (
    <div className="modal-overlay open" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg mvt-modal rec-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="mvt-form-grid">
            <label className="form-field">
              <span>{t('rec.category')} *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{recCategoryLabel(form.category, t)}</div>
              ) : (
                <select
                  value={form.category}
                  onChange={(e) =>
                    onChange({ ...form, category: e.target.value as RecrutementCategory })
                  }
                >
                  {RECRUITMENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {recCategoryLabel(c, t)}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="form-field">
              <span>{t('rec.col.status')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{statusLabel(form.status || '', t) || '—'}</div>
              ) : (
                <select
                  value={form.status}
                  onChange={(e) => onChange({ ...form, status: e.target.value })}
                >
                  {RECRUITMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {statusLabel(s, t)}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="form-field form-field-span-2">
              <span>{t('rec.position')} *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">
                  <strong>{form.position || '—'}</strong>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    list="rec-poste-catalog"
                    value={form.position}
                    onChange={(e) => {
                      const position = e.target.value;
                      const hit = catalog.find(
                        (c) => c.title.toLowerCase() === position.trim().toLowerCase(),
                      );
                      if (hit) onPickCatalog(hit);
                      else onChange({ ...form, position });
                    }}
                    placeholder={t('rec.positionPlaceholder')}
                    required
                  />
                  <datalist id="rec-poste-catalog">
                    {catalog.map((c) => (
                      <option key={`${c.source}-${c.title}`} value={c.title} />
                    ))}
                  </datalist>
                  {suggestions.length > 0 && form.position && !catalog.some((c) => c.title.toLowerCase() === query) ? (
                    <div className="rec-suggest-list">
                      {suggestions.map((c) => (
                        <button
                          key={`${c.source}-${c.title}`}
                          type="button"
                          className="rec-suggest-item"
                          onClick={() => onPickCatalog(c)}
                        >
                          <strong>{c.title}</strong>
                          <span>
                            {[c.department, c.location, c.grade]
                              .filter(Boolean)
                              .join(' · ') || (c.source === 'vacant' ? t('rec.vacant') : t('rec.catalogue'))}
                            {c.occupants
                              ? ` · ${t(c.occupants === 1 ? 'rec.occupants' : 'rec.occupantsPlural', { count: c.occupants })}`
                              : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              )}
            </label>

            <label className="form-field">
              <span>{t('rec.col.grade')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.grade || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.grade}
                  onChange={(e) => onChange({ ...form, grade: e.target.value })}
                />
              )}
            </label>
            <label className="form-field">
              <span>{t('rec.col.department')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.department || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.department}
                  onChange={(e) => onChange({ ...form, department: e.target.value })}
                />
              )}
            </label>
            <label className="form-field">
              <span>{t('rec.col.location')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.location || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => onChange({ ...form, location: e.target.value })}
                />
              )}
            </label>
            <label className="form-field">
              <span>{t('rec.col.budgeted')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{budgetedLabel(form.budgeted || '', t)}</div>
              ) : (
                <select
                  value={form.budgeted}
                  onChange={(e) => onChange({ ...form, budgeted: e.target.value })}
                >
                  {RECRUITMENT_BUDGETED.map((v) => (
                    <option key={v} value={v}>
                      {budgetedLabel(v, t)}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="form-field">
              <span>{t('rec.col.contract')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{contractLabel(form.contractType || '', t)}</div>
              ) : (
                <select
                  value={form.contractType}
                  onChange={(e) => onChange({ ...form, contractType: e.target.value })}
                >
                  {RECRUITMENT_CONTRACTS.map((v) => (
                    <option key={v} value={v}>
                      {contractLabel(v, t)}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label className="form-field">
              <span>{t('rec.filledAt')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">
                  {form.filledAt ? formatDisplayDate(form.filledAt) : '—'}
                </div>
              ) : (
                <input
                  type="date"
                  value={form.filledAt || ''}
                  onChange={(e) => onChange({ ...form, filledAt: e.target.value })}
                />
              )}
            </label>
            <label className="form-field form-field-span-2">
              <span>{t('rec.col.comments')}</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.comments || '—'}</div>
              ) : (
                <textarea
                  rows={3}
                  value={form.comments}
                  onChange={(e) => onChange({ ...form, comments: e.target.value })}
                />
              )}
            </label>
          </div>

          {preview?.catalogMatch || preview?.occupants.length ? (
            <div className="rec-match-panel">
              <div className="rec-match-head">
                <strong>{t('rec.catalogLink')}</strong>
                {preview.catalogTitle ? (
                  <Link href={`/employes/postes?q=${encodeURIComponent(preview.catalogTitle)}`}>
                    {t('rec.seeCatalog', { title: preview.catalogTitle })}
                  </Link>
                ) : null}
              </div>
              {preview.occupants.length > 0 ? (
                <ul className="rec-occupant-list">
                  {preview.occupants.map((o) => (
                    <li key={o.matricule}>
                      <strong>{o.nom}</strong>
                      <span>
                        {o.matricule}
                        {o.localisation ? ` · ${o.localisation}` : ''}
                        {o.appointmentIso
                          ? ` · ${t('rec.recruitedOn', { dates: formatDisplayDate(o.appointmentIso) })}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rec-match-empty">{t('rec.noOccupant')}</p>
              )}
              {preview.suggestedStatus && preview.suggestedStatus !== form.status ? (
                <p className="rec-match-hint">
                  {t('rec.suggestion', { status: statusLabel(preview.suggestedStatus, t) })}
                  {preview.occupants.length
                    ? ` (${preview.occupants.length}/${preview.slots})`
                    : ''}
                  .
                  {!readOnly ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() =>
                        onChange({
                          ...form,
                          status: preview.suggestedStatus,
                          filledAt: form.filledAt || preview.recruitmentDates[0] || '',
                        })
                      }
                    >
                      {t('rec.apply')}
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
        <div className="modal-footer">
          {mode === 'view' ? (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                {t('common.close')}
              </button>
              {onEditFromView ? (
                <button type="button" className="btn btn-primary" onClick={onEditFromView}>
                  {t('common.edit')}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                {t('common.cancel')}
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={onSubmit}>
                {saving ? t('common.saving') : mode === 'edit' ? t('common.save') : t('common.add')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function RecTable({
  rows,
  canEdit,
  onOpen,
  onContext,
}: {
  rows: RecrutementRowEnriched[];
  canEdit: boolean;
  onOpen: (row: RecrutementRowEnriched, mode: ModalMode) => void;
  onContext: (e: ReactMouseEvent, row: RecrutementRowEnriched) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="table-wrap rec-table-wrap">
      <table className="data-table rec-table">
        <thead>
          <tr>
            <th>{t('rec.col.position')}</th>
            <th>{t('rec.col.grade')}</th>
            <th>{t('rec.col.status')}</th>
            <th>{t('rec.col.comments')}</th>
            <th>{t('rec.col.budgeted')}</th>
            <th>{t('rec.col.department')}</th>
            <th>{t('rec.col.location')}</th>
            <th>{t('rec.col.contract')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="empty-state">
                {t('rec.empty')}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={row.id}
                className={`${canEdit ? 'has-context-menu' : ''}${row.filledInAugust ? ' rec-row-filled' : ''}`}
                onDoubleClick={() => onOpen(row, canEdit ? 'edit' : 'view')}
                onContextMenu={(e) => onContext(e, row)}
              >
                <td>
                  <div className="rec-pos-cell">
                    <strong>{row.position}</strong>
                    {row.filledInAugust || row.recruitmentDates.length ? (
                      <span className={`rec-chip${row.filledInAugust ? ' rec-chip-august' : ''}`}>
                        {datesLabel(row, t)}
                      </span>
                    ) : null}
                    {row.catalogMatch ? (
                      <Link
                        className="rec-chip rec-chip-match"
                        href={`/employes/postes?q=${encodeURIComponent(row.catalogTitle)}`}
                        onClick={(e) => e.stopPropagation()}
                        title={t('rec.seeInCatalog')}
                      >
                        {row.catalogTitle}
                        {row.occupants.length
                          ? ` · ${t(row.occupants.length === 1 ? 'rec.occupants' : 'rec.occupantsPlural', { count: row.occupants.length })}`
                          : ''}
                      </Link>
                    ) : null}
                  </div>
                </td>
                <td>{row.grade || '—'}</td>
                <td>
                  <span className={`rec-status ${statusClass(row.status)}`}>{statusLabel(row.status, t)}</span>
                </td>
                <td className="rec-comments">{row.comments || '—'}</td>
                <td>{budgetedLabel(row.budgeted || '', t)}</td>
                <td>{row.department || '—'}</td>
                <td>{row.location || '—'}</td>
                <td>{contractLabel(row.contractType || '', t)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function RecrutementPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const { t } = useI18n();
  const canCreate =
    can('employes.recrutement', 'create')
    || can('employes.recrutement', 'edit')
    || can('employes.postes', 'create')
    || can('employes.postes', 'edit');
  const canEdit = can('employes.recrutement', 'edit') || can('employes.postes', 'edit');
  const canDelete = can('employes.recrutement', 'delete') || can('employes.postes', 'delete');

  const [bundle, setBundle] = useState<RecrutementBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<RecrutementCategory>('replacement');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [form, setForm] = useState<RecrutementInput>(EMPTY_FORM);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: RecrutementRowEnriched } | null>(
    null,
  );
  const [drill, setDrill] = useState<{ title: string; rows: DashboardListRow[] } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/employes/recrutement');
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || t('rec.loadError'));
        setBundle(null);
      } else {
        setBundle(json as RecrutementBundle);
      }
    } catch {
      await showError(t('common.loadError'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = bundle?.rows || [];
  const dashboard: RecrutementDashboard | null = bundle?.dashboard ?? null;
  const catalog = bundle?.catalog || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.position, r.grade, r.status, r.comments, r.department, r.location, r.contractType, r.catalogTitle]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const replacements = filtered.filter((r) => r.category === 'replacement');
  const newPositions = filtered.filter((r) => r.category === 'new');
  const tabRows = activeTab === 'replacement' ? replacements : newPositions;

  const activeRow = rows.find((r) => r.id === activeId) || null;
  const preview = useMemo(() => {
    if (activeRow && modalMode !== 'create') return activeRow;
    const position = form.position.trim();
    if (!position) return null;
    const hit = catalog.find((c) => c.title.toLowerCase() === position.toLowerCase());
    if (!hit && !activeRow) return null;
    if (activeRow) return activeRow;
    return {
      ...form,
      id: 'preview',
      createdAt: '',
      updatedAt: '',
      slots: parseSlotsFromPosition(form.position).slots,
      catalogTitle: hit?.title || '',
      catalogMatch: Boolean(hit),
      occupants: [],
      vacantHeadcount: hit?.source === 'vacant' ? 1 : 0,
      recruitmentDates: form.filledAt ? [form.filledAt] : [],
      filledInAugust: Boolean(form.filledAt?.startsWith('2026-08')),
      suggestedStatus: '',
      category: form.category,
      grade: form.grade || '',
      status: form.status || '',
      comments: form.comments || '',
      budgeted: form.budgeted || '',
      department: form.department || '',
      location: form.location || '',
      contractType: form.contractType || '',
    } as RecrutementRowEnriched;
  }, [activeRow, catalog, form, modalMode]);

  const openCreate = (category: RecrutementCategory = 'new') => {
    setActiveId(null);
    setForm({ ...EMPTY_FORM, category });
    setModalMode('create');
    setModalOpen(true);
  };

  const openRow = (row: RecrutementRowEnriched, mode: ModalMode) => {
    setActiveId(row.id);
    setForm(formFromRow(row));
    setModalMode(mode);
    setModalOpen(true);
  };

  const pickCatalog = (option: RecrutementCatalogOption) => {
    setForm((prev) => ({
      ...prev,
      position: option.title,
      grade: prev.grade || option.grade,
      department: prev.department || option.department,
      location: prev.location || option.location,
      status: modalMode === 'create' && option.occupants > 0 ? 'Done' : prev.status,
    }));
  };

  const submit = async () => {
    if (!form.position.trim()) {
      await showError(t('rec.positionRequired'));
      return;
    }
    setSaving(true);
    try {
      const isEdit = modalMode === 'edit' && activeId;
      const res = await fetch(
        isEdit ? `/api/employes/recrutement/${encodeURIComponent(activeId!)}` : '/api/employes/recrutement',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || t('rec.saveError'));
        return;
      }
      await showSuccess(isEdit ? t('rec.updated') : t('rec.saved'));
      setModalOpen(false);
      setActiveId(null);
      await load(true);
    } catch {
      await showError(t('rec.saveException'));
    } finally {
      setSaving(false);
    }
  };

  const removeRow = async (row: RecrutementRowEnriched) => {
    const ok = await confirmDelete(t('rec.deleteConfirm'), row.position);
    if (!ok) return;
    try {
      const res = await fetch(`/api/employes/recrutement/${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || t('rec.deleteError'));
        return;
      }
      await showSuccess(t('rec.deleted'));
      await load(true);
    } catch {
      await showError(t('rec.deleteException'));
    }
  };

  const openDrill = (title: string, predicate: (r: RecrutementRowEnriched) => boolean) => {
    setDrill({
      title,
      rows: rows.filter(predicate).map((r) => rowToCells(r, t)),
    });
  };

  const contextItems: ContextMenuItem[] = contextMenu
    ? [
        { id: 'view', label: t('common.view'), icon: 'view', onClick: () => openRow(contextMenu.item, 'view') },
        ...(canEdit
          ? [{ id: 'edit', label: t('common.edit'), icon: 'edit' as const, onClick: () => openRow(contextMenu.item, 'edit') }]
          : []),
        ...(contextMenu.item.catalogTitle
          ? [
              {
                id: 'poste',
                label: t('rec.openPoste'),
                icon: 'doc' as const,
                onClick: () =>
                  router.push(`/employes/postes?q=${encodeURIComponent(contextMenu.item.catalogTitle)}`),
              },
            ]
          : []),
        ...(canDelete
          ? [
              {
                id: 'delete',
                label: t('common.delete'),
                icon: 'delete' as const,
                danger: true,
                onClick: () => {
                  void removeRow(contextMenu.item);
                },
              },
            ]
          : []),
      ]
    : [];

  if (loading) {
    return (
      <PermissionGate
        anyOf={[
          { menuId: 'employes.recrutement', action: 'view' },
          { menuId: 'employes.postes', action: 'view' },
          { menuId: 'employes.liste', action: 'view' },
        ]}
      >
        <div className="loading">{t('rec.loading')}</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'employes.recrutement', action: 'view' },
        { menuId: 'employes.postes', action: 'view' },
        { menuId: 'employes.liste', action: 'view' },
      ]}
    >
      <div className="mvt-page rec-page">
        <div className="page-header mvt-page-header">
          <div>
            <div className="page-header-title-row">
              <h2>{t('rec.title')}</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p className="mvt-page-sub">
              {t('rec.subtitle')}
              <span className="mvt-count-pill">
                {filtered.length}
                {filtered.length !== rows.length ? ` / ${rows.length}` : ''}
              </span>
            </p>
          </div>
          <div className="page-header-actions mvt-header-actions">
            {canCreate ? (
              <button type="button" className="btn btn-primary btn-sm mvt-primary-btn" onClick={() => openCreate(activeTab)}>
                {t('common.add')}
              </button>
            ) : null}
          </div>
        </div>

        {dashboard ? (
          <div className="travel-history-cards mvt-kpi-strip postes-kpi-strip rec-kpi-strip">
            <button
              type="button"
              className="card card-glow card-glow-red travel-history-card postes-kpi-card"
              title={t('rec.drill.all')}
              onClick={() => openDrill(t('rec.drill.all'), () => true)}
            >
              <div className="card-label">{t('rec.kpi.total')}</div>
              <div className="card-value">{dashboard.total}</div>
            </button>
            <button
              type="button"
              className="card card-glow card-glow-cyan travel-history-card postes-kpi-card"
              title={t('rec.drill.replacements')}
              onClick={() => {
                setActiveTab('replacement');
                openDrill(t('rec.drill.replacements'), (r) => r.category === 'replacement');
              }}
            >
              <div className="card-label">{t('rec.kpi.replacements')}</div>
              <div className="card-value">{dashboard.replacements}</div>
            </button>
            <button
              type="button"
              className="card card-glow card-glow-violet travel-history-card postes-kpi-card"
              title={t('rec.drill.newPositions')}
              onClick={() => {
                setActiveTab('new');
                openDrill(t('rec.drill.newPositions'), (r) => r.category === 'new');
              }}
            >
              <div className="card-label">{t('rec.kpi.newPositions')}</div>
              <div className="card-value">{dashboard.newPositions}</div>
            </button>
            <button
              type="button"
              className="card card-glow card-glow-amber travel-history-card postes-kpi-card"
              title={t('rec.drill.ongoing')}
              onClick={() =>
                openDrill(t('rec.drill.ongoing'), (r) => r.status.toLowerCase() === 'ongoing')
              }
            >
              <div className="card-label">{t('rec.kpi.ongoing')}</div>
              <div className="card-value">{dashboard.ongoing}</div>
            </button>
            <button
              type="button"
              className="card card-glow card-glow-green travel-history-card postes-kpi-card"
              title={t('rec.drill.done')}
              onClick={() => openDrill(t('rec.drill.done'), (r) => r.status.toLowerCase() === 'done')}
            >
              <div className="card-label">{t('rec.kpi.done')}</div>
              <div className="card-value">{dashboard.done}</div>
            </button>
            <button
              type="button"
              className="card card-glow card-glow-red travel-history-card postes-kpi-card"
              title={t('rec.drill.august')}
              onClick={() =>
                openDrill(t('rec.drill.august'), (r) => r.filledInAugust)
              }
            >
              <div className="card-label">{t('rec.kpi.filledAugust')}</div>
              <div className="card-value">{dashboard.filledAugust}</div>
            </button>
          </div>
        ) : null}

        <div className="mvt-toolbar">
          <label className="mvt-search">
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
              <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
              <path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            <input
              type="search"
              placeholder={t('rec.searchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search ? (
              <button type="button" className="mvt-search-clear" onClick={() => setSearch('')}>
                ×
              </button>
            ) : null}
          </label>
        </div>

        <section className="exco-panel rec-table-card rec-tabs-card">
          <div className="rec-tabs" role="tablist" aria-label={t('rec.title')}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'replacement'}
              className={`rec-tab${activeTab === 'replacement' ? ' active' : ''}`}
              onClick={() => setActiveTab('replacement')}
            >
              {t('rec.tab.replacements')}
              <span className="rec-tab-count">{replacements.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'new'}
              className={`rec-tab${activeTab === 'new' ? ' active' : ''}`}
              onClick={() => setActiveTab('new')}
            >
              {t('rec.tab.newPositions')}
              <span className="rec-tab-count">{newPositions.length}</span>
            </button>
            <span className="rec-tab-meta">
              {t(tabRows.length === 1 ? 'rec.rows' : 'rec.rowsPlural', { count: tabRows.length })}
            </span>
          </div>
          <RecTable
            rows={tabRows}
            canEdit={canEdit || canCreate}
            onOpen={openRow}
            onContext={(e, row) => {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, item: row });
            }}
          />
        </section>

        {modalOpen ? (
          <RecrutementModal
            mode={modalMode}
            form={form}
            catalog={catalog}
            preview={preview}
            saving={saving}
            onChange={setForm}
            onPickCatalog={pickCatalog}
            onClose={() => {
              if (!saving) {
                setModalOpen(false);
                setActiveId(null);
              }
            }}
            onSubmit={() => {
              void submit();
            }}
            onEditFromView={
              canEdit && activeRow
                ? () => {
                    setModalMode('edit');
                  }
                : undefined
            }
          />
        ) : null}

        {contextMenu ? (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextItems}
            onClose={() => setContextMenu(null)}
          />
        ) : null}

        {drill ? (
          <DashboardListModal
            title={drill.title}
            columns={drillColumns(t)}
            rows={drill.rows}
            onClose={() => setDrill(null)}
          />
        ) : null}
      </div>
    </PermissionGate>
  );
}
