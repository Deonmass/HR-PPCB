'use client';

import { useEffect, useState } from 'react';
import { CAHIER_ICON_OPTIONS } from '@/lib/exco-csr-fy27';
import type { ExcoCahierHighlight, ExcoCahierIcon } from '@/lib/exco-types';

type SlideTab = 'csr' | 'recruitment' | 'audit';
type CsrSubTab = 'csr' | 'cahier';

export type ExcoNarrativeTabId = SlideTab;

type SlidesPayload = {
  periodLabel: string;
  csr: {
    summary: { kpis: Array<{ label: string; value: string }> };
    fy27Rows: Array<{
      id: string;
      name: string;
      objective: string;
      progress: string;
      risks: string;
      nextSteps: string;
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

function CsrContent({ data }: { data: SlidesPayload }) {
  return (
    <>
      <section className="exco-panel exco-panel-accent-teal">
        <div className="exco-panel-head">
          <h3>CSR — {data.periodLabel}</h3>
        </div>
        <MetricStrip items={data.csr.summary.kpis} accent="teal" />
      </section>
      <section className="exco-panel">
        <div className="exco-panel-head">
          <h3>CSR FY27 — Projects</h3>
          <span className="exco-muted">{data.csr.fy27Rows.length} lignes</span>
        </div>
        <div className="exco-sheet-scroll">
          <table className="exco-mini-table exco-slide-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Objective</th>
                <th>Progress</th>
                <th>Risks</th>
                <th>Next steps</th>
              </tr>
            </thead>
            <tbody>
              {data.csr.fy27Rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.objective}</td>
                  <td>{r.progress}</td>
                  <td>{r.risks}</td>
                  <td>{r.nextSteps}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function CahierContent({
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
  const [drafts, setDrafts] = useState<ExcoCahierHighlight[]>(() =>
    data.cahier.highlights.map((h) => ({
      id: h.id,
      icon: (h.icon as ExcoCahierIcon) || 'infrastructure',
      title: h.title,
      body: h.body,
      progressPct: h.progressPct || 0,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    setDrafts(
      data.cahier.highlights.map((h) => ({
        id: h.id,
        icon: (h.icon as ExcoCahierIcon) || 'infrastructure',
        title: h.title,
        body: h.body,
        progressPct: h.progressPct || 0,
      })),
    );
  }, [data.cahier.highlights]);

  const update = (id: string, patch: Partial<ExcoCahierHighlight>) => {
    setDrafts((prev) => prev.map((h) => (h.id === id ? { ...h, ...patch } : h)));
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
          overlays: { cahierHighlights: drafts },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
      onSaved(drafts);
      setMsg('Cahier enregistré — projets mis à jour.');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="exco-panel exco-panel-accent-teal">
      <div className="exco-panel-head">
        <h3>Cahier des charges — {data.periodLabel}</h3>
        {canEdit && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        )}
      </div>
      {msg && <p className="exco-ok-banner">{msg}</p>}
      {err && <p className="exco-warn-banner">{err}</p>}
      <div className="exco-cahier-grid">
        {drafts.map((h) => (
          <article key={h.id} className="exco-cahier-card">
            {canEdit ? (
              <>
                <label className="exco-cahier-field">
                  <span>Icône</span>
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
                    rows={14}
                    value={h.body}
                    onChange={(e) => update(h.id, { body: e.target.value })}
                  />
                </label>
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
                <p>{h.body}</p>
              </>
            )}
            <div className="exco-cahier-progress" aria-label={`${h.progressPct}%`}>
              <span style={{ width: `${Math.max(0, Math.min(100, h.progressPct || 0))}%` }} />
            </div>
            <em>{h.progressPct || 0}%</em>
          </article>
        ))}
        {!drafts.length && (
          <p className="exco-muted">Aucun highlight Cahier des charges.</p>
        )}
      </div>
    </section>
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
        if (!cancelled) setError(err instanceof Error ? err.message : 'Erreur');
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
  if (error) return <p className="exco-warn-banner">{error}</p>;
  if (!data) return <p className="exco-muted">Aucune donnée.</p>;

  if (tab === 'csr') {
    return (
      <div className="exco-panel-stack exco-slide-panel">
        <div className="exco-ot-subtabs" role="tablist" aria-label="CSR">
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
            <CsrContent data={data} />
          ) : (
            <CahierContent
              data={data}
              year={year}
              month={month}
              canEdit={canEdit}
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
                      <td>{r.status}</td>
                      <td>{r.comments}</td>
                      <td>{r.budgeted}</td>
                      <td>{r.department}</td>
                      <td>{r.location || '—'}</td>
                      <td>{r.contractType}</td>
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
