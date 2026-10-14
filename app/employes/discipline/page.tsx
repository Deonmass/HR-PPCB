'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import PpcDisciplineDashboard from '@/components/discipline/PpcDisciplineDashboard';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  PPC_DISCIPLINE_SANCTIONS,
  PPC_DISCIPLINE_STATUTS,
  type PpcDisciplineAgent,
  type PpcDisciplineCase,
  type PpcDisciplineEvent,
  type PpcDisciplineStatut,
} from '@/lib/ppc-discipline-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

type PageTab = 'dashboard' | 'liste' | 'nouveau';
type DetailTab = 'dossier' | 'actions' | 'historique';

type CaseForm = {
  matricule: string;
  employeeName: string;
  departement: string;
  jobTitle: string;
  parti: boolean;
  dateIncident: string;
  motif: string;
  faits: string;
  demandeDate: string;
  demandeEcheance: string;
  demandeLien: string;
};

const MENU = 'employes.discipline';

const EMPTY_FORM: CaseForm = {
  matricule: '',
  employeeName: '',
  departement: '',
  jobTitle: '',
  parti: false,
  dateIncident: new Date().toISOString().slice(0, 10),
  motif: '',
  faits: '',
  demandeDate: new Date().toISOString().slice(0, 10),
  demandeEcheance: '',
  demandeLien: '',
};

const EVENT_LABEL: Record<PpcDisciplineEvent['type'], string> = {
  ouverture: 'Ouverture',
  demande: "Demande d'explication",
  reponse: "Réponse de l'agent",
  sanction: 'Sanction',
  statut: 'Statut',
  commentaire: 'Commentaire',
};

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

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function statutClass(statut: string): string {
  if (statut === 'Ouvert') return 'is-ouvert';
  if (statut === "Demande d'explication") return 'is-demande';
  if (statut === 'Réponse reçue') return 'is-reponse';
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

function documentHref(value: string): string {
  return value.trim();
}

function DocLink({ href, label }: { href: string; label?: string }) {
  const value = documentHref(href);
  if (!value) return <>—</>;
  return (
    <a
      className="ppc-discipline-doc-link"
      href={value}
      target="_blank"
      rel="noopener noreferrer"
      title={value}
      onClick={(event) => event.stopPropagation()}
    >
      {label || value}
    </a>
  );
}

function EventText({ value }: { value: string }) {
  const lines = value.split('\n');
  return (
    <p>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        const isLink = /^(https?:\/\/|file:\/\/|\\\\|[a-zA-Z]:\\|\/)/i.test(trimmed);
        return (
          <span key={`${index}-${trimmed.slice(0, 24)}`}>
            {index > 0 ? <br /> : null}
            {isLink ? <DocLink href={trimmed} /> : line}
          </span>
        );
      })}
    </p>
  );
}

function dateCell(date: string, lien: string) {
  if (!date && !lien.trim()) return '—';
  const label = date ? formatDate(date) : 'Document';
  if (lien.trim()) return <DocLink href={lien} label={label} />;
  return label;
}

function Spinner({ label }: { label: string }) {
  return (
    <>
      <span className="btn-spinner" aria-hidden="true" />
      {label}
    </>
  );
}

