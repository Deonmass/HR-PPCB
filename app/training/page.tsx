'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import TrainingIoMenu from '@/components/training/TrainingIoMenu';
import TrainingStackedCostChart from '@/components/training/TrainingStackedCostChart';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';
import type { TrainingDashboardView } from '@/lib/training-types';
import { monthLabelEn } from '@/lib/training-types';
import { showError } from '@/lib/swal';

function money(n: number, digits = 0): string {
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function moneyPlain(n: number, digits = 2): string {
  return `${n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} $`;
}

type EditCell = {
  year: number;
  month: number;
  field: 'hq' | 'plant';
  value: string;
};

const YEAR_OPTIONS = [2025, 2026, 2027, 2028];
const COVERED_SLOTS = 15;
const NOW = new Date();

function IconBudget({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M4 18h2V10H4v8zm4 0h2V6H8v12zm4 0h2v-5h-2v5zm4 0h2V8h-2v10zM3 20h18v2H3v-2z"
      />
      <circle cx="18.5" cy="5.5" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        fill="currentColor"
        d="M18.1 4.2h.8v.55h.35v.55H18.9v.7h-.8v-.7h-.4V4.75h.4V4.2zm.4 2.95c.55 0 .95-.25.95-.7 0-.35-.25-.55-.75-.7l-.35-.1c-.2-.05-.3-.1-.3-.2 0-.15.15-.25.35-.25.25 0 .4.1.45.25l.7-.2c-.15-.45-.55-.7-1.15-.7-.6 0-1.05.35-1.05.8 0 .4.3.6.8.75l.3.1c.25.05.35.12.35.25 0 .15-.2.28-.45.28-.3 0-.5-.12-.55-.35l-.75.2c.15.5.6.87 1.3.87z"
      />
    </svg>
  );
}

function IconHours({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2a8 8 0 1 0 8 8A8 8 0 0 0 12 2zm0 14.5A6.5 6.5 0 1 1 18.5 10 6.5 6.5 0 0 1 12 16.5z"
      />
      <path
        fill="currentColor"
        d="M11.2 7h1.6v3.2l2.2 1.3-.8 1.3-2.8-1.7V7zM8.2 18.2c.7.9 2.3 1.8 3.8 1.8s3.1-.9 3.8-1.8c-1.1-.7-2.4-1.1-3.8-1.1s-2.7.4-3.8 1.1z"
      />
    </svg>
  );
}

function IconTopics({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <path
        fill="currentColor"
        d="M4 18h16v2H4v-2zm2-2.5V7h2.5l1.2 2H14V7h2v8.5h-2V11H9.2L8 9H6v6.5H6zM9 19.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm6 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"
      />
    </svg>
  );
}

export default function TrainingPage() {
  const { t } = useI18n();
  const { can } = usePermissions();
  const canEdit = can('training', 'edit');
  const canExport = can('training', 'export') || can('training', 'view');

  const [year, setYear] = useState(NOW.getFullYear());
  const [monthFilter, setMonthFilter] = useState<number | ''>(NOW.getMonth() + 1);
  const [dash, setDash] = useState<TrainingDashboardView | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [edit, setEdit] = useState<EditCell | null>(null);
  const [upcomingDraft, setUpcomingDraft] = useState<string[]>([]);
  const [newUpcoming, setNewUpcoming] = useState('');
  const hasDashRef = useRef(false);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    if (!hasDashRef.current) setLoading(true);
    else setRefreshing(true);
    try {
      const q = new URLSearchParams({ year: String(year) });
      if (monthFilter !== '') q.set('month', String(monthFilter));
      else q.set('month', 'all');
      const res = await fetch(`/api/training?${q}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load training data');
      const data = (await res.json()) as TrainingDashboardView;
      if (seq !== loadSeq.current) return;
      setDash(data);
      setUpcomingDraft([...(data.upcoming || [])]);
      hasDashRef.current = true;
    } catch (e) {
      if (seq === loadSeq.current) {
        await showError(e instanceof Error ? e.message : 'Error');
      }
    } finally {
      if (seq === loadSeq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [year, monthFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchKpis = async (upcoming: string[]) => {
    if (!canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/training', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kpis: { upcoming },
          viewYear: year,
          viewMonth: monthFilter === '' ? null : monthFilter,
        }),
      });
      const json = (await res.json()) as TrainingDashboardView & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setDash(json);
      setUpcomingDraft([...(json.upcoming || [])]);
    } catch (e) {
      await showError(e instanceof Error ? e.message : 'Save error');
    } finally {
      setSaving(false);
    }
  };

  const saveCell = async (cell: EditCell) => {
    if (!canEdit) {
      setEdit(null);
      return;
    }
    const parsed = Number(String(cell.value).replace(/[\s,]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) {
      await showError('Enter a valid amount (≥ 0)');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/training', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthCost: {
            year: cell.year,
            month: cell.month,
            [cell.field]: parsed,
          },
          viewYear: year,
          viewMonth: monthFilter === '' ? null : monthFilter,
        }),
      });
      const json = (await res.json()) as TrainingDashboardView & { error?: string };
      if (!res.ok) throw new Error(json.error || 'Save failed');
      setDash(json);
      setEdit(null);
    } catch (e) {
      await showError(e instanceof Error ? e.message : 'Save error');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (yearN: number, month: number, field: 'hq' | 'plant', current: number) => {
    if (!canEdit || saving || refreshing) return;
    setEdit({
      year: yearN,
      month,
      field,
      value: current ? String(current) : '',
    });
  };

  const busy = saving || refreshing;
  const coveredRows = Array.from({ length: COVERED_SLOTS }, (_, i) => dash?.covered[i] ?? '');

  return (
    <PermissionGate menuId="training" action="view">
      <div className="page-header training-page-header">
        <div className="training-page-title">
          <h1>{t('training.title')}</h1>
          <p className="page-subtitle">Training Dashboard — cost per month (HQ / Plant)</p>
        </div>
        <div className="page-header-actions training-header-actions">
          <select
            className="filter-select"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            title="Year"
            disabled={busy}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            value={monthFilter === '' ? '' : String(monthFilter)}
            onChange={(e) =>
              setMonthFilter(e.target.value === '' ? '' : Number(e.target.value))
            }
            title="Month"
            disabled={busy}
          >
            <option value="">All months</option>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {monthLabelEn(m)}
              </option>
            ))}
          </select>
          <RefreshButton onClick={() => void load()} loading={loading || refreshing || saving} />
          <TrainingIoMenu
            canImport={canEdit}
            canExport={canExport}
            disabled={busy}
            onImported={() => load()}
          />
        </div>
      </div>

      {loading && !dash ? (
        <p className="empty-state">Loading…</p>
      ) : !dash ? (
        <p className="empty-state">No data</p>
      ) : (
        <div className={`training-dash training-dash-exco${refreshing ? ' is-refreshing' : ''}`}>
          {refreshing ? (
            <div className="training-refresh-overlay" role="status" aria-live="polite">
              <span className="btn-spinner training-refresh-spinner" aria-hidden />
              <span>Loading month…</span>
            </div>
          ) : null}

          <div className="training-dash-kpis">
            <article className="training-card training-card-budget">
              <span className="training-card-icon" aria-hidden>
                <IconBudget />
              </span>
              <div className="training-card-body">
                <h3>Training Budget</h3>
                <strong>{money(dash.kpis.budgetUsd, 0).replace('$', '$ ')}</strong>
                <ul>
                  <li>&gt; {dash.kpis.plantBudgetPct} % Plant</li>
                  <li>&gt; {dash.kpis.hqBudgetPct} % HQ</li>
                </ul>
              </div>
              <div className="training-card-footer is-actual">
                Actual: <em>{moneyPlain(dash.actualSpend, 2)}</em>
              </div>
            </article>

            <article className="training-card training-card-hours">
              <span className="training-card-icon is-accent" aria-hidden>
                <IconHours />
              </span>
              <div className="training-card-body">
                <h3>Training Hours</h3>
                <strong>{dash.kpis.hoursYtd.toLocaleString('en-US')} Hours YTD</strong>
                <ul>
                  <li>&gt; {dash.kpis.hoursPlantPct} % Plant</li>
                  <li>&gt; {dash.kpis.hoursHqPct} % HQ</li>
                </ul>
              </div>
              <div className="training-card-footer">
                Average per Employee: <em>{dash.kpis.avgHoursPerEmployee} Hours</em>
              </div>
            </article>

            <article className="training-card training-card-topics">
              <span className="training-card-icon is-dark" aria-hidden>
                <IconTopics />
              </span>
              <header className="training-topics-head">
                <span>Topics Covered</span>
                <b>{dash.topicsCount}</b>
              </header>
              <div className="training-topics-rows">
                {[
                  { label: 'Technical Skills (Hours)', pct: dash.kpis.technicalSkillsPct },
                  { label: 'Soft Skills (Hours)', pct: dash.kpis.softSkillsPct },
                  { label: 'Safety Topics (Hours)', pct: dash.kpis.safetyTopicsPct },
                ].map((s) => (
                  <div key={s.label} className="training-skill-row">
                    <span>{s.label}</span>
                    <strong>{s.pct}%</strong>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="training-dash-mid">
            <div className="training-dash-left">
              <div className="training-cost-block">
                <TrainingStackedCostChart
                  months={dash.costMonths}
                  onBarClick={(key) => {
                    const m = dash.costMonths.find((c) => c.key === key);
                    if (!m) return;
                    setMonthFilter(m.month);
                    if (canEdit) startEdit(m.year, m.month, 'hq', m.hq);
                  }}
                />
                <div className="training-cost-table-scroll">
                  <table className="training-cost-table">
                    <thead>
                      <tr>
                        <th className="training-cost-corner" />
                        {dash.costMonths.map((m) => (
                          <th
                            key={m.key}
                            className={m.isCurrent ? 'is-current-month' : undefined}
                          >
                            {m.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(['hq', 'plant'] as const).map((field) => (
                        <tr key={field}>
                          <td className={field === 'hq' ? 'is-hq' : 'is-plant-label'}>
                            {field === 'hq' ? 'HQ' : 'Plant'}
                          </td>
                          {dash.costMonths.map((m) => {
                            const val = field === 'hq' ? m.hq : m.plant;
                            const isEditing =
                              edit?.year === m.year &&
                              edit?.month === m.month &&
                              edit?.field === field;
                            return (
                              <td
                                key={`${field}-${m.key}`}
                                className={`training-cost-cell${m.isCurrent ? ' is-current-month' : ''}${canEdit ? ' is-editable' : ''}`}
                                onClick={() => {
                                  if (!isEditing) {
                                    setMonthFilter(m.month);
                                    startEdit(m.year, m.month, field, val);
                                  }
                                }}
                              >
                                {isEditing ? (
                                  <input
                                    className="training-cost-input"
                                    autoFocus
                                    value={edit.value}
                                    disabled={busy}
                                    onChange={(e) =>
                                      setEdit((p) =>
                                        p ? { ...p, value: e.target.value } : p,
                                      )
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && edit) void saveCell(edit);
                                      if (e.key === 'Escape') setEdit(null);
                                    }}
                                    onBlur={() => {
                                      if (edit) void saveCell(edit);
                                    }}
                                  />
                                ) : val ? (
                                  val.toLocaleString('en-US')
                                ) : (
                                  <span className="training-cost-empty" />
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="training-upcoming">
                <div className="training-upcoming-head">
                  <h4>Upcoming Training Sessions</h4>
                  {canEdit && (
                    <button
                      type="button"
                      className="btn btn-sm training-upcoming-add"
                      disabled={busy || !newUpcoming.trim()}
                      onClick={() => {
                        const next = [...upcomingDraft, newUpcoming.trim()].filter(Boolean);
                        setNewUpcoming('');
                        void patchKpis(next);
                      }}
                    >
                      + Add
                    </button>
                  )}
                </div>
                {canEdit && (
                  <div className="training-upcoming-form">
                    <input
                      className="filter-select training-upcoming-input"
                      placeholder="New session title…"
                      value={newUpcoming}
                      disabled={busy}
                      onChange={(e) => setNewUpcoming(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newUpcoming.trim()) {
                          const next = [...upcomingDraft, newUpcoming.trim()];
                          setNewUpcoming('');
                          void patchKpis(next);
                        }
                      }}
                    />
                  </div>
                )}
                <ul className="training-upcoming-list">
                  {(upcomingDraft.length ? upcomingDraft : []).map((item, idx) => (
                    <li key={`${idx}-${item}`}>
                      {canEdit ? (
                        <>
                          <input
                            className="training-upcoming-row-input"
                            value={item}
                            disabled={busy}
                            onChange={(e) => {
                              const next = [...upcomingDraft];
                              next[idx] = e.target.value;
                              setUpcomingDraft(next);
                            }}
                            onBlur={() => {
                              const cleaned = upcomingDraft
                                .map((s) => s.trim())
                                .filter(Boolean);
                              if (
                                JSON.stringify(cleaned) !==
                                JSON.stringify(dash.upcoming || [])
                              ) {
                                void patchKpis(cleaned);
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="training-upcoming-del"
                            title="Remove"
                            disabled={busy}
                            onClick={() => {
                              const next = upcomingDraft.filter((_, i) => i !== idx);
                              void patchKpis(next);
                            }}
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <span>{item}</span>
                      )}
                    </li>
                  ))}
                  {!upcomingDraft.length ? (
                    <li className="is-empty">
                      <span>—</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="training-covered">
              <h3>List of Training Covered</h3>
              <p className="training-covered-meta">
                From Trainee cost import
                {monthFilter !== ''
                  ? ` · YTD through ${monthLabelEn(monthFilter)} ${year}`
                  : ` · ${year}`}
                {dash.covered.length ? ` · ${dash.covered.length} topic${dash.covered.length !== 1 ? 's' : ''}` : ''}
              </p>
              <ol className="training-covered-list">
                {coveredRows.map((item, i) => (
                  <li key={`covered-${i}`}>
                    <span className="n">{i + 1}.</span>
                    <span className="txt">{item || '\u00a0'}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  );
}
