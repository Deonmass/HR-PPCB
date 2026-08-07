'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import PermissionGate from '@/components/PermissionGate';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  RRF_APPROVER_FIELDS,
  RRF_BENEFIT_LABELS,
  RRF_EMPTY_FORM,
  autoFillRrfApprovers,
  buildRrfJobSuggestions,
  buildRrfLocationSuggestions,
  employeesForRrfRole,
  filterRrfJobSuggestions,
  filterStringSuggestions,
  formatRrfDisplayDate,
  type RrfFormData,
  type RrfJobSuggestion,
  type RrfNewOrReplacement,
  type RrfPosting,
  type RrfWorkSchedule,
  type RrfYesNo,
} from '@/lib/rrf-types';
import {
  buildInitialRrfForm,
  clearRrfPrefill,
  hasRrfPrefill,
  mergeRrfPrefill,
  rrfPrefillFromSearchParams,
} from '@/lib/rrf-prefill';
import { completeTopProgress } from '@/components/TopProgressBar';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

type Tab = 'form' | 'history';
type HistoryFilterKey = 'date' | 'position' | 'costCenter' | 'location' | 'type' | 'emisPar';

const EMPTY_HISTORY_FILTERS: Record<HistoryFilterKey, string[]> = {
  date: [],
  position: [],
  costCenter: [],
  location: [],
  type: [],
  emisPar: [],
};