export default function PpcDisciplinePage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create') || can(MENU, 'edit');
  const canEdit = can(MENU, 'edit');
  const canDelete = can(MENU, 'delete');

  const [tab, setTab] = useState<PageTab>('dashboard');
  const [cases, setCases] = useState<PpcDisciplineCase[]>([]);
  const [agents, setAgents] = useState<PpcDisciplineAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statutFilter, setStatutFilter] = useState('');
  const [form, setForm] = useState<CaseForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<PpcDisciplineCase | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>('dossier');
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<PpcDisciplineCase> | null>(null);
  const [demandeDate, setDemandeDate] = useState(todayIso());
  const [demandeLien, setDemandeLien] = useState('');
  const [demandeEcheance, setDemandeEcheance] = useState('');
  const [reponseDate, setReponseDate] = useState(todayIso());
  const [reponseLien, setReponseLien] = useState('');
  const [sanction, setSanction] = useState('Aucune');
  const [dateSanction, setDateSanction] = useState(todayIso());
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: PpcDisciplineCase } | null>(null);

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/employes/discipline');
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Chargement des cas impossible');
        return;
      }
      const list = Array.isArray(json.cases) ? (json.cases as PpcDisciplineCase[]) : [];
      const people = Array.isArray(json.agents) ? (json.agents as PpcDisciplineAgent[]) : [];
      setCases(list);
      setAgents(people);
      setSelected((prev) => (prev ? list.find((c) => c.id === prev.id) ?? null : null));
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
    if (!selected) {
      setEditDraft(null);
      return;
    }
    setEditDraft({
      dateIncident: selected.dateIncident,
      motif: selected.motif,
      faits: selected.faits,
      statut: selected.statut,
    });
    setDemandeDate(selected.demandeDate || todayIso());
    setDemandeLien(selected.demandeLien || '');
    setDemandeEcheance(selected.demandeEcheance || '');
    setReponseDate(selected.reponseDate || '');
    setReponseLien(selected.reponseLien || '');
    setSanction(selected.sanction || 'Aucune');
    setDateSanction(selected.dateSanction || '');
    setComment('');
  }, [selected]);

  const pickerEmployees = useMemo(
    () => agents.map((agent) => ({
      matricule: agent.matricule,
      nom: agent.nom,
      departement: agent.departement,
      jobTitle: agent.jobTitle,
      localisation: '',
      cnss: '',
      parti: agent.parti,
    })) as unknown as Employee[],
    [agents],
  );

  const filteredCases = useMemo(() => {
    const q = search.trim().toLowerCase();
    return cases.filter((c) => {
      if (statutFilter && c.statut !== statutFilter) return false;
      if (!q) return true;
      return [c.employeeName, c.matricule, c.departement, c.motif, c.sanction]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [cases, search, statutFilter]);

  async function submitNew() {
    if (!canCreate) return;
    if (!form.matricule) {
      await showError('Sélectionnez un agent PPC');
      return;
    }
    if (!form.motif.trim()) {
      await showError('Motif requis');
      return;
    }
    if (!form.demandeDate) {
      await showError('Date d’envoi de la demande requise');
      return;
    }
    if (!form.demandeEcheance) {
      await showError('Échéance de réponse requise');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/employes/discipline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matricule: form.matricule,
          employeeName: form.employeeName,
          departement: form.departement,
          jobTitle: form.jobTitle,
          parti: form.parti,
          dateIncident: form.dateIncident,
          motif: form.motif.trim(),
          faits: form.faits.trim(),
          demandeDate: form.demandeDate,
          demandeEcheance: form.demandeEcheance,
          demandeLien: form.demandeLien.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      setForm({ ...EMPTY_FORM, dateIncident: todayIso(), demandeDate: todayIso() });
      setTab('liste');
      setDetailTab('dossier');
      setEditing(false);
      if (json?.id) {
        const saved = json as PpcDisciplineCase;
        setCases((prev) => [saved, ...prev.filter((c) => c.id !== saved.id)]);
        setSelected(saved);
      }
      void showSuccess('Cas enregistré avec la demande d’explication');
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  }

  async function runAction(action: string, body: Record<string, unknown>, success: string) {
    if (!selected || !canEdit) return;
    setBusy(action);
    try {
      const res = await fetch('/api/employes/discipline', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selected.id, action, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Mise à jour impossible');
        return;
      }
      const saved = json as PpcDisciplineCase;
      setCases((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      setSelected(saved);
      setEditing(false);
      if (action === 'commentaire' || action === 'sanction' || action === 'actions') setComment('');
      void showSuccess(success);
    } catch {
      await showError('Erreur de mise à jour');
    } finally {
      setBusy('');
    }
  }

  async function removeCase(item: PpcDisciplineCase) {
    if (!canDelete) return;
    const ok = await confirmDelete(
      'Supprimer ce cas ?',
      `${item.employeeName} — ${item.motif || 'sans motif'}`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/employes/discipline?id=${encodeURIComponent(item.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Cas supprimé');
      if (selected?.id === item.id) setSelected(null);
      setCases((prev) => prev.filter((c) => c.id !== item.id));
    } catch {
      await showError('Erreur de suppression');
    }
  }

  function openCase(item: PpcDisciplineCase, nextTab: DetailTab = 'dossier') {
    setDetailTab(nextTab);
    setEditing(false);
    setSelected(item);
    setContextMenu(null);
  }

  const agentCases = useMemo(() => {
    if (!selected) return [];
    return cases
      .filter((c) => c.matricule === selected.matricule)
      .sort((a, b) => new Date(b.dateIncident || b.createdAt).getTime() - new Date(a.dateIncident || a.createdAt).getTime());
  }, [cases, selected]);

  const contextItems: ContextMenuItem[] = contextMenu ? [
    { id: 'dossier', label: 'Ouvrir le dossier', icon: 'view', onClick: () => openCase(contextMenu.item, 'dossier') },
    ...(canEdit && contextMenu.item.statut !== 'Clos' ? [
      { id: 'demande', label: "Demande d'explication", icon: 'doc' as const, onClick: () => openCase(contextMenu.item, 'actions') },
      { id: 'reponse', label: 'Enregistrer la réponse', icon: 'doc' as const, onClick: () => openCase(contextMenu.item, 'actions') },
      { id: 'sanction', label: 'Sanction', icon: 'edit' as const, onClick: () => openCase(contextMenu.item, 'actions') },
    ] : []),
    ...(canDelete ? [{
      id: 'delete',
      label: 'Supprimer',
      icon: 'delete' as const,
      danger: true,
      onClick: () => {
        const item = contextMenu.item;
        setContextMenu(null);
        void removeCase(item);
      },
    }] : []),
  ] : [];

  const locked = selected?.statut === 'Clos';

  return (
    <PermissionGate menuId={MENU} action="view">
      <div className="contractants-page ppc-discipline-page">
        <div className="contractants-sticky">
          <div className="page-header page-header-with-tabs contractants-header">
            <div>
              <div className="page-header-title-row">
                <h2>Cas disciplinaires</h2>
                <RefreshButton onClick={() => void load(true)} loading={refreshing} />
              </div>
              <p>Agents PPC — demande d&apos;explication, réponse et historique</p>
            </div>
            <div className="contractants-header-actions">
              <div className="tabs header-tabs header-tabs-compact contractants-tabs">
                <button type="button" className={`tab-btn tab-btn-sm${tab === 'dashboard' ? ' active' : ''}`} onClick={() => setTab('dashboard')}>
                  Dashboard
                </button>
                <button type="button" className={`tab-btn tab-btn-sm${tab === 'liste' ? ' active' : ''}`} onClick={() => setTab('liste')}>
                  Liste
                  <span className="employees-tab-count">{cases.length}</span>
                </button>
                {canCreate && (
                  <button type="button" className={`tab-btn tab-btn-sm${tab === 'nouveau' ? ' active' : ''}`} onClick={() => setTab('nouveau')}>
                    Nouveau cas
                  </button>
                )}
              </div>
              {canCreate && tab !== 'nouveau' && (
                <button type="button" className="btn btn-accent btn-icon-only" onClick={() => setTab('nouveau')} title="Nouveau cas" aria-label="Nouveau cas">
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
            <PpcDisciplineDashboard cases={cases} />
          ) : tab === 'liste' ? (
            <div className="panel contractants-emp-list-panel">
              <div className="contractants-emp-list-toolbar">
                <input
                  type="search"
                  className="search-input"
                  placeholder="Rechercher un agent, un matricule ou un motif…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select value={statutFilter} onChange={(e) => setStatutFilter(e.target.value)} aria-label="Filtrer par statut">
                  <option value="">Tous les statuts</option>
                  {PPC_DISCIPLINE_STATUTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              {filteredCases.length === 0 ? (
                <div className="empty-state">
                  <p>{search.trim() || statutFilter ? 'Aucun résultat.' : 'Aucun cas disciplinaire.'}</p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Agent</th>
                        <th>Département</th>
                        <th>Date</th>
                        <th>Motif</th>
                        <th>Statut</th>
                        <th>Demande</th>
                        <th>Réponse</th>
                        <th>Sanction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCases.map((item) => (
                        <tr
                          key={item.id}
                          className="is-clickable"
                          title="Clic droit pour les actions"
                          onClick={() => openCase(item, 'dossier')}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            setContextMenu({ x: event.clientX, y: event.clientY, item });
                          }}
                        >
                          <td>
                            <span className={item.parti ? 'charroi-user-left' : undefined}>{item.employeeName || '—'}</span>
                            {item.matricule ? <div className="ppc-discipline-meta">{item.matricule}</div> : null}
                          </td>
                          <td>{item.departement || '—'}</td>
                          <td>{formatDate(item.dateIncident)}</td>
                          <td>{item.motif || '—'}</td>
                          <td>
                            <span className={`contractant-discipline-statut ${statutClass(item.statut)}`}>{item.statut}</span>
                          </td>
                          <td>{dateCell(item.demandeDate, item.demandeLien)}</td>
                          <td>{dateCell(item.reponseDate, item.reponseLien)}</td>
                          <td>{item.dateSanction ? `${item.sanction || '—'} · ${formatDate(item.dateSanction)}` : (item.sanction || '—')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="panel contractant-discipline-form-panel">
              <h3 style={{ marginTop: 0 }}>Nouveau cas — agent PPC</h3>
              <div className="contractant-discipline-form">
                <div className="form-group contractant-discipline-span">
                  <label>Agent *</label>
                  <EmployeeSuggestInput
                    employees={pickerEmployees}
                    value={form.employeeName}
                    onChange={(value) => setForm({ ...form, employeeName: value, matricule: '' })}
                    onEmployeeSelect={(employee) => {
                      const agent = agents.find((a) => a.matricule === employee.matricule);
                      setForm({
                        ...form,
                        matricule: employee.matricule,
                        employeeName: employee.nom,
                        departement: employee.departement || '',
                        jobTitle: employee.jobTitle || '',
                        parti: agent?.parti === true,
                      });
                    }}
                    placeholder="Rechercher un agent PPC…"
                  />
                  {form.matricule ? (
                    <p className="ppc-discipline-meta">
                      {form.matricule}
                      {form.departement ? ` · ${form.departement}` : ''}
                      {form.jobTitle ? ` · ${form.jobTitle}` : ''}
                      {form.parti ? ' · a quitté' : ''}
                    </p>
                  ) : null}
                </div>
                <div className="form-group">
                  <label>Date de l&apos;incident *</label>
                  <input type="date" required value={form.dateIncident} onChange={(e) => setForm({ ...form, dateIncident: e.target.value })} />
                </div>
                <div className="form-group contractant-discipline-span">
                  <label>Motif *</label>
                  <input required value={form.motif} onChange={(e) => setForm({ ...form, motif: e.target.value })} placeholder="Résumé du motif" />
                </div>
                <div className="form-group contractant-discipline-span">
                  <label>Faits</label>
                  <textarea rows={3} value={form.faits} onChange={(e) => setForm({ ...form, faits: e.target.value })} placeholder="Description des faits" />
                </div>
                <div className="form-group">
                  <label>Date d&apos;envoi de la demande *</label>
                  <input type="date" required value={form.demandeDate} onChange={(e) => setForm({ ...form, demandeDate: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Échéance de réponse *</label>
                  <input type="date" required value={form.demandeEcheance} onChange={(e) => setForm({ ...form, demandeEcheance: e.target.value })} />
                </div>
                <div className="form-group contractant-discipline-span">
                  <label>Lien de la demande</label>
                  <input
                    type="text"
                    value={form.demandeLien}
                    onChange={(e) => setForm({ ...form, demandeLien: e.target.value })}
                    placeholder="https://… ou chemin du fichier"
                  />
                </div>
                <div className="contractant-discipline-span" style={{ display: 'flex', gap: '0.45rem' }}>
                  <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => void submitNew()}>
                    {saving ? <Spinner label="Enregistrement…" /> : 'Enregistrer le cas'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" disabled={saving} onClick={() => setTab('liste')}>
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {selected && editDraft && (
        <div className="modal-overlay open" onClick={() => !busy && setSelected(null)}>
          <div className="modal ppc-discipline-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header ppc-discipline-modal-header">
              <h3>
                <span className={selected.parti ? 'charroi-user-left' : undefined}>{selected.employeeName || 'Cas disciplinaire'}</span>
              </h3>
              <div className="ppc-discipline-header-end">
                <div className="tabs ppc-discipline-tabs" role="tablist">
                  <button type="button" className={`tab-btn${detailTab === 'dossier' ? ' active' : ''}`} onClick={() => setDetailTab('dossier')}>Dossier</button>
                  <button type="button" className={`tab-btn${detailTab === 'actions' ? ' active' : ''}`} onClick={() => setDetailTab('actions')}>Actions</button>
                  <button type="button" className={`tab-btn${detailTab === 'historique' ? ' active' : ''}`} onClick={() => setDetailTab('historique')}>Historique agents</button>
                </div>
                <button type="button" className="modal-close" onClick={() => !busy && setSelected(null)}>&times;</button>
              </div>
            </div>
            <div className="modal-body ppc-discipline-panel">
              {detailTab === 'dossier' && (
                <div className="ppc-discipline-main">
                  <p className="ppc-discipline-meta">
                    {selected.matricule || '—'}
                    {selected.departement ? ` · ${selected.departement}` : ''}
                    {selected.jobTitle ? ` · ${selected.jobTitle}` : ''}
                    {selected.parti ? ' · a quitté' : ''}
                  </p>
                  <span className={`contractant-discipline-statut ${statutClass(selected.statut)}`}>{selected.statut}</span>

                  {editing ? (
                    <>
                      <div className="form-group">
                        <label>Date de l&apos;incident</label>
                        <input type="date" value={String(editDraft.dateIncident || '')} onChange={(e) => setEditDraft({ ...editDraft, dateIncident: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>Motif</label>
                        <input value={String(editDraft.motif || '')} onChange={(e) => setEditDraft({ ...editDraft, motif: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>Faits</label>
                        <textarea rows={3} value={String(editDraft.faits || '')} onChange={(e) => setEditDraft({ ...editDraft, faits: e.target.value })} />
                      </div>
                      <div className="form-group">
                        <label>Statut</label>
                        <select
                          value={String(editDraft.statut || selected.statut)}
                          onChange={(e) => setEditDraft({ ...editDraft, statut: e.target.value as PpcDisciplineStatut })}
                        >
                          {PPC_DISCIPLINE_STATUTS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </>
                  ) : (
                    <>
                      <dl className="ppc-discipline-info">
                        <dt>Date de l&apos;incident</dt>
                        <dd>{formatDate(selected.dateIncident)}</dd>
                        <dt>Motif</dt>
                        <dd>{selected.motif || '—'}</dd>
                        <dt>Faits</dt>
                        <dd>{selected.faits || '—'}</dd>
                        <dt>Demande</dt>
                        <dd>{dateCell(selected.demandeDate, selected.demandeLien)}</dd>
                        <dt>Échéance</dt>
                        <dd>{selected.demandeEcheance ? formatDate(selected.demandeEcheance) : '—'}</dd>
                        <dt>Réponse</dt>
                        <dd>{dateCell(selected.reponseDate, selected.reponseLien)}</dd>
                        <dt>Sanction</dt>
                        <dd>{selected.dateSanction ? `${selected.sanction || '—'} · ${formatDate(selected.dateSanction)}` : (selected.sanction || '—')}</dd>
                      </dl>
                    </>
                  )}
                </div>
              )}

              {detailTab === 'actions' && (
              <div className="ppc-discipline-main">

                <section className="ppc-discipline-step">
                  <h4>Demande d&apos;explication</h4>
                  <div className="ppc-discipline-step-grid">
                    <div className="form-group">
                      <label>Date d&apos;envoi</label>
                      <input type="date" disabled={!canEdit || locked} value={demandeDate} onChange={(e) => setDemandeDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>Échéance de réponse</label>
                      <input type="date" disabled={!canEdit || locked} value={demandeEcheance} onChange={(e) => setDemandeEcheance(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Lien du document</label>
                    <input
                      type="text"
                      disabled={!canEdit || locked}
                      value={demandeLien}
                      onChange={(e) => setDemandeLien(e.target.value)}
                      placeholder="https://… ou chemin du fichier"
                    />
                  </div>
                  {canEdit && !locked && (
                    <div className="ppc-discipline-step-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() => {
                          if (!demandeDate || !demandeEcheance) {
                            void showError('Date d’envoi et échéance sont requises');
                            return;
                          }
                          void runAction('demande', {
                            demandeDate,
                            demandeLien,
                            demandeEcheance,
                          }, 'Demande d’explication enregistrée');
                        }}
                      >
                        {busy === 'demande' ? <Spinner label="Enregistrement…" /> : 'Enregistrer la demande'}
                      </button>
                    </div>
                  )}
                </section>

                <section className="ppc-discipline-step">
                  <h4>Réponse de l&apos;agent</h4>
                  <div className="form-group">
                    <label>Date de la réponse</label>
                    <input type="date" disabled={!canEdit || locked} value={reponseDate} onChange={(e) => setReponseDate(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Lien du document</label>
                    <input
                      type="text"
                      disabled={!canEdit || locked}
                      value={reponseLien}
                      onChange={(e) => setReponseLien(e.target.value)}
                      placeholder="https://… ou chemin du fichier"
                    />
                  </div>
                  {canEdit && !locked && (
                    <div className="ppc-discipline-step-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={Boolean(busy) || !reponseDate}
                        onClick={() => void runAction('reponse', {
                          reponseDate,
                          reponseLien,
                        }, 'Réponse enregistrée')}
                      >
                        {busy === 'reponse' ? <Spinner label="Enregistrement…" /> : 'Enregistrer la réponse'}
                      </button>
                    </div>
                  )}
                </section>

                <section className="ppc-discipline-step">
                  <h4>Sanction</h4>
                  <div className="ppc-discipline-step-grid">
                    <div className="form-group">
                      <label>Décision</label>
                      <select disabled={!canEdit || locked} value={sanction} onChange={(e) => setSanction(e.target.value)}>
                        {PPC_DISCIPLINE_SANCTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date</label>
                      <input type="date" disabled={!canEdit || locked} value={dateSanction} onChange={(e) => setDateSanction(e.target.value)} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Note</label>
                    <textarea
                      rows={2}
                      disabled={!canEdit || locked}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Note ajoutée à l’historique avec la sanction"
                    />
                  </div>
                  <p className="ppc-discipline-meta">La sanction s’enregistre seule. Elle clôture le cas et ajoute la note à l’historique. La réponse peut rester vide.</p>
                  {canEdit && !locked && (
                    <div className="ppc-discipline-step-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={Boolean(busy) || sanction === 'Aucune'}
                        onClick={() => void runAction('sanction', {
                          sanction,
                          dateSanction: dateSanction || todayIso(),
                          texte: comment,
                        }, 'Sanction enregistrée — cas clôturé')}
                      >
                        {busy === 'sanction' ? <Spinner label="Enregistrement…" /> : 'Enregistrer la sanction'}
                      </button>
                    </div>
                  )}
                </section>
              </div>
              )}

              {detailTab === 'historique' && (
                <div className="ppc-discipline-history">
                  {agentCases.length === 0 ? (
                    <p className="ppc-discipline-meta">Aucun dossier pour cet agent.</p>
                  ) : agentCases.map((dossier) => {
                    const events = [...dossier.historique].sort(
                      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
                    );
                    return (
                      <section key={dossier.id} className="ppc-discipline-step">
                        <h4>
                          {formatDate(dossier.dateIncident)} — {dossier.motif || 'Sans motif'}
                        </h4>
                        <p className="ppc-discipline-meta">
                          {dossier.statut}
                          {dossier.demandeDate ? ` · Demande ${formatDate(dossier.demandeDate)}` : ''}
                          {dossier.reponseDate ? ` · Réponse ${formatDate(dossier.reponseDate)}` : ''}
                        </p>
                        {events.length === 0 ? (
                          <p className="ppc-discipline-meta">Aucun événement.</p>
                        ) : (
                          <ol className="ppc-discipline-timeline">
                            {events.map((event) => (
                              <li key={event.id}>
                                <strong>{EVENT_LABEL[event.type] || event.type}</strong>
                                <span>{formatDate(event.date)} · {event.auteur} · {formatDateTime(event.createdAt)}</span>
                                <EventText value={event.texte} />
                              </li>
                            ))}
                          </ol>
                        )}
                      </section>
                    );
                  })}
                </div>
              )}
            </div>
            {canEdit && detailTab === 'dossier' && (
              <div className="modal-footer">
                {detailTab === 'dossier' && !editing && (
                  <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => setEditing(true)}>
                    Modifier
                  </button>
                )}
                {detailTab === 'dossier' && editing && (
                  <>
                    <button type="button" className="btn btn-secondary btn-sm" disabled={Boolean(busy)} onClick={() => setEditing(false)}>
                      Annuler
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={Boolean(busy)}
                      onClick={() => void runAction('update', {
                        dateIncident: editDraft.dateIncident,
                        motif: editDraft.motif,
                        faits: editDraft.faits,
                        statut: editDraft.statut,
                      }, 'Dossier mis à jour')}
                    >
                      {busy === 'update' ? <Spinner label="Enregistrement…" /> : 'Enregistrer'}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {contextMenu && contextItems.length > 0 && (
        <RowContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </PermissionGate>
  );
}
