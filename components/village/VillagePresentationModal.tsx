'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import { downloadVillagePptx, fetchVillagePreviewHtml } from '@/lib/village-export';
import { emptyEmployeeHrProfile, type Employee } from '@/lib/types';
import { showError, showSuccess } from '@/lib/swal';
import {
  DEFAULT_ALLOCATION_CRITERIA,
  emptyProposal,
  type VillagePresentation,
  type VillagePresentationAgent,
  type VillagePresentationLive,
  type VillagePresentationProposal,
} from '@/lib/village-presentation';

type SlideTab = 'cover' | 'dashboard' | 'vacant' | 'proposals' | 'thanks';

const TABS: Array<{ id: SlideTab; label: string; n: string }> = [
  { id: 'cover', label: 'Cover', n: '01' },
  { id: 'dashboard', label: 'Dashboard', n: '02' },
  { id: 'vacant', label: 'Vacant houses', n: '03' },
  { id: 'proposals', label: 'Proposals', n: '04' },
  { id: 'thanks', label: 'Thank you', n: '05' },
];

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`village-pptx-field${className ? ` ${className}` : ''}`}>
      {label}
      <input
        className="filter-select"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  disabled,
  rows = 3,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
  className?: string;
}) {
  return (
    <label className={`village-pptx-field${className ? ` ${className}` : ''}`}>
      {label}
      <textarea
        className="filter-select village-pptx-textarea"
        value={value}
        disabled={disabled}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function agentToEmployee(agent: VillagePresentationAgent): Employee {
  return {
    ...emptyEmployeeHrProfile(),
    matricule: agent.matricule,
    nom: agent.nom,
    departement: agent.departement,
    grade: '',
    jobTitle: agent.jobTitle,
    localisation: '',
    documents: {},
  };
}

export default function VillagePresentationModal({
  open,
  canEdit,
  canExport,
  onClose,
}: {
  open: boolean;
  canEdit: boolean;
  canExport: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SlideTab>('cover');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [deck, setDeck] = useState<VillagePresentation | null>(null);
  const [live, setLive] = useState<VillagePresentationLive | null>(null);
  const [agents, setAgents] = useState<VillagePresentationAgent[]>([]);

  const pickerEmployees = useMemo(() => agents.map(agentToEmployee), [agents]);
  const criteria = deck?.dashboard.criteria ?? DEFAULT_ALLOCATION_CRITERIA;

  const patch = useCallback((updater: (prev: VillagePresentation) => VillagePresentation) => {
    setDeck((prev) => (prev ? updater(prev) : prev));
    setDirty(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/village/presentation', { cache: 'no-store' });
      const json = (await res.json()) as {
        presentation?: VillagePresentation;
        live?: VillagePresentationLive;
        agents?: VillagePresentationAgent[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Chargement impossible');
      setDeck(json.presentation ?? null);
      setLive(json.live ?? null);
      setAgents(Array.isArray(json.agents) ? json.agents : []);
      setDirty(false);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setTab('cover');
      setPreviewHtml(null);
      void load();
    } else {
      setPreviewHtml(null);
    }
  }, [open, load]);

  useEffect(() => {
    if (!previewHtml) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreviewHtml(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [previewHtml]);

  const save = async () => {
    if (!deck) return;
    setSaving(true);
    try {
      const res = await fetch('/api/village/presentation', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deck),
      });
      const json = (await res.json()) as { presentation?: VillagePresentation; error?: string };
      if (!res.ok) throw new Error(json.error || 'Enregistrement impossible');
      if (json.presentation) setDeck(json.presentation);
      setDirty(false);
      await showSuccess('Présentation enregistrée');
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Enregistrement impossible');
    } finally {
      setSaving(false);
    }
  };

  const openPreview = async () => {
    if (!deck) return;
    setPreviewing(true);
    try {
      const html = await fetchVillagePreviewHtml(deck);
      setPreviewHtml(html);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Aperçu PPTX impossible');
    } finally {
      setPreviewing(false);
    }
  };

  const exportPptx = async () => {
    if (!deck) return;
    setExporting(true);
    try {
      await downloadVillagePptx(deck);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Export PPTX impossible');
    } finally {
      setExporting(false);
    }
  };

  const updateProposal = (id: string, patchItem: Partial<VillagePresentationProposal>) => {
    patch((prev) => ({
      ...prev,
      proposals: {
        ...prev.proposals,
        items: prev.proposals.items.map((item) =>
          item.id === id ? { ...item, ...patchItem } : item,
        ),
      },
    }));
  };

  const assignAgent = (id: string, selection: EmployeeSelection | null) => {
    updateProposal(id, {
      name: selection?.nom ?? '',
      matricule: selection?.matricule ?? '',
      badge: selection?.matricule ? 'proposal' : undefined,
    });
  };

  if (!open) return null;

  const previewModal =
    previewHtml && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="exco-preview-overlay village-pptx-preview-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="village-pptx-preview-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPreviewHtml(null);
            }}
          >
            <div className="exco-preview-modal">
              <div className="exco-preview-modal-head">
                <div>
                  <h3 id="village-pptx-preview-title">Aperçu PPTX</h3>
                  <p>
                    {deck?.period || 'Village housing'}
                    {dirty ? ' · modifications non enregistrées' : ''}
                  </p>
                </div>
                <div className="exco-preview-modal-actions">
                  {canExport && (
                    <button
                      type="button"
                      className="btn btn-accent btn-sm"
                      disabled={!deck || exporting || previewing}
                      onClick={() => void exportPptx()}
                    >
                      {exporting ? <span className="btn-spinner" aria-hidden="true" /> : null}
                      {exporting ? 'Export…' : 'Exporter PPTX'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={exporting}
                    onClick={() => setPreviewHtml(null)}
                  >
                    Fermer
                  </button>
                </div>
              </div>
              <iframe
                className="exco-preview-iframe"
                title="Aperçu présentation village"
                srcDoc={previewHtml}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
    <div
      className="modal-overlay open village-pptx-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Préparer la présentation"
    >
      <div className="village-pptx-modal">
        <div className="village-pptx-modal-head">
          <div>
            <h3>Préparer la présentation</h3>
            <p>
              Slides préremplies, modifiables — vérifiez l’aperçu PPTX avant d’exporter.
              Le dashboard et les maisons vides restent calés sur les données du système.
              {dirty ? ' · Modifications non enregistrées' : ''}
            </p>
          </div>
          <div className="village-pptx-modal-actions">
            {canEdit && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!deck || saving || loading || !dirty}
                onClick={() => void save()}
              >
                {saving ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            )}
            {canExport && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={!deck || previewing || exporting || loading}
                onClick={() => void openPreview()}
              >
                {previewing ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {previewing ? 'Aperçu…' : 'Aperçu PPTX'}
              </button>
            )}
            <button
              type="button"
              className="modal-close"
              aria-label="Fermer"
              disabled={saving || exporting || previewing}
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        <div className="tabs header-tabs header-tabs-compact village-pptx-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`tab-btn tab-btn-sm${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              <span className="village-pptx-tab-n">{t.n}</span>
              {t.label}
            </button>
          ))}
        </div>

        <div className="village-pptx-body">
          {loading || !deck ? (
            <div className="loading">Chargement de la présentation…</div>
          ) : tab === 'cover' ? (
            <div className="village-pptx-grid">
              <Field
                label="Bandeau (slides)"
                value={deck.chromeKicker}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, chromeKicker: v }))}
              />
              <Field
                label="Période"
                value={deck.period}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, period: v }))}
              />
              <Field
                label="Titre de couverture"
                value={deck.cover.title}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, cover: { ...p.cover, title: v } }))}
              />
              <Field
                label="Date"
                value={deck.cover.date}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, cover: { ...p.cover, date: v } }))}
              />
              <Field
                label="Lieu"
                value={deck.cover.place}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, cover: { ...p.cover, place: v } }))}
              />
              <div className="village-pptx-cover-preview" aria-hidden>
                <img src="/exco/cover-banner.png" alt="" />
                <p className="village-pptx-cover-meet">
                  <img src="/exco/cover-badge.png" alt="" />
                  {deck.cover.title} HELD ON {deck.cover.date}, IN {deck.cover.place}
                </p>
              </div>
            </div>
          ) : tab === 'dashboard' ? (
            <div className="village-pptx-grid">
              <div className="village-pptx-dash-edit">
                <Field
                  className="village-pptx-dash-title-l"
                  label="Titre de la slide"
                  value={deck.dashboard.title}
                  disabled={!canEdit}
                  onChange={(v) => patch((p) => ({ ...p, dashboard: { ...p.dashboard, title: v } }))}
                />
                <Field
                  className="village-pptx-dash-title-r"
                  label="Titre des critères d’attribution"
                  value={criteria.title}
                  disabled={!canEdit}
                  onChange={(v) =>
                    patch((p) => ({
                      ...p,
                      dashboard: {
                        ...p.dashboard,
                        criteria: { ...(p.dashboard.criteria ?? DEFAULT_ALLOCATION_CRITERIA), title: v },
                      },
                    }))
                  }
                />
                <Area
                  className="village-pptx-dash-list"
                  label="Critères (un par ligne)"
                  value={criteria.items.join('\n')}
                  disabled={!canEdit}
                  rows={7}
                  onChange={(v) =>
                    patch((p) => ({
                      ...p,
                      dashboard: {
                        ...p.dashboard,
                        criteria: {
                          ...(p.dashboard.criteria ?? DEFAULT_ALLOCATION_CRITERIA),
                          items: v.split('\n'),
                        },
                      },
                    }))
                  }
                />
                <div className="village-pptx-dash-preview-col">
                  <Area
                    label="Introduction"
                    value={criteria.intro}
                    disabled={!canEdit}
                    rows={2}
                    onChange={(v) =>
                      patch((p) => ({
                        ...p,
                        dashboard: {
                          ...p.dashboard,
                          criteria: { ...(p.dashboard.criteria ?? DEFAULT_ALLOCATION_CRITERIA), intro: v },
                        },
                      }))
                    }
                  />
                  <div className="village-pptx-field village-pptx-dash-preview-box">
                    <span>Aperçu</span>
                    <div className="village-pptx-criteria-preview">
                      <strong>{criteria.title}</strong>
                      {criteria.intro ? <p>{criteria.intro}</p> : null}
                      {criteria.items.filter((item) => item.trim()).length ? (
                        <ul>
                          {criteria.items
                            .map((item) => item.trim())
                            .filter(Boolean)
                            .map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
              {live && (
                <div className="village-pptx-live">
                  <p className="village-pptx-live-title">Données système (non modifiables ici)</p>
                  <div className="village-pptx-kpis">
                    <span>Houses {live.maisonsTotal}</span>
                    <span>Occupied {live.maisonsOccupees} ({live.occPct}%)</span>
                    <span>Vacant {live.maisonsVides}</span>
                    <span>Village {live.village}</span>
                    <span>Kimpese {live.kimpese}</span>
                    <span>Zamba {live.zamba}</span>
                  </div>
                  <div className="village-pptx-live-tables">
                    <table className="dependants-table">
                      <thead>
                        <tr>
                          <th>Type</th>
                          <th className="num">Total</th>
                          <th className="num">Occ.</th>
                          <th className="num">Vacant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {live.parTaille.map((row) => (
                          <tr key={row.label}>
                            <td>{row.label}</td>
                            <td className="num">{row.total}</td>
                            <td className="num">{row.occupees}</td>
                            <td className="num">{row.vides}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <table className="dependants-table">
                      <thead>
                        <tr>
                          <th>Department</th>
                          {live.tailleColumns.map((col) => (
                            <th key={col} className="num">{col}</th>
                          ))}
                          <th className="num">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {live.parDepartementTaille.map((row) => (
                          <tr key={row.departement}>
                            <td>{row.departement}</td>
                            {live.tailleColumns.map((col) => (
                              <td key={col} className="num">{row.counts[col] || '—'}</td>
                            ))}
                            <td className="num">{row.total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ) : tab === 'vacant' ? (
            <div className="village-pptx-grid">
              <Field
                label="Titre de la slide"
                value={deck.vacant.title}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, vacant: { ...p.vacant, title: v } }))}
              />
              <Area
                label="Note (optionnelle)"
                value={deck.vacant.note}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, vacant: { ...p.vacant, note: v } }))}
              />
              {live && (
                <div className="village-pptx-live">
                  <p className="village-pptx-live-title">
                    {live.vacant.length} vacant house(s) — from system data
                  </p>
                  <div className="village-pptx-vacant-list">
                    {live.vacant.map((m) => (
                      <span key={m.numero} className="village-pptx-chip">
                        {m.numero}
                        <em>{m.type}</em>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : tab === 'proposals' ? (
            <div className="village-pptx-grid">
              <Field
                label="Titre de la slide"
                value={deck.proposals.title}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, proposals: { ...p.proposals, title: v } }))}
              />
              <Area
                label="Note"
                value={deck.proposals.note}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, proposals: { ...p.proposals, note: v } }))}
              />
              <div className="village-pptx-proposals-wrap">
                <table className="village-pptx-proposals-table">
                  <thead>
                    <tr>
                      <th className="house-col">House</th>
                      <th className="badge-col">Badge</th>
                      <th>Agent</th>
                      {canEdit ? <th className="act-col" aria-label="Actions" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {deck.proposals.items.map((item) => (
                      <tr key={item.id}>
                        <td className="house-col">
                          <input
                            className="filter-select"
                            value={item.house}
                            disabled={!canEdit}
                            aria-label="House"
                            onChange={(e) => updateProposal(item.id, { house: e.target.value })}
                          />
                        </td>
                        <td className="badge-col">
                          <select
                            className="filter-select"
                            value={item.badge}
                            disabled={!canEdit}
                            aria-label="Badge"
                            onChange={(e) =>
                              updateProposal(item.id, {
                                badge: e.target.value === 'role' ? 'role' : 'proposal',
                                matricule: e.target.value === 'role' ? '' : item.matricule,
                              })
                            }
                          >
                            <option value="proposal">Agent</option>
                            <option value="role">Role / use</option>
                          </select>
                        </td>
                        <td>
                          {item.badge === 'role' ? (
                            <input
                              className="filter-select"
                              value={item.name}
                              disabled={!canEdit}
                              placeholder="Poste ou usage"
                              aria-label="Agent"
                              onChange={(e) =>
                                updateProposal(item.id, { name: e.target.value, matricule: '' })
                              }
                            />
                          ) : (
                            <EmployeePicker
                              employees={pickerEmployees}
                              value={
                                item.name
                                  ? {
                                      nom: item.name,
                                      matricule: item.matricule,
                                      departement: '',
                                    }
                                  : null
                              }
                              onChange={(selection) => assignAgent(item.id, selection)}
                              placeholder="Rechercher un agent…"
                            />
                          )}
                        </td>
                        {canEdit ? (
                          <td className="act-col">
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              title="Retirer"
                              aria-label="Retirer"
                              onClick={() =>
                                patch((p) => ({
                                  ...p,
                                  proposals: {
                                    ...p.proposals,
                                    items: p.proposals.items.filter((x) => x.id !== item.id),
                                  },
                                }))
                              }
                            >
                              ×
                            </button>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                    {!deck.proposals.items.length ? (
                      <tr>
                        <td colSpan={canEdit ? 4 : 3} className="village-pptx-proposals-empty">
                          Aucune proposition
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() =>
                    patch((p) => ({
                      ...p,
                      proposals: {
                        ...p.proposals,
                        items: [...p.proposals.items, emptyProposal()],
                      },
                    }))
                  }
                >
                  Ajouter une proposition
                </button>
              )}
            </div>
          ) : (
            <div className="village-pptx-grid">
              <Field
                label="Ligne rouge (haut du cadre)"
                value={deck.thankYou.kicker}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, thankYou: { ...p.thankYou, kicker: v } }))}
              />
              <Field
                label="Message"
                value={deck.thankYou.message}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, thankYou: { ...p.thankYou, message: v } }))}
              />
              <div className="village-pptx-cover-preview village-pptx-thanks-card" aria-hidden>
                <p className="village-pptx-thanks-kicker">{deck.thankYou.kicker}</p>
                <strong className="village-pptx-thanks-msg">{deck.thankYou.message}</strong>
                <span className="village-pptx-thanks-period">{deck.period}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
    {previewModal}
    </>
  );
}
