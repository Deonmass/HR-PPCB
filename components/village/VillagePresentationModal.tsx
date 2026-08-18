'use client';

import { useCallback, useEffect, useState } from 'react';
import { downloadVillagePptx } from '@/lib/village-export';
import { showError, showSuccess } from '@/lib/swal';
import {
  emptyProposal,
  type VillagePresentation,
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="village-pptx-field">
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="village-pptx-field">
      {label}
      <textarea
        className="filter-select village-pptx-textarea"
        value={value}
        disabled={disabled}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
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
  const [exporting, setExporting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [deck, setDeck] = useState<VillagePresentation | null>(null);
  const [live, setLive] = useState<VillagePresentationLive | null>(null);

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
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || 'Chargement impossible');
      setDeck(json.presentation ?? null);
      setLive(json.live ?? null);
      setDirty(false);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [onClose]);

  useEffect(() => {
    if (open) {
      setTab('cover');
      void load();
    }
  }, [open, load]);

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

  if (!open) return null;

  return (
    <div
      className="modal-overlay open village-pptx-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Préparer la présentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !saving && !exporting) onClose();
      }}
    >
      <div className="village-pptx-modal">
        <div className="village-pptx-modal-head">
          <div>
            <h3>Préparer la présentation</h3>
            <p>
              Slides préremplies, modifiables — le dashboard et les maisons vides restent calés sur les données du système.
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
                disabled={!deck || exporting || loading}
                onClick={() => void exportPptx()}
              >
                {exporting ? <span className="btn-spinner" aria-hidden="true" /> : null}
                {exporting ? 'Export…' : 'Exporter PPTX'}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={saving || exporting}
              onClick={onClose}
            >
              Fermer
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
              <p className="village-pptx-preview-line">
                {deck.cover.title} HELD ON {deck.cover.date}, IN {deck.cover.place}
              </p>
            </div>
          ) : tab === 'dashboard' ? (
            <div className="village-pptx-grid">
              <Field
                label="Titre de la slide"
                value={deck.dashboard.title}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, dashboard: { ...p.dashboard, title: v } }))}
              />
              <Area
                label="Note (optionnelle)"
                value={deck.dashboard.note}
                disabled={!canEdit}
                onChange={(v) => patch((p) => ({ ...p, dashboard: { ...p.dashboard, note: v } }))}
              />
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
              {deck.proposals.items.map((item, index) => (
                <div key={item.id} className="village-pptx-proposal">
                  <div className="village-pptx-proposal-head">
                    <strong>#{index + 1}</strong>
                    {canEdit && (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
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
                        Retirer
                      </button>
                    )}
                  </div>
                  <div className="village-pptx-proposal-grid">
                    <Field
                      label="House"
                      value={item.house}
                      disabled={!canEdit}
                      onChange={(v) => updateProposal(item.id, { house: v })}
                    />
                    <Field
                      label="Name / role"
                      value={item.name}
                      disabled={!canEdit}
                      onChange={(v) => updateProposal(item.id, { name: v })}
                    />
                    <Field
                      label="ID"
                      value={item.matricule}
                      disabled={!canEdit}
                      onChange={(v) => updateProposal(item.id, { matricule: v })}
                    />
                    <Field
                      label="Purpose"
                      value={item.purpose}
                      disabled={!canEdit}
                      onChange={(v) => updateProposal(item.id, { purpose: v })}
                    />
                    <label className="village-pptx-field">
                      Badge
                      <select
                        className="filter-select"
                        value={item.badge}
                        disabled={!canEdit}
                        onChange={(e) =>
                          updateProposal(item.id, {
                            badge: e.target.value === 'role' ? 'role' : 'proposal',
                          })
                        }
                      >
                        <option value="proposal">Proposal</option>
                        <option value="role">Role / use</option>
                      </select>
                    </label>
                  </div>
                </div>
              ))}
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
              <p className="village-pptx-preview-line">
                {deck.thankYou.kicker}
                <br />
                <strong>{deck.thankYou.message}</strong>
                <br />
                {deck.period}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
