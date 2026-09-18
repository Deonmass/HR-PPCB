'use client';

import { useEffect, useState } from 'react';
import { CAHIER_ICON_OPTIONS, emptyProjectBlock, DEFAULT_CAHIER_HIGHLIGHTS, DEFAULT_CSR_HIGHLIGHTS, parseCsrUpdateMarkup, parseProjectBodyLines, structureProjectBody } from '@/lib/exco-csr-fy27';
import type { ExcoCahierHighlight, ExcoCahierIcon } from '@/lib/exco-types';
import {
  recruitmentBudgetTone,
  recruitmentContractTone,
  recruitmentStatusTone,
  type RecBadgeTone,
} from '@/lib/exco-recruitment-fy27';

type SlideTab = 'csr' | 'recruitment' | 'training' | 'audit';
type CsrSubTab = 'csr' | 'cahier';

export type ExcoNarrativeTabId = SlideTab;

type SlidesPayload = {
  periodLabel: string;
  csr: {
    summary: { kpis: Array<{ label: string; value: string }> };
    highlights: Array<{
      id: string;
      icon: string;
      title: string;
      body: string;
      progressPct: number;
    }>;
  };
  cahier: {
    highlights: Array<{
      id: string;
      icon: string;
      title: string;
      body: string;
      progressPct: number;
    }>;
  };
  recruitment: {
    replacements: Array<{
      id: string;
      position: string;
      grade: string;
      status: string;
      comments: string;
      budgeted: string;
      department: string;
      location: string;
      contractType: string;
    }>;
    newPositions: Array<{
      id: string;
      position: string;
      grade: string;
      status: string;
      comments: string;
      budgeted: string;
      department: string;
      location: string;
      contractType: string;
    }>;
  };
  training?: {
    periodLabel: string;
    budget: string;
    actual: string;
    plantPct: string;
    hqPct: string;
    hoursYtd: string;
    avgHoursPerEmp: string;
    hoursPlantPct?: string;
    hoursHqPct?: string;
    topicsCount: number;
    skillBars: Array<{ label: string; pct: number }>;
    costMonths: Array<{
      label: string;
      hq: string;
      plant: string;
      hqN: number;
      plantN: number;
      isCurrent?: boolean;
    }>;
    upcoming: string[];
    covered: string[];
  };
  audit: {
    rows: Array<{
      number: number | string;
      finding: string;
      severity: string;
      status: string;
      dueDateLabel?: string;
      comments?: string;
    }>;
    summary: {
      total: number;
      closed: number;
      open: number;
      ongoing: number;
      overdue: number;
      closedPct: number;
    };
  };
  gouvernance: {
    auditTotal: number;
    auditClosed: number;
    auditClosedPct: number;
    evolutionText: string;
    progression: Array<{
      monthKey: string;
      label: string;
      closedPct: number;
      isCurrent: boolean;
      isFuture: boolean;
    }>;
  };
};

function MetricStrip({
  items,
  accent,
}: {
  items: Array<{ label: string; value: string; large?: boolean }>;
  accent?: 'wine' | 'navy' | 'teal';
}) {
  return (
    <div className="exco-metric-strip exco-slide-metrics">
      {items.map((item) => (
        <article
          key={item.label}
          className={`exco-metric-card exco-metric-${accent || 'navy'}${item.large ? ' is-large' : ''}`}
        >
          <span className="exco-metric-label">{item.label}</span>
          <strong className="exco-metric-value">{item.value}</strong>
        </article>
      ))}
    </div>
  );
}

function ProjectBodyRich({ body }: { body: string }) {
  const lines = parseProjectBodyLines(body);
  if (!lines.length) return <p className="exco-muted">—</p>;
  return (
    <div className="exco-project-body">
      {lines.map((line, i) => (
        <p key={`${line.label || 'p'}-${i}`}>
          {line.label ? <strong>{line.label} : </strong> : null}
          {parseCsrUpdateMarkup(line.text).map((run, j) =>
            run.update ? (
              <mark key={j} className="exco-csr-upd">
                {run.text}
              </mark>
            ) : (
              <span key={j}>{run.text}</span>
            ),
          )}
        </p>
      ))}
    </div>
  );
}

