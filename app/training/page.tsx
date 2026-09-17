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

type EditCell = {
  year: number;
  month: number;
  field: 'hq' | 'plant';
  value: string;
};

const YEAR_OPTIONS = [2025, 2026, 2027, 2028];
const NOW = new Date();

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
        <div className={`training-dash${refreshing ? ' is-refreshing' : ''}`}>
          {refreshing ? (
            <div className="training-refresh-overlay" role="status" aria-live="polite">
              <span className="btn-spinner training-refresh-spinner" aria-hidden />
              <span>Loading month…</span>
            </div>
          ) : null}

          <div className="training-dash-kpis">
            <article className="training-card training-card-budget">
              <h3>Training Budget</h3>
              <strong>{money(dash.kpis.budgetUsd, 0)}</strong>
              <p>
                &gt; {dash.kpis.plantBudgetPct}% Plant &nbsp; &gt; {dash.kpis.hqBudgetPct}% HQ
              </p>
              <div className="training-card-actual">
                Actual: <em>{money(dash.actualSpend, 2)}</em>
              </div>
            </article>
            <article className="training-card training-card-hours">
              <h3>Training Hours</h3>
              <strong>{dash.kpis.hoursYtd.toLocaleString('en-US')} Hours YTD</strong>
              <p>
                &gt; {dash.kpis.hoursPlantPct}% Plant &nbsp; &gt; {dash.kpis.hoursHqPct}% HQ
              </p>
              <div className="training-card-actual is-dark">
                Average per Employee: <em>{dash.kpis.avgHoursPerEmployee} Hours</em>
              </div>
            </article>
            <article className="training-card training-card-topics">
              <header>
                <span>Topics Covered</span>
                <b>{dash.topicsCount}</b>
              </header>
              {[
                { label: 'Technical Skills (Hours)', pct: dash.kpis.technicalSkillsPct },
                { label: 'Soft Skills (Hours)', pct: dash.kpis.softSkillsPct },
                { label: 'Safety Topics (Hours)', pct: dash.kpis.safetyTopicsPct },
              ].map((s) => (
                <div key={s.label} className="training-skill">
                  <div className="training-skill-lab">
                    <span>{s.label}</span>
                    <strong>{s.pct}%</strong>
                  </div>
                  <div className="training-skill-track">
                    <i style={{ width: `${Math.min(100, s.pct)}%` }} />
                  </div>
                </div>
              ))}
            </article>
          </div>

          <div className="training-dash-mid">
            <div className="training-dash-cost">
              <TrainingStackedCostChart
                months={dash.costMonths}
                onBarClick={(key) => {
                  const m = dash.costMonths.find((c) => c.key === key);
                  if (!m) return;
                  setMonthFilter(m.month);
                  if (canEdit) startEdit(m.year, m.month, 'hq', m.hq);
                }}
              />

              <div className="training-bottom-row">
                <div className="panel training-cost-table-wrap">
                  <div className="training-cost-table-head">
                    <h4 className="training-cost-evolution-title">Evolution</h4>
                    <p className="training-cost-hint">
                      Click a cell to enter HQ / Plant for {year}
                      {canEdit ? ' — Enter to validate' : ''}
                    </p>
                  </div>
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
                                    <span className="training-cost-empty">—</span>
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

                <div className="panel training-upcoming">
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
                    {(upcomingDraft.length ? upcomingDraft : ['—']).map((item, idx) => (
                      <li key={`${idx}-${item}`}>
                        {canEdit && item !== '—' ? (
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
                  </ul>
                </div>
              </div>
            </div>

            <div className="panel training-covered">
              <h3>List of Training Covered</h3>
              <p className="training-covered-meta">
                From Trainee cost import
                {monthFilter !== ''
                  ? ` · ${monthLabelEn(monthFilter)} ${year}`
                  : ` · ${year}`}
              </p>
              <table>
                <tbody>
                  {(dash.covered.length ? dash.covered : ['— No imported trainings —']).map(
                    (item, i) => (
                      <tr key={`${i}-${item}`}>
                        <td className="n">{dash.covered.length ? i + 1 : ''}</td>
                        <td>{item}</td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  );
}
