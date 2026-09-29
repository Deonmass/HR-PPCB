'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  CONTRACTANT_DISCIPLINE_SANCTIONS,
  CONTRACTANT_DISCIPLINE_STATUTS,
  type ContractantDisciplineCase,
  type ContractantDisciplineStatut,
} from '@/lib/contractant-discipline-types';
import type { Contractant } from '@/lib/contractants-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

type PageTab = 'dashboard' | 'liste' | 'nouveau';

type FlatEmployee = {
  id: string;
  nom: string;
  contractantId: string;
  contractantNom: string;
};

type CaseForm = {
  employeeKey: string;
  dateIncident: string;
  motif: string;
  explication: string;
  reponse: string;
  sanction: string;
  statut: ContractantDisciplineStatut;
};

type DrillFilter = {
  title: string;
  predicate: (c: ContractantDisciplineCase) => boolean;
};

const MENU = 'employes.contractants';

const EMPTY_FORM: CaseForm = {
  employeeKey: '',
  dateIncident: new Date().toISOString().slice(0, 10),
  motif: '',
  explication: '',
  reponse: '',
  sanction: 'Aucune',
  statut: 'Ouvert',
};

const DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'employe', label: 'Employé' },
  { key: 'date', label: 'Date' },
  { key: 'motif', label: 'Motif' },
  { key: 'statut', label: 'Statut' },
  { key: 'sanction', label: 'Sanction' },
];

function formatDate(value: string): string {
  if (!value) return '—';
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR');
}

function formatDateTime(value: string): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('fr-FR');
}

