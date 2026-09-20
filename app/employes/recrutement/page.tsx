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
import RecrutementExportMenu from '@/components/recrutement/RecrutementExportMenu';
import RecrutementDashboardView from '@/components/recrutement/RecrutementDashboardView';
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
  type RecrutementInput,
  type RecrutementRowEnriched,
} from '@/lib/recrutement-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import { useI18n } from '@/contexts/LocaleContext';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import { localizeJobTitle } from '@/lib/bilingual-title';
import {
  countRecrutementByZone,
  filterRecrutementByZone,
  sortRecrutementByLocation,
  type RecrutementLocationZone,
} from '@/lib/recrutement-location-groups';
import type { MessageKey } from '@/lib/i18n';

type ModalMode = 'create' | 'edit' | 'view';
type PageTab = 'dashboard' | 'replacement' | 'new';
type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

type RecColKey =
  | 'position'
  | 'grade'
  | 'status'
  | 'comments'
  | 'budgeted'
  | 'department'
  | 'location'
  | 'contract';

const EMPTY_REC_FILTERS: Record<RecColKey, string[]> = {
  position: [],
  grade: [],
  status: [],
  comments: [],
  budgeted: [],
  department: [],
  location: [],
  contract: [],
};

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
  const s = String(status).toLowerCase();
  if (/cancel/.test(s)) return t('rec.status.cancelled');
  switch (s) {
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
  if (v === 'fixed-term' || v === 'fixed term' || /durée|duree|détermin|determin/.test(v)) {
    return t('rec.contract.fixedTerm');
  }
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
  const { t, locale } = useI18n();
  const readOnly = mode === 'view';
  const title =
    mode === 'create' ? t('rec.modal.create') : mode === 'edit' ? t('rec.modal.edit') : t('rec.modal.view');
  const query = form.position.trim().toLowerCase();
  const suggestions = useMemo(() => {
    if (!query) return catalog.slice(0, 8);
    return catalog
      .filter((c) => {
        const localized = localizeJobTitle(c.title, locale).toLowerCase();
        return c.title.toLowerCase().includes(query) || localized.includes(query);
      })
      .slice(0, 8);
  }, [catalog, query, locale]);

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
                  <strong>{localizeJobTitle(form.position, locale) || form.position || '—'}</strong>
                </div>
              ) : (
                <>
                  <input
                    type="text"
                    list="rec-poste-catalog"
                    value={form.position}
                    onChange={(e) => {
                      const position = e.target.value;
                      const hit = catalog.find((c) => {
                        const raw = c.title.toLowerCase();
                        const loc = localizeJobTitle(c.title, locale).toLowerCase();
                        const q = position.trim().toLowerCase();
                        return raw === q || loc === q;
                      });
                      if (hit) onPickCatalog(hit);
                      else onChange({ ...form, position });
                    }}
                    placeholder={t('rec.positionPlaceholder')}
                    required
                  />
                  <datalist id="rec-poste-catalog">
                    {catalog.map((c) => (
                      <option
                        key={`${c.source}-${c.title}`}
                        value={c.title}
                        label={localizeJobTitle(c.title, locale)}
                      />
                    ))}
                  </datalist>
                  {suggestions.length > 0 && form.position && !catalog.some((c) => {
                    const q = query;
                    return (
                      c.title.toLowerCase() === q
                      || localizeJobTitle(c.title, locale).toLowerCase() === q
                    );
                  }) ? (
                    <div className="rec-suggest-list">
                      {suggestions.map((c) => (
                        <button
                          key={`${c.source}-${c.title}`}
                          type="button"
                          className="rec-suggest-item"
                          onClick={() => onPickCatalog(c)}
                        >
                          <strong>{localizeJobTitle(c.title, locale)}</strong>
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
                  <Link href={`/employes/classification?q=${encodeURIComponent(preview.catalogTitle)}`}>
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
  const { t, locale } = useI18n();
  const unset = t('rec.unset');
  const [colFilters, setColFilters] = useState(EMPTY_REC_FILTERS);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(rows, {
        position: (r) => localizeJobTitle(r.position, locale),
        grade: (r) => r.grade,
        status: (r) => statusLabel(r.status, t),
        comments: (r) => r.comments,
        budgeted: (r) => budgetedLabel(r.budgeted || '', t),
        department: (r) => r.department,
        location: (r) => (r.location || '').trim() || unset,
        contract: (r) => contractLabel(r.contractType || '', t),
      }),
    [rows, locale, t, unset],
  );

  const filteredRows = useMemo(
    () =>
      rows.filter(
        (r) =>
          matchesColumnFilter(colFilters.position, localizeJobTitle(r.position, locale)) &&
          matchesColumnFilter(colFilters.grade, r.grade) &&
          matchesColumnFilter(colFilters.status, statusLabel(r.status, t)) &&
          matchesColumnFilter(colFilters.comments, r.comments) &&
          matchesColumnFilter(colFilters.budgeted, budgetedLabel(r.budgeted || '', t)) &&
          matchesColumnFilter(colFilters.department, r.department) &&
          matchesColumnFilter(colFilters.location, (r.location || '').trim() || unset) &&
          matchesColumnFilter(colFilters.contract, contractLabel(r.contractType || '', t)),
      ),
    [rows, colFilters, locale, t, unset],
  );

  const activeFilterCount = countActiveColumnFilters(colFilters);
  const sortedRows = sortRecrutementByLocation(filteredRows);

  return (
    <div className="rec-table-shell">
      {activeFilterCount > 0 ? (
        <div className="rec-table-filter-bar">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setColFilters(EMPTY_REC_FILTERS)}
          >
            {t('rec.clearFilters', { count: activeFilterCount })}
          </button>
          <span className="rec-tab-meta">
            {t(filteredRows.length === 1 ? 'rec.rows' : 'rec.rowsPlural', {
              count: filteredRows.length,
            })}
          </span>
        </div>
      ) : null}
      <div className="table-wrap rec-table-wrap">
        <table className="data-table rec-table">
          <thead>
            <tr>
              {(
                [
                  ['position', t('rec.col.position')],
                  ['grade', t('rec.col.grade')],
                  ['status', t('rec.col.status')],
                  ['comments', t('rec.col.comments')],
                  ['budgeted', t('rec.col.budgeted')],
                  ['department', t('rec.col.department')],
                  ['location', t('rec.col.location')],
                  ['contract', t('rec.col.contract')],
                ] as const
              ).map(([key, label]) => (
                <th key={key} className="th-filter">
                  <TableHeaderFilter
                    label={label}
                    values={filterValues[key]}
                    selected={colFilters[key]}
                    onChange={(next) => setColFilters((p) => ({ ...p, [key]: next }))}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-state">
                  {t('rec.empty')}
                </td>
              </tr>
            ) : (
              sortedRows.map((row) => (
                <tr
                  key={row.id}
                  className={`${canEdit ? 'has-context-menu' : ''}${row.filledInAugust ? ' rec-row-filled' : ''}`}
                  onDoubleClick={() => onOpen(row, canEdit ? 'edit' : 'view')}
                  onContextMenu={(e) => onContext(e, row)}
                >
                  <td>
                    <div className="rec-pos-cell">
                      <strong>{localizeJobTitle(row.position, locale)}</strong>
                      {row.filledInAugust || row.recruitmentDates.length ? (
                        <span className={`rec-chip${row.filledInAugust ? ' rec-chip-august' : ''}`}>
                          {datesLabel(row, t)}
                        </span>
                      ) : null}
                      {row.catalogMatch ? (
                        <Link
                          className="rec-chip rec-chip-match"
                          href={`/employes/classification?q=${encodeURIComponent(row.catalogTitle)}`}
                          onClick={(e) => e.stopPropagation()}
                          title={t('rec.seeInCatalog')}
                        >
                          {localizeJobTitle(row.catalogTitle, locale)}
                          {row.occupants.length
                            ? ` · ${t(row.occupants.length === 1 ? 'rec.occupants' : 'rec.occupantsPlural', { count: row.occupants.length })}`
                            : ''}
                        </Link>
                      ) : null}
                    </div>
                  </td>
                  <td>{row.grade || '—'}</td>
                  <td>
                    <span className={`rec-status ${statusClass(row.status)}`}>
                      {statusLabel(row.status, t)}
                    </span>
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
  const canExport =
    can('employes.recrutement', 'export')
    || can('employes.recrutement', 'view')
    || can('employes.classification', 'export')
    || can('employes.postes', 'export');

  const [bundle, setBundle] = useState<RecrutementBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<PageTab>('dashboard');
  const [locationZone, setLocationZone] = useState<RecrutementLocationZone>('all');
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
  const catalog = bundle?.catalog || [];

  const zoneCounts = useMemo(() => countRecrutementByZone(rows), [rows]);

  const scopedRows = useMemo(
    () => filterRecrutementByZone(rows, locationZone),
    [rows, locationZone],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scopedRows;
    return scopedRows.filter((r) =>
      [r.position, r.grade, r.status, r.comments, r.department, r.location, r.contractType, r.catalogTitle]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [scopedRows, search]);

  const replacements = filtered.filter((r) => r.category === 'replacement');
  const newPositions = filtered.filter((r) => r.category === 'new');
  const tabRows = activeTab === 'replacement' ? replacements : activeTab === 'new' ? newPositions : [];

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
      rows: scopedRows.filter(predicate).map((r) => rowToCells(r, t)),
    });
  };

  const createCategory: RecrutementCategory = activeTab === 'replacement' ? 'replacement' : 'new';

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
                  router.push(`/employes/classification?q=${encodeURIComponent(contextMenu.item.catalogTitle)}`),
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
      <div className="mvt-page mvt-page-fill rec-page">
        <div className="page-header page-header-with-tabs mvt-page-header rec-page-header">
          <div className="rec-page-header-main">
            <div className="page-header-title-row">
              <h2>{t('rec.title')}</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
          </div>
          <div className="page-header-actions mvt-header-actions rec-header-actions">
            {canExport ? <RecrutementExportMenu disabled={loading || !rows.length} /> : null}
            {canCreate ? (
              <button
                type="button"
                className="btn btn-primary btn-sm mvt-primary-btn"
                onClick={() => openCreate(createCategory)}
              >
                {t('common.add')}
              </button>
            ) : null}
            <div className="tabs header-tabs header-tabs-compact mvt-tabs rec-main-tabs" role="tablist">
              {(
                [
                  ['dashboard', t('rec.tab.dashboard')],
                  ['replacement', t('rec.tab.replacements')],
                  ['new', t('rec.tab.newPositions')],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === id}
                  className={`tab-btn tab-btn-sm mvt-tab-btn${activeTab === id ? ' active' : ''}`}
                  onClick={() => setActiveTab(id)}
                >
                  {label}
                  {id === 'replacement' ? (
                    <span className="rec-header-tab-count">{replacements.length}</span>
                  ) : null}
                  {id === 'new' ? (
                    <span className="rec-header-tab-count">{newPositions.length}</span>
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="rec-zone-toolbar">
          <div className="rec-zone-tabs" role="tablist" aria-label={t('rec.zone.label')}>
            {(
              [
                ['all', t('rec.zone.all'), rows.length],
                ['plant', t('rec.zone.plant'), zoneCounts.plant],
                ['hq', t('rec.zone.hq'), zoneCounts.hq],
                ['region', t('rec.zone.region'), zoneCounts.region],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={locationZone === id}
                className={`rec-zone-tab${locationZone === id ? ' is-active' : ''}`}
                onClick={() => setLocationZone(id)}
              >
                <span>{label}</span>
                <em>{count}</em>
              </button>
            ))}
          </div>
          {activeTab === 'replacement' || activeTab === 'new' ? (
            <div className="rec-zone-search">
              <label className="mvt-search">
                <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden>
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
              <span className="rec-tab-meta">
                {t(tabRows.length === 1 ? 'rec.rows' : 'rec.rowsPlural', { count: tabRows.length })}
              </span>
            </div>
          ) : null}
        </div>

        {activeTab === 'dashboard' ? (
          <div className="rec-dashboard-scroll">
            <RecrutementDashboardView
              rows={filtered}
              onDrill={openDrill}
              onOpenTab={(tab) => setActiveTab(tab)}
            />
          </div>
        ) : null}

        {activeTab === 'replacement' || activeTab === 'new' ? (
          <section className="exco-panel rec-table-card">
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
        ) : null}

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