interface RrfHistoryRecord {
  id: string;
  createdAt: string;
  format: 'xlsx' | 'pdf' | 'saved';
  fileName: string;
  positionTitle: string;
  jobTitle: string;
  costCenter: string;
  location: string;
  reportsTo: string;
  headcount: string;
  issuedBy?: string;
  form: RrfFormData;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatLabel(_format: RrfHistoryRecord['format']): string {
  return 'RRF';
}

function activeEmployees(employees: Employee[]): Employee[] {
  return employees.filter((e) => {
    const statut = String(e.statut || '').toLowerCase();
    return !statut || statut === 'active' || statut === 'actif';
  });
}

function StringSuggest({
  items,
  value,
  onChange,
  placeholder,
}: {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const visible = useMemo(
    () => filterStringSuggestions(items, value),
    [items, value],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="rrf-suggest" ref={wrapRef}>
      <input
        type="text"
        value={value}
        placeholder={placeholder || 'Saisir ou sélectionner…'}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && visible.length > 0 && (
        <ul className="rrf-suggest-list" role="listbox">
          {visible.map((item) => (
            <li key={item}>
              <button
                type="button"
                className="rrf-suggest-item"
                onClick={() => {
                  onChange(item);
                  setOpen(false);
                }}
              >
                <strong>{item}</strong>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobTitleSuggest({
  suggestions,
  value,
  onChange,
  onSelect,
}: {
  suggestions: RrfJobSuggestion[];
  value: string;
  onChange: (value: string) => void;
  onSelect: (item: RrfJobSuggestion) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const visible = useMemo(
    () => filterRrfJobSuggestions(suggestions, value),
    [suggestions, value],
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="rrf-suggest" ref={wrapRef}>
      <input
        type="text"
        value={value}
        placeholder="Saisir ou sélectionner une fonction…"
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && visible.length > 0 && (
        <ul className="rrf-suggest-list" role="listbox">
          {visible.map((item) => (
            <li key={item.jobTitle}>
              <button
                type="button"
                className="rrf-suggest-item"
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <strong>{item.jobTitle}</strong>
                <span className="text-muted">
                  {[item.costCenter, item.location, item.reportsTo].filter(Boolean).join(' · ')}
                  {item.sampleCount > 1 ? ` (${item.sampleCount})` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function YesNo({
  value,
  onChange,
}: {
  value: RrfYesNo;
  onChange: (v: RrfYesNo) => void;
}) {
  return (
    <div className="rrf-yesno" role="radiogroup">
      {(['Yes', 'No'] as const).map((opt) => (
        <label key={opt} className={`rrf-check rrf-check-yn${value === opt ? ' is-on' : ''}`}>
          <input
            type="radio"
            checked={value === opt}
            onChange={() => onChange(opt)}
            aria-label={opt}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value?: string | boolean }) {
  const text =
    typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value || '').trim() || '—';
  return (
    <div className="rrf-preview-row">
      <span className="rrf-preview-label">{label}</span>
      <span className="rrf-preview-value">{text}</span>
    </div>
  );
}

function RrfPreviewBody({ form }: { form: RrfFormData }) {
  return (
    <div className="rrf-preview-doc rrf-preview-template">
      <header className="rrf-preview-banner">
        <div>
          <span className="rrf-preview-doccode">PPCB-HR-DOC-26</span>
          <strong>Recruitment Requisition approval Form</strong>
        </div>
        <span className="rrf-preview-subtitle">Permanent position</span>
      </header>

      <section>
        <h4>Admin</h4>
        <div className="rrf-preview-table">
          <PreviewRow
            label="Position to be recruited and number"
            value={
              form.headcount && form.headcount !== '1'
                ? `${form.positionTitle} (x${form.headcount})`
                : form.positionTitle
            }
          />
          <PreviewRow label="Cost Center" value={form.costCenter} />
          <PreviewRow label="Head account in blueprint (Y/N)" value={form.headAccountBlueprint} />
          {form.headAccountBlueprint === 'No' && (
            <PreviewRow label="If no, justification" value={form.headAccountJustification} />
          )}
          <PreviewRow label="Position Budgeted?" value={form.positionBudgeted} />
          {form.positionBudgeted === 'No' && (
            <PreviewRow label="If no, justification" value={form.budgetJustification} />
          )}
          <PreviewRow label="New position or Replacement" value={form.newOrReplacement} />
          <PreviewRow label="Work Schedule" value={form.workSchedule} />
        </div>
      </section>

      <section>
        <h4>Job detail</h4>
        <div className="rrf-preview-table">
          <PreviewRow label="Job title" value={form.jobTitle || form.positionTitle} />
          <PreviewRow label="Description of the job" value={form.jobDescription} />
          <PreviewRow label="Job level" value={form.jobLevel} />
          <PreviewRow label="Reports to" value={form.reportsTo} />
          <PreviewRow label="Location" value={form.location} />
          <PreviewRow
            label="Preferred start date"
            value={formatRrfDisplayDate(form.preferredStartDate)}
          />
          <PreviewRow label="Posting" value={form.posting} />
        </div>
      </section>

      <section>
        <h4>Benefits</h4>
        <div className="rrf-preview-table">
          {RRF_BENEFIT_LABELS.map(({ key, label }) => (
            <PreviewRow key={key} label={label} value={form.benefits[key]} />
          ))}
        </div>
      </section>

      <section>
        <h4>Approver&apos;s signature</h4>
        <div className="rrf-preview-approvers">
          <div className="rrf-preview-approvers-head">
            <span>Role / step</span>
            <span>Name</span>
            <span>Signed / Date</span>
          </div>
          <div className="rrf-preview-approvers-row">
            <span>Recruitment requested by</span>
            <span>{form.recruitmentRequestedBy || '—'}</span>
            <span />
          </div>
          {RRF_APPROVER_FIELDS.map(({ roleKey, nameKey, fallback }) => (
            <div className="rrf-preview-approvers-row" key={roleKey}>
              <span>{form[roleKey] || fallback}</span>
              <span>{form[nameKey] || '—'}</span>
              <span />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function RrfPageContent() {
  const { can } = usePermissions();
  const canExport = can('documents.rrf', 'view')
    || can('documents.rrf', 'export')
    || can('documents.rrf', 'create');
  const canSave = can('documents.rrf', 'create')
    || can('documents.rrf', 'edit')
    || can('documents.rrf', 'export')
    || can('documents.rrf', 'view');
  const canDeleteHistory = can('documents.rrf', 'delete')
    || can('documents.rrf', 'edit')
    || can('documents.rrf', 'create');

  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('form');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<RrfFormData>(() => buildInitialRrfForm());
  const [exporting, setExporting] = useState<'xlsx' | 'pdf' | null>(null);
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<RrfHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [historyColFilters, setHistoryColFilters] =
    useState<Record<HistoryFilterKey, string[]>>(EMPTY_HISTORY_FILTERS);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewForm, setPreviewForm] = useState<RrfFormData | null>(null);
  const autoFilledRef = useRef(false);
  const appliedQueryKeyRef = useRef<string>('');

  const agents = useMemo(() => activeEmployees(employees), [employees]);

  const historyPositionLabel = (record: RrfHistoryRecord) => {
    const base = record.positionTitle || record.jobTitle || '';
    if (record.headcount && record.headcount !== '1') {
      return `${base || '—'} (×${record.headcount})`;
    }
    return base;
  };

  const historyFilterValues = useMemo(
    () =>
      buildColumnFilterValues(history, {
        date: (r) => formatDateTime(r.createdAt),
        position: (r) => historyPositionLabel(r),
        costCenter: (r) => r.costCenter,
        location: (r) => r.location,
        type: (r) => formatLabel(r.format),
        emisPar: (r) => r.issuedBy,
      }),
    [history],
  );

  const filteredHistory = useMemo(
    () =>
      history.filter(
        (r) =>
          matchesColumnFilter(historyColFilters.date, formatDateTime(r.createdAt)) &&
          matchesColumnFilter(historyColFilters.position, historyPositionLabel(r)) &&
          matchesColumnFilter(historyColFilters.costCenter, r.costCenter) &&
          matchesColumnFilter(historyColFilters.location, r.location) &&
          matchesColumnFilter(historyColFilters.type, formatLabel(r.format)) &&
          matchesColumnFilter(historyColFilters.emisPar, r.issuedBy),
      ),
    [history, historyColFilters],
  );

  const historyActiveFilterCount = useMemo(
    () => countActiveColumnFilters(historyColFilters),
    [historyColFilters],
  );

  const setHistoryColFilter = (key: HistoryFilterKey) => (next: string[]) => {
    setHistoryColFilters((prev) => ({ ...prev, [key]: next }));
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/documents/rrf');
      if (!res.ok) {
        setHistory([]);
        return;
      }
      const json = await res.json();
      setHistory(Array.isArray(json) ? (json as RrfHistoryRecord[]) : []);
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    completeTopProgress();
    clearRrfPrefill();
  }, []);

  useEffect(() => {
    fetch('/api/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(Array.isArray(json) ? json : []))
      .catch(() => setEmployees([]))
      .finally(() => setLoading(false));
    void loadHistory();
  }, []);

  /** Prefill depuis query string (et re-navigation avec nouveaux params). */
  useEffect(() => {
    const key = searchParams.toString();
    if (!key || key === appliedQueryKeyRef.current) return;
    const payload = rrfPrefillFromSearchParams(searchParams);
    if (!hasRrfPrefill(payload)) return;
    appliedQueryKeyRef.current = key;
    setForm((prev) => mergeRrfPrefill(prev, payload));
    setTab('form');
    completeTopProgress();
  }, [searchParams]);

  useEffect(() => {
    if (loading || agents.length === 0 || autoFilledRef.current) return;
    autoFilledRef.current = true;
    setForm((prev) => autoFillRrfApprovers(prev, agents));
  }, [loading, agents]);

  const jobSuggestions = useMemo(() => buildRrfJobSuggestions(employees), [employees]);
  const locationSuggestions = useMemo(
    () => buildRrfLocationSuggestions(employees),
    [employees],
  );

  const patch = <K extends keyof RrfFormData>(key: K, value: RrfFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const applyJobSuggestion = (item: RrfJobSuggestion) => {
    setForm((prev) => ({
      ...prev,
      positionTitle: item.jobTitle,
      jobTitle: item.jobTitle,
      costCenter: item.costCenter || prev.costCenter,
      reportsTo: item.reportsTo || prev.reportsTo,
      location: item.location || prev.location,
    }));
  };

  const ensurePosition = (payload: RrfFormData): boolean => {
    if (!payload.positionTitle.trim() && !payload.jobTitle.trim()) {
      void showError('Indiquez la position / fonction à recruter');
      return false;
    }
    return true;
  };

  const openPreview = (override?: RrfFormData) => {
    const payload = override || form;
    if (!ensurePosition(payload)) return;
    setPreviewForm(payload);
    setPreviewOpen(true);
  };

  /** Enregistre le formulaire (1 ligne upsert) puis ouvre le modal de visualisation. */
  const saveAndVisualize = async (override?: RrfFormData) => {
    if (!canSave && !canExport) return;
    const payload = override || form;
    if (!ensurePosition(payload)) return;
    setSaving(true);
    try {
      if (canSave) {
        const res = await fetch('/api/documents/rrf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save',
            form: payload,
            historyId: historyId || undefined,
          }),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => null);
          throw new Error((json as { error?: string } | null)?.error || 'Enregistrement impossible');
        }
        const entry = (await res.json()) as RrfHistoryRecord;
        if (entry?.id) setHistoryId(entry.id);
        await loadHistory();
      }
      setPreviewForm(payload);
      setPreviewOpen(true);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const downloadExport = async (
    format: 'xlsx' | 'pdf',
    overrideForm?: RrfFormData,
  ) => {
    if (!canExport) return;
    const payload = overrideForm || previewForm || form;
    if (!ensurePosition(payload)) return;
    setExporting(format);
    try {
      const res = await fetch('/api/documents/rrf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          form: payload,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error((json as { error?: string } | null)?.error || 'Export impossible');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1]
        || `RRF-export.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      await showSuccess(format === 'pdf' ? 'PDF téléchargé' : 'Excel téléchargé');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export impossible');
    } finally {
      setExporting(null);
    }
  };

  const loadFromHistory = (record: RrfHistoryRecord) => {
    setForm({
      ...RRF_EMPTY_FORM,
      ...record.form,
      benefits: {
        ...RRF_EMPTY_FORM.benefits,
        ...(record.form?.benefits || {}),
      },
    });
    setHistoryId(record.id);
    setTab('form');
    void showSuccess('Formulaire rechargé depuis l’historique');
  };

  const viewFromHistory = (record: RrfHistoryRecord) => {
    setHistoryId(record.id);
    openPreview({
      ...RRF_EMPTY_FORM,
      ...record.form,
      benefits: {
        ...RRF_EMPTY_FORM.benefits,
        ...(record.form?.benefits || {}),
      },
    });
  };

  const deleteHistoryEntry = async (record: RrfHistoryRecord) => {
    if (!canDeleteHistory) return;
    const ok = await confirmDelete(
      'Supprimer de l’historique ?',
      `Entrée « ${record.positionTitle || record.jobTitle || record.fileName} »`,
    );
    if (!ok) return;
    setHistoryBusyId(record.id);
    try {
      const res = await fetch(`/api/documents/rrf?id=${encodeURIComponent(record.id)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error((json as { error?: string } | null)?.error || 'Suppression impossible');
      }
      await loadHistory();
      await showSuccess('Entrée supprimée');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Suppression impossible');
    } finally {
      setHistoryBusyId(null);
    }
  };

  if (loading && !form.positionTitle && !form.jobTitle) {
    return <div className="loading">Chargement...</div>;
  }

  return (
    <PermissionGate anyOf={[
      { menuId: 'documents.rrf', action: 'view' },
      { menuId: 'documents.rrf', action: 'create' },
      { menuId: 'documents.rrf', action: 'export' },
    ]}>
      <div className="rrf-page">
        <header className="rrf-sticky">
          <div className="rrf-page-header">
            <h2 className="rrf-page-title">
              RRF <span className="rrf-title-sub">— Recruitment Requisition</span>
            </h2>
            <div className="rrf-header-actions">
              <Link href="/documents" className="btn btn-secondary btn-sm rrf-back-btn" prefetch={false}>
                ← Documents
              </Link>
              <div className="tabs header-tabs header-tabs-compact rrf-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'form'}
                  className={`tab-btn tab-btn-sm${tab === 'form' ? ' active' : ''}`}
                  onClick={() => setTab('form')}
                >
                  Formulaire
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === 'history'}
                  className={`tab-btn tab-btn-sm${tab === 'history' ? ' active' : ''}`}
                  onClick={() => {
                    setTab('history');
                    void loadHistory();
                  }}
                >
                  Historique{history.length > 0 ? ` (${history.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </header>

        <div className={`rrf-body${tab === 'form' ? ' is-form' : ' is-history'}`}>
      {tab === 'form' && (
        <div className="panel rrf-form-panel">
          <div className="rrf-form-scroll">
            <div className="rrf-columns">
              <section className="rrf-col rrf-col-admin">
                <h3 className="rrf-section-title">Admin</h3>
                <div className="rrf-col-fields">
                  <div className="form-group">
                    <label>Position to be recruited</label>
                    <JobTitleSuggest
                      suggestions={jobSuggestions}
                      value={form.positionTitle}
                      onChange={(v) => {
                        setForm((prev) => ({
                          ...prev,
                          positionTitle: v,
                          jobTitle:
                            !prev.jobTitle || prev.jobTitle === prev.positionTitle
                              ? v
                              : prev.jobTitle,
                        }));
                      }}
                      onSelect={applyJobSuggestion}
                    />
                  </div>
                  <div className="rrf-field-row">
                    <div className="form-group">
                      <label>Nb. positions</label>
                      <input
                        type="number"
                        min={1}
                        value={form.headcount}
                        onChange={(e) => patch('headcount', e.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label>Cost center</label>
                      <input
                        value={form.costCenter}
                        onChange={(e) => patch('costCenter', e.target.value)}
                        placeholder="Prérempli"
                      />
                    </div>
                  </div>
                  <div className="rrf-field-row">
                    <div className="form-group">
                      <label>New / Replacement</label>
                      <select
                        value={form.newOrReplacement}
                        onChange={(e) => patch('newOrReplacement', e.target.value as RrfNewOrReplacement)}
                      >
                        <option value="">—</option>
                        <option value="New position">New position</option>
                        <option value="Replacement">Replacement</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Work schedule</label>
                      <select
                        value={form.workSchedule}
                        onChange={(e) => patch('workSchedule', e.target.value as RrfWorkSchedule)}
                      >
                        <option value="">—</option>
                        <option value="Full time">Full time</option>
                        <option value="Part time">Part time</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group rrf-yn-block">
                    <div className="rrf-yn-pair">
                      <span className="rrf-yn-label">Head account in blueprint</span>
                      <YesNo
                        value={form.headAccountBlueprint}
                        onChange={(v) => patch('headAccountBlueprint', v)}
                      />
                    </div>
                    <div className="rrf-yn-pair">
                      <span className="rrf-yn-label">Position budgeted?</span>
                      <YesNo
                        value={form.positionBudgeted}
                        onChange={(v) => patch('positionBudgeted', v)}
                      />
                    </div>
                  </div>
                  {form.headAccountBlueprint === 'No' && (
                    <div className="form-group">
                      <label>Justification (blueprint)</label>
                      <input
                        type="text"
                        value={form.headAccountJustification}
                        onChange={(e) => patch('headAccountJustification', e.target.value)}
                        placeholder="If no, provide justification…"
                      />
                    </div>
                  )}
                  {form.positionBudgeted === 'No' && (
                    <div className="form-group">
                      <label>Justification (budget)</label>
                      <input
                        type="text"
                        value={form.budgetJustification}
                        onChange={(e) => patch('budgetJustification', e.target.value)}
                        placeholder="If no, provide justification…"
                      />
                    </div>
                  )}
                  <div className="form-group">
                    <label>Posting</label>
                    <select
                      value={form.posting}
                      onChange={(e) => patch('posting', e.target.value as RrfPosting)}
                    >
                      <option value="">—</option>
                      <option value="Internal">Internal</option>
                      <option value="External">External</option>
                      <option value="Internal & External">Internal &amp; External</option>
                    </select>
                  </div>
                  <div className="form-group rrf-benefits-block">
                    <label>Benefits</label>
                    <div className="rrf-benefits">
                      {RRF_BENEFIT_LABELS.map(({ key, label }) => (
                        <label key={key} className={`rrf-check${form.benefits[key] ? ' is-on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={form.benefits[key]}
                            onChange={(e) =>
                              patch('benefits', { ...form.benefits, [key]: e.target.checked })
                            }
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rrf-col rrf-col-job">
                <h3 className="rrf-section-title">Job detail</h3>
                <div className="rrf-col-fields">
                  <div className="form-group">
                    <label>Job title</label>
                    <input
                      value={form.jobTitle}
                      onChange={(e) => patch('jobTitle', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Job level</label>
                    <input
                      value={form.jobLevel}
                      onChange={(e) => patch('jobLevel', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Description</label>
                    <textarea
                      rows={3}
                      value={form.jobDescription}
                      onChange={(e) => patch('jobDescription', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Reports to</label>
                    <input
                      value={form.reportsTo}
                      onChange={(e) => patch('reportsTo', e.target.value)}
                      placeholder="Prérempli"
                    />
                  </div>
                  <div className="rrf-field-row">
                    <div className="form-group">
                      <label>Location</label>
                      <StringSuggest
                        items={locationSuggestions}
                        value={form.location}
                        onChange={(v) => patch('location', v)}
                        placeholder="Localisation…"
                      />
                    </div>
                    <div className="form-group">
                      <label>Start date</label>
                      <input
                        type="date"
                        value={form.preferredStartDate}
                        onChange={(e) => patch('preferredStartDate', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="rrf-col rrf-col-approvers">
                <h3 className="rrf-section-title">Approver&apos;s signature</h3>
                <div className="table-wrap rrf-approvers-wrap">
                  <table className="rrf-approvers-table">
                    <thead>
                      <tr>
                        <th className="rrf-approvers-role-col">Role / step</th>
                        <th className="rrf-approvers-name-col">Name (Approved by)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="rrf-approvers-role">Recruitment requested by</td>
                        <td>
                          <EmployeeSuggestInput
                            employees={agents}
                            value={form.recruitmentRequestedBy}
                            onChange={(v) => patch('recruitmentRequestedBy', v)}
                            placeholder="Nom de l’agent…"
                          />
                        </td>
                      </tr>
                      {RRF_APPROVER_FIELDS.map(({ roleKey, nameKey, fallback, keywords }) => {
                        const roleLabel = form[roleKey] || fallback;
                        const roleEmployees = employeesForRrfRole(
                          agents,
                          roleLabel,
                          [...keywords],
                        ) as Employee[];
                        return (
                          <tr key={roleKey}>
                            <td className="rrf-approvers-role">{roleLabel}</td>
                            <td>
                              <EmployeeSuggestInput
                                employees={roleEmployees}
                                value={form[nameKey]}
                                onChange={(v) => patch(nameKey, v)}
                                placeholder="Nom approbateur…"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </div>

          <div className="rrf-footer-actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || Boolean(exporting)}
              onClick={() => void saveAndVisualize()}
            >
              {saving ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  Enregistrement…
                </>
              ) : (
                'Enregistrer et visualiser'
              )}
            </button>
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="panel rrf-history-panel">
          {historyLoading ? (
            <div className="loading">Chargement de l&apos;historique…</div>
          ) : history.length === 0 ? (
            <p className="empty-state">Aucun RRF enregistré ou exporté pour le moment.</p>
          ) : (
            <>
              {historyActiveFilterCount > 0 ? (
                <div style={{ marginBottom: '0.5rem' }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setHistoryColFilters(EMPTY_HISTORY_FILTERS)}
                  >
                    Effacer les filtres ({historyActiveFilterCount})
                  </button>
                </div>
              ) : null}
            <div className="table-wrap rrf-history-table-wrap">
              <table className="travel-history-table rrf-history-table">
                <thead>
                  <tr>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Date"
                        values={historyFilterValues.date}
                        selected={historyColFilters.date}
                        onChange={setHistoryColFilter('date')}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Position"
                        values={historyFilterValues.position}
                        selected={historyColFilters.position}
                        onChange={setHistoryColFilter('position')}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Cost center"
                        values={historyFilterValues.costCenter}
                        selected={historyColFilters.costCenter}
                        onChange={setHistoryColFilter('costCenter')}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Location"
                        values={historyFilterValues.location}
                        selected={historyColFilters.location}
                        onChange={setHistoryColFilter('location')}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Type"
                        values={historyFilterValues.type}
                        selected={historyColFilters.type}
                        onChange={setHistoryColFilter('type')}
                      />
                    </th>
                    <th className="th-filter">
                      <TableHeaderFilter
                        label="Émis par"
                        values={historyFilterValues.emisPar}
                        selected={historyColFilters.emisPar}
                        onChange={setHistoryColFilter('emisPar')}
                      />
                    </th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="empty-state">
                        Aucun RRF pour ces filtres.
                      </td>
                    </tr>
                  ) : (
                    filteredHistory.map((record) => {
                    const busy = historyBusyId === record.id || Boolean(exporting);
                    return (
                      <tr key={record.id} className={busy ? 'rrf-history-row-busy' : undefined}>
                        <td>{formatDateTime(record.createdAt)}</td>
                        <td title={record.jobTitle || record.positionTitle}>
                          {record.positionTitle || record.jobTitle || '—'}
                          {record.headcount && record.headcount !== '1'
                            ? ` (×${record.headcount})`
                            : ''}
                        </td>
                        <td>{record.costCenter || '—'}</td>
                        <td>{record.location || '—'}</td>
                        <td>{formatLabel(record.format)}</td>
                        <td>{record.issuedBy || '—'}</td>
                        <td>
                          <div className="rrf-history-actions">
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => viewFromHistory(record)}
                            >
                              Visualiser
                            </button>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              disabled={busy}
                              onClick={() => loadFromHistory(record)}
                            >
                              Recharger
                            </button>
                            {canDeleteHistory && (
                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                disabled={busy}
                                onClick={() => void deleteHistoryEntry(record)}
                              >
                                Suppr.
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                  )}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}
        </div>

      {previewOpen && previewForm && (
        <div
          className="modal-overlay"
          onClick={() => setPreviewOpen(false)}
          role="presentation"
        >
          <div
            className="modal modal-form rrf-preview-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rrf-preview-title"
          >
            <div className="modal-header">
              <h3 id="rrf-preview-title">Visualisation RRF</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => setPreviewOpen(false)}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>
            <div className="modal-body rrf-preview-modal-body">
              <RrfPreviewBody form={previewForm} />
            </div>
            <div className="modal-footer rrf-preview-modal-footer">
              {canExport && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={Boolean(exporting) || saving}
                    onClick={() => void downloadExport('xlsx', previewForm)}
                  >
                    {exporting === 'xlsx' ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Excel…
                      </>
                    ) : (
                      'Télécharger Excel'
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={Boolean(exporting) || saving}
                    onClick={() => void downloadExport('pdf', previewForm)}
                  >
                    {exporting === 'pdf' ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        PDF…
                      </>
                    ) : (
                      'Télécharger PDF'
                    )}
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={Boolean(exporting) || saving}
                onClick={() => setPreviewOpen(false)}
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </PermissionGate>
  );
}

export default function RrfPage() {
  return (
    <Suspense fallback={<div className="loading">Chargement…</div>}>
      <RrfPageContent />
    </Suspense>
  );
}