function statutClass(statut: string): string {
  if (statut === 'Ouvert') return 'is-ouvert';
  if (statut === 'En cours') return 'is-encours';
  if (statut === 'Clos') return 'is-clos';
  return '';
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function empKey(contractantId: string, employeeId: string): string {
  return `${contractantId}::${employeeId}`;
}

export default function ContractantDisciplinePage() {
  const { can, user } = usePermissions();
  const canCreate = can(MENU, 'create') || can(MENU, 'edit');
  const canEdit = can(MENU, 'edit');
  const canDelete = can(MENU, 'delete');

  const [tab, setTab] = useState<PageTab>('dashboard');
  const [cases, setCases] = useState<ContractantDisciplineCase[]>([]);
  const [employees, setEmployees] = useState<FlatEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<CaseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<ContractantDisciplineCase | null>(null);
  const [editDraft, setEditDraft] = useState<Partial<ContractantDisciplineCase> | null>(null);
  const [comment, setComment] = useState('');
  const [detailSaving, setDetailSaving] = useState(false);
  const [drill, setDrill] = useState<DrillFilter | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [casesRes, contractantsRes] = await Promise.all([
        fetch('/api/employes/contractants/discipline'),
        fetch('/api/employes/contractants'),
      ]);
      const casesJson = await casesRes.json().catch(() => ({}));
      const contractantsJson = await contractantsRes.json().catch(() => ({}));
      if (!casesRes.ok) {
        await showError(casesJson?.error || 'Chargement des cas impossible');
        return;
      }
      if (!contractantsRes.ok) {
        await showError(contractantsJson?.error || 'Chargement des employés impossible');
        return;
      }

      const list = Array.isArray(casesJson.cases) ? (casesJson.cases as ContractantDisciplineCase[]) : [];
      setCases(list);

      const contractants = Array.isArray(contractantsJson.contractants)
        ? (contractantsJson.contractants as Contractant[])
        : [];
      const flat: FlatEmployee[] = [];
      for (const c of contractants) {
        for (const emp of c.employees || []) {
          if (!emp?.id || !emp.nom?.trim()) continue;
          flat.push({
            id: emp.id,
            nom: emp.nom.trim(),
            contractantId: c.id,
            contractantNom: c.denomination || '',
          });
        }
      }
      flat.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
      setEmployees(flat);

      setSelected((prev) => {
        if (!prev) return null;
        return list.find((c) => c.id === prev.id) ?? null;
      });
    } catch {
      await showError('Erreur de chargement');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected) {
      setEditDraft({
        dateIncident: selected.dateIncident,
        motif: selected.motif,
        explication: selected.explication,
        reponse: selected.reponse,
        sanction: selected.sanction,
        statut: selected.statut,
      });
      setComment('');
    } else {
      setEditDraft(null);
      setComment('');
    }
  }, [selected]);

  const kpis = useMemo(() => {
    const total = cases.length;
    const ouvert = cases.filter((c) => c.statut === 'Ouvert').length;
    const enCours = cases.filter((c) => c.statut === 'En cours').length;
    const clos = cases.filter((c) => c.statut === 'Clos').length;
    return { total, ouvert, enCours, clos };
  }, [cases]);

  const topEmployees = useMemo(() => {
    const counts = new Map<string, { name: string; count: number }>();
    for (const c of cases) {
      const key = c.employeeId || c.employeeName;
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { name: c.employeeName || '—', count: 1 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'fr')).slice(0, 8);
  }, [cases]);

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? cases.filter((c) => c.employeeName.toLowerCase().includes(q) || c.motif.toLowerCase().includes(q))
      : [...cases];
    return list.sort((a, b) => {
      const byName = a.employeeName.localeCompare(b.employeeName, 'fr');
      if (byName !== 0) return byName;
      return new Date(b.dateIncident || b.createdAt).getTime() - new Date(a.dateIncident || a.createdAt).getTime();
    });
  }, [cases, search]);

  const drillRows: DashboardListRow[] = useMemo(() => {
    if (!drill) return [];
    return cases
      .filter(drill.predicate)
      .sort(
        (a, b) =>
          new Date(b.dateIncident || b.createdAt).getTime() - new Date(a.dateIncident || a.createdAt).getTime(),
      )
      .map((c) => ({
        id: c.id,
        cells: {
          employe: c.employeeName || '—',
          date: formatDate(c.dateIncident),
          motif: c.motif || '—',
          statut: c.statut,
          sanction: c.sanction || '—',
        },
      }));
  }, [cases, drill]);

  async function submitNew() {
    if (!canCreate) return;
    const emp = employees.find((e) => empKey(e.contractantId, e.id) === form.employeeKey);
    if (!emp) {
      await showError('Sélectionnez un employé');
      return;
    }
    if (!form.motif.trim()) {
      await showError('Motif requis');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/employes/contractants/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractantId: emp.contractantId,
          employeeId: emp.id,
          employeeName: emp.nom,
          dateIncident: form.dateIncident,
          motif: form.motif.trim(),
          explication: form.explication.trim(),
          reponse: form.reponse.trim(),
          sanction: form.sanction,
          statut: form.statut,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess('Cas disciplinaire créé');
      setForm({ ...EMPTY_FORM, dateIncident: new Date().toISOString().slice(0, 10) });
      setTab('liste');
      await load(true);
      if (json?.id) setSelected(json as ContractantDisciplineCase);
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  }

  async function saveDetail(opts?: { withComment?: boolean }) {
    if (!selected || !canEdit || !editDraft) return;
    if (!String(editDraft.motif || '').trim()) {
      await showError('Motif requis');
      return;
    }
    const commentText = opts?.withComment ? comment.trim() : '';
    if (opts?.withComment && !commentText) {
      await showError('Commentaire vide');
      return;
    }
    setDetailSaving(true);
    try {
      const res = await fetch('/api/employes/contractants/discipline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          dateIncident: editDraft.dateIncident,
          motif: String(editDraft.motif || '').trim(),
          explication: String(editDraft.explication || '').trim(),
          reponse: String(editDraft.reponse || '').trim(),
          sanction: editDraft.sanction,
          statut: editDraft.statut,
          ...(commentText ? { comment: commentText } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Mise à jour impossible');
        return;
      }
      if (commentText) setComment('');
      await showSuccess(commentText ? 'Commentaire ajouté' : 'Cas mis à jour');
      await load(true);
      setSelected(json as ContractantDisciplineCase);
    } catch {
      await showError('Erreur de mise à jour');
    } finally {
      setDetailSaving(false);
    }
  }

  async function removeCase(item: ContractantDisciplineCase) {
    if (!canDelete) return;
    const ok = await confirmDelete(
      'Supprimer ce cas ?',
      `${item.employeeName} — ${item.motif || 'sans motif'}`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/employes/contractants/discipline?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Cas supprimé');
      if (selected?.id === item.id) setSelected(null);
      await load(true);
    } catch {
      await showError('Erreur de suppression');
    }
  }

  function openDrill(title: string, predicate: (c: ContractantDisciplineCase) => boolean) {
    setDrill({ title: `Voir la liste — ${title}`, predicate });
  }

  return (
    <PermissionGate menuId={MENU} action="view">
      <div className="contractants-page">
        <div className="contractants-sticky">
          <div className="page-header page-header-with-tabs contractants-header">
            <div>
              <div className="page-header-title-row">
                <h2>Cas disciplinaires</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
              <p>Suivi des incidents et sanctions — espace contractants</p>
            </div>
            <div className="contractants-header-actions">
              <div className="tabs header-tabs header-tabs-compact contractants-tabs">
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`}
                  onClick={() => setTab('dashboard')}
                >
                  Dashboard
                </button>
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${tab === 'liste' ? ' active' : ''}`}
                  onClick={() => setTab('liste')}
                >
                  Liste
                  <span className="employees-tab-count">{cases.length}</span>
                </button>
                {canCreate && (
                  <button
                    type="button"
                    className={`tab-btn tab-btn-sm${tab === 'nouveau' ? ' active' : ''}`}
                    onClick={() => setTab('nouveau')}
                  >
                    Nouveau cas
                  </button>
                )}
              </div>
              {canCreate && tab !== 'nouveau' && (
                <button
                  type="button"
                  className="btn btn-accent btn-icon-only"
                  onClick={() => setTab('nouveau')}
                  title="Nouveau cas"
                  aria-label="Nouveau cas"
                >
                  <PlusIcon />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="contractants-body">
          {loading ? (
            <div className="loading">Chargement...</div>
          ) : tab === 'dashboard' ? (
            <div className="mvt-dashboard">
              <div className="travel-history-cards mvt-kpi-strip postes-kpi-strip">
                <button
                  type="button"
                  className="card card-glow card-glow-red travel-history-card postes-kpi-card is-clickable"
                  title="Voir la liste — Tous les cas"
                  onClick={() => openDrill('Tous les cas', () => true)}
                >
                  <div className="card-label">Total</div>
                  <div className="card-value">{kpis.total}</div>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-amber travel-history-card postes-kpi-card is-clickable"
                  title="Voir la liste — Ouvert"
                  onClick={() => openDrill('Ouvert', (c) => c.statut === 'Ouvert')}
                >
                  <div className="card-label">Ouvert</div>
                  <div className="card-value">{kpis.ouvert}</div>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-cyan travel-history-card postes-kpi-card is-clickable"
                  title="Voir la liste — En cours"
                  onClick={() => openDrill('En cours', (c) => c.statut === 'En cours')}
                >
                  <div className="card-label">En cours</div>
                  <div className="card-value">{kpis.enCours}</div>
                </button>
                <button
                  type="button"
                  className="card card-glow card-glow-green travel-history-card postes-kpi-card is-clickable"
                  title="Voir la liste — Clos"
                  onClick={() => openDrill('Clos', (c) => c.statut === 'Clos')}
                >
                  <div className="card-label">Clos</div>
                  <div className="card-value">{kpis.clos}</div>
                </button>
              </div>

              <div className="panel" style={{ marginTop: '1rem' }}>
                <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem' }}>Top employés (nb. de cas)</h3>
                {topEmployees.length === 0 ? (
                  <p style={{ margin: 0, opacity: 0.7 }}>Aucun cas enregistré.</p>
                ) : (
                  <ol className="contractant-home-list">
                    {topEmployees.map((row, index) => (
                      <li key={`${row.name}-${index}`}>
                        <span className="contractant-home-rank">{index + 1}</span>
                        <div>
                          <strong>{row.name}</strong>
                        </div>
                        <button
                          type="button"
                          className="contractant-discipline-badge is-clickable"
                          title={`Voir la liste — ${row.name}`}
                          onClick={() =>
                            openDrill(row.name, (c) => (c.employeeName || '—') === row.name)
                          }
                        >
                          {row.count}
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          ) : tab === 'liste' ? (
            <div className="panel contractants-emp-list-panel">
              <div className="contractants-emp-list-toolbar">
                <input
                  type="search"
                  className="search-input"
                  placeholder="Rechercher par employé ou motif…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filteredCases.length === 0 ? (
                <div className="empty-state">
                  <p>{search.trim() ? 'Aucun résultat.' : 'Aucun cas disciplinaire.'}</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Employé</th>
                        <th>Date</th>
                        <th>Motif</th>
                        <th>Statut</th>
                        <th>Sanction</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((item) => (
                        <tr
                          key={item.id}
                          className="is-clickable"
                          onClick={() => setSelected(item)}
                          title="Voir le détail"
                        >
                          <td>{item.employeeName || '—'}</td>
                          <td>{formatDate(item.dateIncident)}</td>
                          <td>{item.motif || '—'}</td>
                          <td>
                            <span className={`contractant-discipline-statut ${statutClass(item.statut)}`}>
                              {item.statut}
                            </span>
                          </td>
                          <td>{item.sanction || '—'}</td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                onClick={() => setSelected(item)}
                              >
                                Détail
                              </button>
                              {canDelete && (
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm btn-danger-text"
                                  onClick={() => void removeCase(item)}
                                >
                                  Supprimer
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="panel contractant-discipline-form-panel">
              <h3 style={{ marginTop: 0 }}>Nouveau cas disciplinaire</h3>
              <div className="contractant-discipline-form">
                <div className="form-group">
                  <label>Employé *</label>
                  <select
                    required
                    value={form.employeeKey}
                    onChange={(e) => setForm({ ...form, employeeKey: e.target.value })}
                  >
                    <option value="">— Sélectionner —</option>
                    {employees.map((emp) => (
                      <option key={empKey(emp.contractantId, emp.id)} value={empKey(emp.contractantId, emp.id)}>
                        {emp.nom}
                        {emp.contractantNom ? ` (${emp.contractantNom})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Date de l&apos;incident *</label>
                  <input
                    type="date"
                    required
                    value={form.dateIncident}
                    onChange={(e) => setForm({ ...form, dateIncident: e.target.value })}
                  />
                </div>
                <div className="form-group contractant-discipline-span">
                  <label>Motif *</label>
                  <input
                    required
                    value={form.motif}
                    onChange={(e) => setForm({ ...form, motif: e.target.value })}
                    placeholder="Résumé du motif"
                  />
                </div>
                <div className="form-group contractant-discipline-span">
                  <label>Explication</label>
                  <textarea
                    rows={2}
                    value={form.explication}
                    onChange={(e) => setForm({ ...form, explication: e.target.value })}
                  />
                </div>
                <div className="form-group contractant-discipline-span">
                  <label>Réponse de l&apos;employé</label>
                  <textarea
                    rows={2}
                    value={form.reponse}
                    onChange={(e) => setForm({ ...form, reponse: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Sanction</label>
                  <select
                    value={form.sanction}
                    onChange={(e) => setForm({ ...form, sanction: e.target.value })}
                  >
                    {CONTRACTANT_DISCIPLINE_SANCTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Statut</label>
                  <select
                    value={form.statut}
                    onChange={(e) =>
                      setForm({ ...form, statut: e.target.value as ContractantDisciplineStatut })
                    }
                  >
                    {CONTRACTANT_DISCIPLINE_STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="contractant-discipline-span" style={{ display: 'flex', gap: '0.45rem' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={saving}
                    onClick={() => void submitNew()}
                  >
                    {saving ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Enregistrement…
                      </>
                    ) : (
                      'Enregistrer'
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    disabled={saving}
                    onClick={() => setTab('liste')}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && editDraft && (
        <div className="modal-overlay open" onClick={() => !detailSaving && setSelected(null)}>
          <div
            className="modal contractants-modal"
            style={{ maxWidth: 640 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3>{selected.employeeName || 'Cas disciplinaire'}</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !detailSaving && setSelected(null)}
              >
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ display: 'grid', gap: '0.75rem' }}>
              <div className="form-group">
                <label>Date de l&apos;incident</label>
                <input
                  type="date"
                  disabled={!canEdit}
                  value={String(editDraft.dateIncident || '')}
                  onChange={(e) => setEditDraft({ ...editDraft, dateIncident: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Motif</label>
                <input
                  disabled={!canEdit}
                  value={String(editDraft.motif || '')}
                  onChange={(e) => setEditDraft({ ...editDraft, motif: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Explication</label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={String(editDraft.explication || '')}
                  onChange={(e) => setEditDraft({ ...editDraft, explication: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Réponse</label>
                <textarea
                  rows={3}
                  disabled={!canEdit}
                  value={String(editDraft.reponse || '')}
                  onChange={(e) => setEditDraft({ ...editDraft, reponse: e.target.value })}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label>Sanction</label>
                  <select
                    disabled={!canEdit}
                    value={String(editDraft.sanction || 'Aucune')}
                    onChange={(e) => setEditDraft({ ...editDraft, sanction: e.target.value })}
                  >
                    {CONTRACTANT_DISCIPLINE_SANCTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Statut</label>
                  <select
                    disabled={!canEdit}
                    value={String(editDraft.statut || 'Ouvert')}
                    onChange={(e) =>
                      setEditDraft({
                        ...editDraft,
                        statut: e.target.value as ContractantDisciplineStatut,
                      })
                    }
                  >
                    {CONTRACTANT_DISCIPLINE_STATUTS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <h4 style={{ margin: '0.5rem 0 0.4rem', fontSize: '0.9rem' }}>Commentaires</h4>
                {selected.commentaires.length === 0 ? (
                  <p style={{ margin: 0, opacity: 0.7 }}>
                    Aucun commentaire.
                  </p>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: '0.5rem' }}>
                    {selected.commentaires.map((c) => (
                      <li
                        key={c.id}
                        style={{
                          padding: '0.55rem 0.7rem',
                          borderRadius: 8,
                          background: 'var(--surface-hover, rgba(0,0,0,0.04))',
                        }}
                      >
                        <div style={{ fontSize: '0.78rem', opacity: 0.75 }}>
                          {c.auteur || '—'} · {formatDateTime(c.createdAt)}
                        </div>
                        <div style={{ marginTop: 2, whiteSpace: 'pre-wrap' }}>{c.texte}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canEdit && (
                <div className="form-group">
                  <label>Ajouter un commentaire</label>
                  <textarea
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={user?.displayName ? `En tant que ${user.displayName}…` : 'Votre commentaire…'}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer" style={{ flexWrap: 'wrap', gap: '0.4rem' }}>
              {canDelete && (
                <button
                  type="button"
                  className="btn btn-ghost btn-danger-text"
                  disabled={detailSaving}
                  onClick={() => void removeCase(selected)}
                  style={{ marginRight: 'auto' }}
                >
                  Supprimer
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                disabled={detailSaving}
                onClick={() => setSelected(null)}
              >
                Fermer
              </button>
              {canEdit && (
                <>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={detailSaving || !comment.trim()}
                    onClick={() => void saveDetail({ withComment: true })}
                  >
                    Ajouter commentaire
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={detailSaving}
                    onClick={() => void saveDetail()}
                  >
                    {detailSaving ? (
                      <>
                        <span className="btn-spinner" aria-hidden="true" />
                        Enregistrement…
                      </>
                    ) : (
                      'Enregistrer'
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {drill && (
        <DashboardListModal
          title={drill.title}
          columns={DRILL_COLUMNS}
          rows={drillRows}
          onClose={() => setDrill(null)}
          searchPlaceholder="Employé, motif…"
        />
      )}
    </PermissionGate>
  );
}