function RecBadge({
  value,
  tone,
}: {
  value: string;
  tone: RecBadgeTone;
}) {
  const label = value?.trim() || '—';
  return <span className={`exco-rec-badge is-${tone}`}>{label}</span>;
}

function toDrafts(
  highlights: Array<{ id: string; icon: string; title: string; body: string; progressPct: number }>,
  fallback: ExcoCahierHighlight[],
): ExcoCahierHighlight[] {
  const src = highlights.length ? highlights : fallback;
  return src.map((h) => ({
    id: h.id,
    icon: (h.icon as ExcoCahierIcon) || 'infrastructure',
    title: h.title,
    body: structureProjectBody(h.body),
    progressPct: h.progressPct || 0,
  }));
}

function ProjectBlocksEditor({
  title,
  highlights,
  year,
  month,
  canEdit,
  overlayKey,
  onSaved,
}: {
  title: string;
  highlights: Array<{ id: string; icon: string; title: string; body: string; progressPct: number }>;
  year: number;
  month: number;
  canEdit: boolean;
  overlayKey: 'csrHighlights' | 'cahierHighlights';
  onSaved: (highlights: ExcoCahierHighlight[]) => void;
}) {
  const [drafts, setDrafts] = useState<ExcoCahierHighlight[]>(() =>
    toDrafts(highlights, overlayKey === 'csrHighlights' ? DEFAULT_CSR_HIGHLIGHTS : DEFAULT_CAHIER_HIGHLIGHTS),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const fallback = overlayKey === 'csrHighlights' ? DEFAULT_CSR_HIGHLIGHTS : DEFAULT_CAHIER_HIGHLIGHTS;
  const highlightsKey = JSON.stringify(highlights);

  useEffect(() => {
    setDrafts(toDrafts(highlights, fallback));
  }, [highlightsKey, overlayKey]);

  const update = (id: string, patch: Partial<ExcoCahierHighlight>) => {
    setDrafts((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
  };

  const addBlock = () => {
    setDrafts((prev) => [...prev, emptyProjectBlock(`block-${Date.now()}`)]);
  };

  const removeBlock = (id: string) => {
    setDrafts((prev) => prev.filter((h) => h.id !== id));
  };

  const save = async () => {
    if (!canEdit) return;
    setSaving(true);
    setMsg('');
    setErr('');
    try {
      const res = await fetch('/api/exco/report', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          month,
          overlays: { [overlayKey]: drafts },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
      onSaved(drafts);
      setMsg('Blocs enregistrés.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="exco-panel exco-panel-accent-teal">
      <div className="exco-panel-head">
        <h3>
          {title} — {year}-{String(month).padStart(2, '0')}
        </h3>
        {canEdit ? (
          <div className="exco-cahier-actions">
            <button type="button" className="btn btn-outline btn-sm" onClick={addBlock}>
              + Ajouter un bloc
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        ) : null}
      </div>
      {msg ? <p className="exco-ok-banner">{msg}</p> : null}
      {err ? <p className="exco-warn-banner">{err}</p> : null}
      <div className="exco-cahier-grid">
        {drafts.map((h) => (
          <article key={h.id} className="exco-cahier-card">
            {canEdit ? (
              <>
                <div className="exco-cahier-card-top">
                  <label className="exco-cahier-field">
                    <span>Tag</span>
                    <select
                      value={h.icon}
                      onChange={(e) => update(h.id, { icon: e.target.value as ExcoCahierIcon })}
                    >
                      {CAHIER_ICON_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm exco-cahier-remove"
                    title="Retirer ce bloc"
                    onClick={() => removeBlock(h.id)}
                  >
                    Retirer
                  </button>
                </div>
                <label className="exco-cahier-field">
                  <span>Titre</span>
                  <input
                    type="text"
                    value={h.title}
                    onChange={(e) => update(h.id, { title: e.target.value })}
                  />
                </label>
                <label className="exco-cahier-field">
                  <span>Texte</span>
                  <textarea
                    rows={8}
                    value={h.body}
                    onChange={(e) => update(h.id, { body: e.target.value })}
                    onBlur={() => update(h.id, { body: structureProjectBody(h.body) })}
                  />
                </label>
                <ProjectBodyRich body={h.body} />
                <label className="exco-cahier-field">
                  <span>Progression %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={h.progressPct}
                    onChange={(e) =>
                      update(h.id, {
                        progressPct: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                      })
                    }
                  />
                </label>
              </>
            ) : (
              <>
                <span className="exco-cahier-icon">{h.icon}</span>
                <h4>{h.title}</h4>
                <ProjectBodyRich body={h.body} />
              </>
            )}
            <div className="exco-cahier-progress" aria-label={`${h.progressPct}%`}>
              <span style={{ width: `${Math.max(0, Math.min(100, h.progressPct || 0))}%` }} />
            </div>
            <em>{h.progressPct || 0}%</em>
          </article>
        ))}
        {!drafts.length ? (
          <p className="exco-muted">Aucun bloc. Ajoutez-en un pour commencer.</p>
        ) : null}
      </div>
    </section>
  );
}

function CsrContent({
  data,
  year,
  month,
  canEdit,
  onSaved,
}: {
  data: SlidesPayload;
  year: number;
  month: number;
  canEdit: boolean;
  onSaved: (highlights: ExcoCahierHighlight[]) => void;
}) {
  return (
    <>
      <section className="exco-panel exco-panel-accent-teal">
        <div className="exco-panel-head">
          <h3>CSR — {data.periodLabel}</h3>
        </div>
        <MetricStrip items={data.csr.summary.kpis} accent="teal" />
      </section>
      <ProjectBlocksEditor
        title="CSR"
        highlights={data.csr.highlights}
        year={year}
        month={month}
        canEdit={canEdit}
        overlayKey="csrHighlights"
        onSaved={onSaved}
      />
    </>
  );
}

export default function ExcoNarrativePanel({
  tab,
  year,
  month,
  canEdit = false,
}: {
  tab: SlideTab;
  year: number;
  month: number;
  canEdit?: boolean;
}) {
  const [data, setData] = useState<SlidesPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [csrSub, setCsrSub] = useState<CsrSubTab>('csr');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void (async () => {
      try {
        const res = await fetch(`/api/exco/slides?year=${year}&month=${month}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Chargement impossible');
        if (!cancelled) setData(json as SlidesPayload);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erreur');
          setData({
            periodLabel: `${year}-${String(month).padStart(2, '0')}`,
            csr: { summary: { kpis: [] }, highlights: DEFAULT_CSR_HIGHLIGHTS },
            cahier: { highlights: DEFAULT_CAHIER_HIGHLIGHTS },
            recruitment: { replacements: [], newPositions: [] },
            training: {
              periodLabel: `${year}-${String(month).padStart(2, '0')}`,
              budget: '—',
              actual: '—',
              plantPct: '—',
              hqPct: '—',
              hoursYtd: '—',
              avgHoursPerEmp: '—',
              topicsCount: 0,
              skillBars: [],
              costMonths: [],
              upcoming: [],
              covered: [],
            },
            audit: {
              rows: [],
              summary: { total: 0, closed: 0, open: 0, ongoing: 0, overdue: 0, closedPct: 0 },
            },
            gouvernance: {
              auditTotal: 0,
              auditClosed: 0,
              auditClosedPct: 0,
              evolutionText: '',
              progression: [],
            },
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  useEffect(() => {
    if (tab === 'csr') setCsrSub('csr');
  }, [tab]);

  if (loading) return <div className="loading">Chargement…</div>;
  if (!data) return <p className="exco-muted">Aucune donnée.</p>;
  if (error && tab !== 'csr') return <p className="exco-warn-banner">{error}</p>;

  if (tab === 'csr') {
    return (
      <div className="exco-panel-stack exco-slide-panel">
        {error ? <p className="exco-warn-banner">{error}</p> : null}
        <div className="exco-ot-subtabs" role="tablist" aria-label="Project">
          <button
            type="button"
            role="tab"
            className={`exco-ot-subtab${csrSub === 'csr' ? ' is-active' : ''}`}
            aria-selected={csrSub === 'csr'}
            onClick={() => setCsrSub('csr')}
          >
            CSR
          </button>
          <button
            type="button"
            role="tab"
            className={`exco-ot-subtab${csrSub === 'cahier' ? ' is-active' : ''}`}
            aria-selected={csrSub === 'cahier'}
            onClick={() => setCsrSub('cahier')}
          >
            Cahier des charges
          </button>
        </div>
        <div className="exco-ot-tab-body">
          {csrSub === 'csr' ? (
            <CsrContent
              data={data}
              year={year}
              month={month}
              canEdit={canEdit}
              onSaved={(highlights) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        csr: { ...prev.csr, highlights },
                      }
                    : prev,
                );
              }}
            />
          ) : (
            <ProjectBlocksEditor
              title="Cahier des charges"
              highlights={data.cahier.highlights}
              year={year}
              month={month}
              canEdit={canEdit}
              overlayKey="cahierHighlights"
              onSaved={(highlights) => {
                setData((prev) =>
                  prev
                    ? {
                        ...prev,
                        cahier: { highlights },
                      }
                    : prev,
                );
              }}
            />
          )}
        </div>
      </div>
    );
  }

  if (tab === 'recruitment') {
    const tables = [
      { title: 'Replacements', rows: data.recruitment.replacements },
      { title: 'New positions', rows: data.recruitment.newPositions },
    ];
    return (
      <div className="exco-panel-stack exco-slide-panel">
        {tables.map((block) => (
          <section key={block.title} className="exco-panel">
            <div className="exco-panel-head">
              <h3>Recruitment — {block.title}</h3>
              <span className="exco-muted">{block.rows.length} lignes</span>
            </div>
            <div className="exco-sheet-scroll">
              <table className="exco-mini-table exco-slide-table">
                <thead>
                  <tr>
                    <th>Position</th>
                    <th>Grade</th>
                    <th>Status</th>
                    <th>Comments</th>
                    <th>Budgeted</th>
                    <th>Department</th>
                    <th>Location</th>
                    <th>Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.position}</td>
                      <td>{r.grade || '—'}</td>
                      <td>
                        <RecBadge value={r.status} tone={recruitmentStatusTone(r.status)} />
                      </td>
                      <td>{r.comments}</td>
                      <td>
                        <RecBadge value={r.budgeted} tone={recruitmentBudgetTone(r.budgeted)} />
                      </td>
                      <td>{r.department}</td>
                      <td>{r.location || '—'}</td>
                      <td>
                        <RecBadge
                          value={r.contractType}
                          tone={recruitmentContractTone(r.contractType)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    );
  }

  if (tab === 'training') {
    const tr = data.training;
    if (!tr) {
      return (
        <p className="exco-muted">
          Données Training indisponibles. Ouvrez le module Training pour importer / saisir les coûts.
        </p>
      );
    }
    const maxCost = Math.max(...tr.costMonths.map((m) => m.hqN + m.plantN), 1);
    const ticksTop = (() => {
      const step = maxCost <= 5000 ? 1000 : maxCost <= 15000 ? 2500 : 5000;
      return Math.ceil(maxCost / step) * step || step;
    })();
    const tickValues: number[] = [];
    {
      const step = ticksTop <= 5000 ? 1000 : ticksTop <= 15000 ? 2500 : 5000;
      for (let v = 0; v <= ticksTop; v += step) tickValues.push(v);
    }
    const coveredRows = Array.from({ length: 15 }, (_, i) => tr.covered[i] ?? '');
    const plantPct = String(tr.plantPct || '').replace(/\s*%\s*$/, '');
    const hqPct = String(tr.hqPct || '').replace(/\s*%\s*$/, '');
    const hoursPlantPct = String(tr.hoursPlantPct || tr.plantPct || '').replace(/\s*%\s*$/, '');
    const hoursHqPct = String(tr.hoursHqPct || tr.hqPct || '').replace(/\s*%\s*$/, '');
    const actualLabel = String(tr.actual || '')
      .replace(/^\$\s*/, '')
      .replace(/\s*\$\s*$/, '');

    return (
      <div className="exco-panel-stack exco-slide-panel exco-training-panel">
        <div className="exco-panel-head exco-training-panel-head">
          <h3>Training — {tr.periodLabel || data.periodLabel}</h3>
          <a className="exco-muted" href="/training">
            Ouvrir le module Training →
          </a>
        </div>

        <div className="training-dash training-dash-exco exco-training-dash">
          <div className="training-dash-kpis">
            <article className="training-card training-card-budget">
              <span className="training-card-icon" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path
                    fill="currentColor"
                    d="M4 18h2V10H4v8zm4 0h2V6H8v12zm4 0h2v-5h-2v5zm4 0h2V8h-2v10zM3 20h18v2H3v-2z"
                  />
                </svg>
              </span>
              <div className="training-card-body">
                <h3>Training Budget</h3>
                <strong>{tr.budget}</strong>
                <ul>
                  <li>&gt; {plantPct} % Plant</li>
                  <li>&gt; {hqPct} % HQ</li>
                </ul>
              </div>
              <div className="training-card-footer is-actual">
                Actual: <em>{actualLabel ? `${actualLabel} $` : '—'}</em>
              </div>
            </article>

            <article className="training-card training-card-hours">
              <span className="training-card-icon is-accent" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path
                    fill="currentColor"
                    d="M12 2a8 8 0 1 0 8 8A8 8 0 0 0 12 2zm0 14.5A6.5 6.5 0 1 1 18.5 10 6.5 6.5 0 0 1 12 16.5z"
                  />
                  <path
                    fill="currentColor"
                    d="M11.2 7h1.6v3.2l2.2 1.3-.8 1.3-2.8-1.7V7z"
                  />
                </svg>
              </span>
              <div className="training-card-body">
                <h3>Training Hours</h3>
                <strong>{tr.hoursYtd}</strong>
                <ul>
                  <li>&gt; {hoursPlantPct} % Plant</li>
                  <li>&gt; {hoursHqPct} % HQ</li>
                </ul>
              </div>
              <div className="training-card-footer">
                Average per Employee: <em>{tr.avgHoursPerEmp}</em>
              </div>
            </article>

            <article className="training-card training-card-topics">
              <span className="training-card-icon is-dark" aria-hidden>
                <svg viewBox="0 0 24 24" width="22" height="22">
                  <path
                    fill="currentColor"
                    d="M4 18h16v2H4v-2zm2-2.5V7h2.5l1.2 2H14V7h2v8.5h-2V11H9.2L8 9H6v6.5H6z"
                  />
                </svg>
              </span>
              <header className="training-topics-head">
                <span>Topics Covered</span>
                <b>{tr.topicsCount}</b>
              </header>
              <div className="training-topics-rows">
                {tr.skillBars.map((s) => (
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
                <article className="training-stack-chart">
                  <header className="training-stack-chart-head">
                    <h4>COST PER MONTH (USD)</h4>
                    <div className="training-stack-legend">
                      <span>
                        <i className="is-hq" aria-hidden /> HQ
                      </span>
                      <span>
                        <i className="is-plant" aria-hidden /> Plant
                      </span>
                    </div>
                  </header>
                  <div className="training-stack-body">
                    <div className="training-stack-yaxis" aria-hidden>
                      {[...tickValues].reverse().map((v) => (
                        <span key={v}>{v.toLocaleString('en-US')}</span>
                      ))}
                    </div>
                    <div className="training-stack-main">
                      <div className="training-stack-plot">
                        <div className="training-stack-grid" aria-hidden>
                          {tickValues.map((v) => (
                            <i key={v} style={{ bottom: `${(v / ticksTop) * 100}%` }} />
                          ))}
                        </div>
                        <div className="training-stack-bars">
                          {tr.costMonths.map((m) => {
                            const hqH = (m.hqN / ticksTop) * 100;
                            const plantH = (m.plantN / ticksTop) * 100;
                            return (
                              <div
                                key={m.label}
                                className={`training-stack-col${m.isCurrent ? ' is-current' : ''}`}
                                title={`${m.label}: HQ ${m.hq || 0} · Plant ${m.plant || 0}`}
                              >
                                <div className="training-stack-stack">
                                  <span
                                    className="is-plant"
                                    style={{ height: `${Math.max(plantH, 0)}%` }}
                                  />
                                  <span
                                    className="is-hq"
                                    style={{ height: `${Math.max(hqH, 0)}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div className="training-stack-labels">
                        {tr.costMonths.map((m) => (
                          <span
                            key={`lab-${m.label}`}
                            className={m.isCurrent ? 'is-current' : undefined}
                          >
                            {m.label}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </article>

                <div className="training-cost-table-scroll">
                  <table className="training-cost-table">
                    <thead>
                      <tr>
                        <th className="training-cost-corner" />
                        {tr.costMonths.map((m) => (
                          <th
                            key={m.label}
                            className={m.isCurrent ? 'is-current-month' : undefined}
                          >
                            {m.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="is-hq">HQ</td>
                        {tr.costMonths.map((m) => (
                          <td
                            key={`hq-${m.label}`}
                            className={m.isCurrent ? 'is-current-month' : undefined}
                          >
                            {m.hq || <span className="training-cost-empty" />}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="is-plant-label">Plant</td>
                        {tr.costMonths.map((m) => (
                          <td
                            key={`plant-${m.label}`}
                            className={m.isCurrent ? 'is-current-month' : undefined}
                          >
                            {m.plant || <span className="training-cost-empty" />}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="training-upcoming">
                <div className="training-upcoming-head">
                  <h4>Upcoming Training Sessions</h4>
                </div>
                <ul className="training-upcoming-list">
                  {(tr.upcoming.length ? tr.upcoming : []).map((item, i) => (
                    <li key={`${i}-${item}`}>
                      <span>{item}</span>
                    </li>
                  ))}
                  {!tr.upcoming.length ? (
                    <li className="is-empty">
                      <span>—</span>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>

            <div className="training-covered">
              <h3>List of Training Covered</h3>
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
      </div>
    );
  }

  const s = data.audit.summary;
  const gov = data.gouvernance;
  const closedPct = gov.auditClosedPct || s.closedPct;
  const maxPct = Math.max(...gov.progression.map((p) => p.closedPct), 1);

  return (
    <div className="exco-panel-stack exco-slide-panel">
      <section className="exco-panel exco-panel-accent-wine">
        <div className="exco-panel-head">
          <h3>Internal audit — {data.periodLabel}</h3>
          <span className="exco-muted">
            Audit points · {gov.auditClosed || s.closed} / {gov.auditTotal || s.total}
          </span>
        </div>

        <MetricStrip
          accent="wine"
          items={[
            { label: 'Total', value: String(gov.auditTotal || s.total) },
            { label: 'Closed', value: String(gov.auditClosed || s.closed) },
            { label: 'Open', value: String(s.open) },
            { label: 'On going', value: String(s.ongoing) },
            { label: 'Overdue', value: String(s.overdue) },
            { label: 'Closed %', value: `${closedPct}%`, large: true },
          ]}
        />

        <div className="exco-audit-progression-block">
          <h4>Progression cumulative % Closed</h4>
          <p className="exco-muted exco-gov-text">{gov.evolutionText}</p>
          <div className="exco-gov-bars">
            {gov.progression.map((p) => (
              <div
                key={p.monthKey}
                className={`exco-gov-bar-col${p.isCurrent ? ' is-current' : ''}${p.isFuture ? ' is-future' : ''}`}
                title={`${p.label}: ${p.closedPct}%`}
              >
                <div className="exco-gov-bar-track">
                  <div
                    className="exco-gov-bar-fill"
                    style={{ height: `${Math.max(2, (p.closedPct / maxPct) * 100)}%` }}
                  />
                </div>
                <span>{p.label}</span>
                <em>{p.closedPct}%</em>
              </div>
            ))}
          </div>
        </div>

        <div className="exco-sheet-scroll">
          <table className="exco-mini-table exco-slide-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Finding</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Due</th>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {data.audit.rows.map((r) => (
                <tr
                  key={String(r.number)}
                  className={
                    r.status === 'Closed'
                      ? 'is-audit-closed'
                      : r.status === 'Overdue'
                        ? 'is-audit-overdue'
                        : undefined
                  }
                >
                  <td>{r.number}</td>
                  <td>{r.finding}</td>
                  <td>{r.severity}</td>
                  <td>{r.status}</td>
                  <td>{r.dueDateLabel || '—'}</td>
                  <td>{r.comments || '—'}</td>
                </tr>
              ))}
              {!data.audit.rows.length && (
                <tr>
                  <td colSpan={6} className="exco-muted">
                    Aucun audit point. Ajoutez des actions dans Audit HR.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
