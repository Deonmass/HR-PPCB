'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  MOUVEMENT_TYPES,
  mouvementTypeLabel,
  type Mouvement,
  type MouvementsDashboard,
  type MouvementTypeId,
} from '@/lib/mouvements-types';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

type PageTab = 'dashboard' | 'liste';
type ModalMode = 'create' | 'edit' | 'view';

type FilterKey = 'numeroOrdre' | 'agent' | 'posteAvant' | 'posteActuel' | 'date' | 'type';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  numeroOrdre: [],
  agent: [],
  posteAvant: [],
  posteActuel: [],
  date: [],
  type: [],
};

function agentFilterValue(m: Mouvement): string {
  return `${m.agentNom} (${m.agentMatricule})`;
}

function formatDate(value: string): string {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR');
}

function typeBadgeClass(type: string): string {
  switch (type) {
    case 'nouvelle_affectation':
      return 'mvt-type-new';
    case 'promotion':
      return 'mvt-type-promo';
    case 'changement_transversal':
      return 'mvt-type-trans';
    case 'mutation_departement':
      return 'mvt-type-mut';
    case 'reclassement':
      return 'mvt-type-reclass';
    case 'retrogradation':
      return 'mvt-type-retro';
    default:
      return 'mvt-type-other';
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface FormState {
  agent: EmployeeSelection | null;
  posteAvant: string;
  departementAvant: string;
  posteActuel: string;
  departementActuel: string;
  date: string;
  type: MouvementTypeId;
  notes: string;
  applyToEmployee: boolean;
}

const EMPTY_FORM: FormState = {
  agent: null,
  posteAvant: '',
  departementAvant: '',
  posteActuel: '',
  departementActuel: '',
  date: todayIso(),
  type: 'changement_transversal',
  notes: '',
  applyToEmployee: true,
};

function formFromMouvement(m: Mouvement): FormState {
  return {
    agent: {
      matricule: m.agentMatricule,
      nom: m.agentNom,
      departement: m.departementActuel || m.departementAvant || '',
    },
    posteAvant: m.posteAvant,
    departementAvant: m.departementAvant,
    posteActuel: m.posteActuel,
    departementActuel: m.departementActuel,
    date: /^\d{4}-\d{2}-\d{2}/.test(m.date) ? m.date.slice(0, 10) : m.date,
    type: m.type,
    notes: m.notes || '',
    applyToEmployee: false,
  };
}

function EmptyMouvementsState({
  onCreate,
  canCreate,
  hasFilters,
}: {
  onCreate: () => void;
  canCreate: boolean;
  hasFilters: boolean;
}) {
  return (
    <div className="mvt-empty">
      <div className="mvt-empty-art" aria-hidden>
        <svg viewBox="0 0 240 160" width="200" height="132" fill="none">
          <ellipse cx="120" cy="138" rx="72" ry="10" fill="currentColor" opacity="0.06" />
          <rect x="48" y="36" width="144" height="88" rx="14" stroke="currentColor" strokeWidth="2" opacity="0.18" />
          <path
            d="M68 58h104M68 78h78M68 98h56"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.2"
          />
          <circle cx="168" cy="96" r="28" fill="var(--bg, #f8fafc)" stroke="currentColor" strokeWidth="2" opacity="0.28" />
          <path
            d="M158 96h20M168 86v20"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.32"
          />
          <path
            d="M186 114l14 14"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.28"
          />
        </svg>
      </div>
      <h3>{hasFilters ? 'Aucun résultat' : 'Aucun mouvement'}</h3>
      <p>
        {hasFilters
          ? 'Aucun mouvement ne correspond à votre recherche ou au filtre sélectionné.'
          : 'L’historique des affectations et changements de poste apparaîtra ici.'}
      </p>
      {canCreate && !hasFilters && (
        <button type="button" className="btn btn-primary mvt-empty-cta" onClick={onCreate}>
          + Enregistrer un mouvement
        </button>
      )}
    </div>
  );
}

function MouvementFormModal({
  open,
  mode,
  initial,
  employees,
  departments,
  posteSuggestions,
  saving,
  onClose,
  onSubmit,
  onEditFromView,
}: {
  open: boolean;
  mode: ModalMode;
  initial: FormState | null;
  employees: Employee[];
  departments: string[];
  posteSuggestions: string[];
  saving: boolean;
  onClose: () => void;
  onSubmit: (form: FormState) => Promise<void>;
  onEditFromView?: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [posteQuery, setPosteQuery] = useState('');
  const [posteOpen, setPosteOpen] = useState(false);
  const readOnly = mode === 'view';

  useEffect(() => {
    if (!open) return;
    if (mode === 'create' || !initial) {
      setForm({ ...EMPTY_FORM, date: todayIso() });
      setPosteQuery('');
    } else {
      setForm(initial);
      setPosteQuery(initial.posteActuel);
    }
  }, [open, mode, initial]);

  if (!open) return null;

  const title =
    mode === 'create' ? 'Nouveau mouvement' : mode === 'edit' ? 'Modifier le mouvement' : 'Détail du mouvement';

  const filteredPostes = (() => {
    const q = posteQuery.trim().toLowerCase();
    const list = posteSuggestions.filter(Boolean);
    if (!q) return list.slice(0, 12);
    return list.filter((p) => p.toLowerCase().includes(q)).slice(0, 12);
  })();

  const setAgent = (agent: EmployeeSelection | null) => {
    if (readOnly) return;
    if (!agent) {
      setForm((f) => ({
        ...f,
        agent: null,
        posteAvant: '',
        departementAvant: '',
      }));
      return;
    }
    const emp = employees.find(
      (e) => e.matricule.trim().toLowerCase() === agent.matricule.trim().toLowerCase(),
    );
    const autoPoste = emp?.jobTitle || emp?.position || '';
    const autoDept = emp?.departement || emp?.departmentHr || agent.departement || '';
    setForm((f) => ({
      ...f,
      agent,
      posteAvant: autoPoste,
      departementAvant: autoDept,
    }));
  };

  return (
    <div className="modal-overlay open" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg mvt-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="mvt-form-grid">
            <label className="form-field form-field-span-2">
              <span>Agent *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">
                  <strong>{form.agent?.nom || '—'}</strong>
                  <span>{form.agent?.matricule || ''}</span>
                </div>
              ) : (
                <EmployeePicker
                  employees={employees}
                  value={form.agent}
                  onChange={setAgent}
                  required
                />
              )}
            </label>

            <label className="form-field">
              <span>Type *</span>
              {readOnly ? (
                <span className={`mvt-type-badge ${typeBadgeClass(form.type)}`}>
                  {mouvementTypeLabel(form.type)}
                </span>
              ) : (
                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value as MouvementTypeId }))
                  }
                >
                  {MOUVEMENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              )}
            </label>

            <label className="form-field">
              <span>Date *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{formatDate(form.date)}</div>
              ) : (
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  required
                />
              )}
            </label>

            <div className="mvt-form-section form-field-span-2">
              <h4>Situation précédente</h4>
            </div>

            <label className="form-field">
              <span>Poste avant</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.posteAvant || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.posteAvant}
                  readOnly
                  className="mvt-input-auto"
                  placeholder="Automatique (poste actuel de l’agent)"
                  title="Renseigné automatiquement depuis le poste actuel de l’agent"
                />
              )}
            </label>

            <label className="form-field">
              <span>Département avant</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.departementAvant || '—'}</div>
              ) : (
                <input
                  type="text"
                  value={form.departementAvant}
                  readOnly
                  className="mvt-input-auto"
                  placeholder="Automatique (département de l’agent)"
                  title="Renseigné automatiquement depuis le département de l’agent"
                />
              )}
            </label>

            <div className="mvt-form-section form-field-span-2">
              <h4>Situation actuelle</h4>
            </div>

            <label className="form-field mvt-poste-suggest-field">
              <span>Poste actuel *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.posteActuel || '—'}</div>
              ) : (
                <div className="mvt-poste-suggest">
                  <input
                    type="text"
                    value={posteQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPosteQuery(v);
                      setForm((f) => ({ ...f, posteActuel: v }));
                      setPosteOpen(true);
                    }}
                    onFocus={() => setPosteOpen(true)}
                    onBlur={() => window.setTimeout(() => setPosteOpen(false), 150)}
                    placeholder="Rechercher un poste existant…"
                    autoComplete="off"
                    required
                  />
                  {posteOpen && filteredPostes.length > 0 && (
                    <ul className="mvt-poste-suggest-list" role="listbox">
                      {filteredPostes.map((p) => (
                        <li key={p}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setPosteQuery(p);
                              setForm((f) => ({ ...f, posteActuel: p }));
                              setPosteOpen(false);
                            }}
                          >
                            {p}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </label>

            <label className="form-field">
              <span>Département actuel *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.departementActuel || '—'}</div>
              ) : (
                <input
                  list="mvt-dept-list"
                  type="text"
                  value={form.departementActuel}
                  onChange={(e) => setForm((f) => ({ ...f, departementActuel: e.target.value }))}
                  placeholder="Département"
                  required
                />
              )}
            </label>

            <datalist id="mvt-dept-list">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>

            <label className="form-field form-field-span-2">
              <span>Notes</span>
              {readOnly ? (
                <div className="mvt-readonly-value mvt-readonly-notes">{form.notes || '—'}</div>
              ) : (
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="Observation optionnelle"
                />
              )}
            </label>

            {!readOnly && (
              <label className="form-field form-field-span-2 mvt-checkbox-field">
                <input
                  type="checkbox"
                  checked={form.applyToEmployee}
                  onChange={(e) => setForm((f) => ({ ...f, applyToEmployee: e.target.checked }))}
                />
                <span>Mettre à jour le poste et le département de l’agent dans la liste employés</span>
              </label>
            )}
          </div>
        </div>
        <div className="modal-footer">
          {mode === 'view' ? (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose}>
                Fermer
              </button>
              {onEditFromView && (
                <button type="button" className="btn btn-primary" onClick={onEditFromView}>
                  Modifier
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
                Annuler
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={() => {
                  void onSubmit({
                    ...form,
                    posteActuel: posteQuery || form.posteActuel,
                  });
                }}
              >
                {saving ? 'Enregistrement…' : mode === 'edit' ? 'Enregistrer' : 'Ajouter'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function DashboardView({
  dashboard,
  onOpenListe,
}: {
  dashboard: MouvementsDashboard | null;
  onOpenListe: () => void;
}) {
  if (!dashboard) {
    return <p className="empty-state">Aucune donnée de dashboard.</p>;
  }

  return (
    <div className="mvt-dashboard">
      <div className="travel-history-cards mvt-kpi-strip">
        <div className="card card-glow card-glow-red travel-history-card">
          <div className="card-label">Total mouvements</div>
          <div className="card-value">{dashboard.total}</div>
        </div>
        <div className="card card-glow card-glow-cyan travel-history-card">
          <div className="card-label">Cette année</div>
          <div className="card-value">{dashboard.thisYear}</div>
        </div>
        <div className="card card-glow card-glow-violet travel-history-card">
          <div className="card-label">Ce mois</div>
          <div className="card-value">{dashboard.thisMonth}</div>
        </div>
        <div className="card card-glow card-glow-green travel-history-card">
          <div className="card-label">Nouvelles affectations</div>
          <div className="card-value">{dashboard.nouvellesAffectations}</div>
        </div>
        <div className="card card-glow card-glow-amber travel-history-card">
          <div className="card-label">Promotions</div>
          <div className="card-value">{dashboard.promotions}</div>
        </div>
        <div className="card card-glow card-glow-cyan travel-history-card">
          <div className="card-label">Transversaux</div>
          <div className="card-value">{dashboard.transversaux}</div>
        </div>
      </div>

      <div className="mvt-dashboard-grid">
        <section className="panel panel-padded">
          <div className="panel-head">
            <h3>Par type</h3>
          </div>
          {dashboard.parType.length === 0 ? (
            <p className="empty-state">Aucun mouvement.</p>
          ) : (
            <ul className="mvt-stat-list">
              {dashboard.parType.map((row) => (
                <li key={row.id}>
                  <span className={`mvt-type-badge ${typeBadgeClass(row.id)}`}>{row.label}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel-padded">
          <div className="panel-head">
            <h3>Par département d’affectation</h3>
          </div>
          {dashboard.parDepartementActuel.length === 0 ? (
            <p className="empty-state">Aucun mouvement.</p>
          ) : (
            <ul className="mvt-stat-list">
              {dashboard.parDepartementActuel.map((row) => (
                <li key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.count}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel panel-padded mvt-recent-panel">
          <div className="panel-head">
            <h3>Mouvements récents</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={onOpenListe}>
              Voir tout
            </button>
          </div>
          {dashboard.recents.length === 0 ? (
            <p className="empty-state">Aucun mouvement enregistré.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table mvt-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Agent</th>
                    <th>Type</th>
                    <th>Date</th>
                    <th>Poste actuel</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.recents.map((m) => (
                    <tr key={m.id}>
                      <td className="col-num">{m.numeroOrdre}</td>
                      <td>
                        <div className="mvt-agent-cell">
                          <strong>{m.agentNom}</strong>
                          <span>{m.agentMatricule}</span>
                        </div>
                      </td>
                      <td>
                        <span className={`mvt-type-badge ${typeBadgeClass(m.type)}`}>
                          {mouvementTypeLabel(m.type)}
                        </span>
                      </td>
                      <td>{formatDate(m.date)}</td>
                      <td>
                        <div className="mvt-poste-cell">
                          <strong>{m.posteActuel || '—'}</strong>
                          {m.departementActuel && (
                            <span className="mvt-dept-mini">{m.departementActuel}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export default function MouvementsPage() {
  const { can } = usePermissions();
  const canCreate =
    can('employes.mouvements', 'create')
    || can('employes.mouvements', 'edit')
    || can('employes.liste', 'create')
    || can('employes.liste', 'edit');
  const canEdit = can('employes.mouvements', 'edit') || can('employes.liste', 'edit');
  const canDelete = can('employes.mouvements', 'delete') || can('employes.liste', 'delete');

  const [tab, setTab] = useState<PageTab>('liste');
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [dashboard, setDashboard] = useState<MouvementsDashboard | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('create');
  const [activeRow, setActiveRow] = useState<Mouvement | null>(null);
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: Mouvement } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const [resMvt, resEmp] = await Promise.all([
        fetch('/api/employes/mouvements'),
        fetch('/api/employees'),
      ]);
      const jsonMvt = await resMvt.json();
      const jsonEmp = await resEmp.json();
      if (!resMvt.ok) {
        await showError(jsonMvt?.error || 'Chargement impossible');
        setMouvements([]);
        setDashboard(null);
      } else {
        setMouvements(Array.isArray(jsonMvt.mouvements) ? jsonMvt.mouvements : []);
        setDashboard(jsonMvt.dashboard ?? null);
      }
      if (resEmp.ok && Array.isArray(jsonEmp)) {
        setEmployees(jsonEmp);
      } else {
        setEmployees([]);
      }
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

  const departments = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      if (e.departement?.trim()) set.add(e.departement.trim());
    }
    for (const m of mouvements) {
      if (m.departementActuel?.trim()) set.add(m.departementActuel.trim());
      if (m.departementAvant?.trim()) set.add(m.departementAvant.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [employees, mouvements]);

  const posteSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employees) {
      const t = (e.jobTitle || e.position || '').trim();
      if (t) set.add(t);
    }
    for (const m of mouvements) {
      if (m.posteActuel?.trim()) set.add(m.posteActuel.trim());
      if (m.posteAvant?.trim()) set.add(m.posteAvant.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [employees, mouvements]);

  const toolbarFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return mouvements.filter((m) => {
      if (typeFilter && m.type !== typeFilter) return false;
      if (!q) return true;
      const hay = [
        m.numeroOrdre,
        m.agentNom,
        m.agentMatricule,
        m.posteAvant,
        m.posteActuel,
        m.departementAvant,
        m.departementActuel,
        mouvementTypeLabel(m.type),
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [mouvements, search, typeFilter]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(toolbarFiltered, {
        numeroOrdre: (m) => String(m.numeroOrdre),
        agent: (m) => agentFilterValue(m),
        posteAvant: (m) => m.posteAvant,
        posteActuel: (m) => m.posteActuel,
        date: (m) => formatDate(m.date),
        type: (m) => mouvementTypeLabel(m.type),
      }),
    [toolbarFiltered],
  );

  const filtered = useMemo(
    () =>
      toolbarFiltered.filter(
        (m) =>
          matchesColumnFilter(colFilters.numeroOrdre, String(m.numeroOrdre)) &&
          matchesColumnFilter(colFilters.agent, agentFilterValue(m)) &&
          matchesColumnFilter(colFilters.posteAvant, m.posteAvant) &&
          matchesColumnFilter(colFilters.posteActuel, m.posteActuel) &&
          matchesColumnFilter(colFilters.date, formatDate(m.date)) &&
          matchesColumnFilter(colFilters.type, mouvementTypeLabel(m.type)),
      ),
    [toolbarFiltered, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const hasFilters = Boolean(search.trim() || typeFilter || activeFilterCount > 0);

  const openCreate = () => {
    setActiveRow(null);
    setModalMode('create');
    setModalOpen(true);
  };

  const openView = (m: Mouvement) => {
    setActiveRow(m);
    setModalMode('view');
    setModalOpen(true);
  };

  const openEdit = (m: Mouvement) => {
    setActiveRow(m);
    setModalMode('edit');
    setModalOpen(true);
  };

  const handleDelete = async (m: Mouvement) => {
    const ok = await confirmDelete(
      'Supprimer ce mouvement ?',
      `${m.agentNom} · N° ${m.numeroOrdre} — cette action est définitive.`,
    );
    if (!ok) return;
    try {
      const res = await fetch(`/api/employes/mouvements/${encodeURIComponent(m.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(json?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Mouvement supprimé');
      await load(true);
    } catch {
      await showError('Erreur de suppression');
    }
  };

  const menuItems = (m: Mouvement): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [
      { id: 'view', label: 'Voir', icon: 'view', onClick: () => openView(m) },
    ];
    if (canEdit) {
      items.push({ id: 'edit', label: 'Modifier', icon: 'edit', onClick: () => openEdit(m) });
    }
    if (canDelete) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => {
          void handleDelete(m);
        },
      });
    }
    return items;
  };

  const submit = async (form: FormState) => {
    if (!form.agent?.matricule) {
      await showError('Sélectionnez un agent');
      return;
    }
    if (!form.posteActuel.trim()) {
      await showError('Poste actuel requis');
      return;
    }
    if (!form.departementActuel.trim()) {
      await showError('Département actuel requis');
      return;
    }
    if (!form.date) {
      await showError('Date requise');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        agentMatricule: form.agent.matricule,
        agentNom: form.agent.nom,
        posteAvant: form.posteAvant,
        departementAvant: form.departementAvant,
        posteActuel: form.posteActuel,
        departementActuel: form.departementActuel,
        date: form.date,
        type: form.type,
        notes: form.notes,
        applyToEmployee: form.applyToEmployee,
      };
      const isEdit = modalMode === 'edit' && activeRow;
      const res = await fetch(
        isEdit
          ? `/api/employes/mouvements/${encodeURIComponent(activeRow.id)}`
          : '/api/employes/mouvements',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        await showError(json?.error || 'Enregistrement impossible');
        return;
      }
      await showSuccess(isEdit ? 'Mouvement mis à jour' : 'Mouvement enregistré');
      setModalOpen(false);
      setActiveRow(null);
      await load(true);
    } catch {
      await showError('Erreur d’enregistrement');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PermissionGate
        anyOf={[
          { menuId: 'employes.mouvements', action: 'view' },
          { menuId: 'employes.liste', action: 'view' },
        ]}
      >
        <div className="loading">Chargement des mouvements…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate
      anyOf={[
        { menuId: 'employes.mouvements', action: 'view' },
        { menuId: 'employes.liste', action: 'view' },
      ]}
    >
      <div className="mvt-page">
        <div className="page-header page-header-with-tabs mvt-page-header">
          <div>
            <div className="page-header-title-row">
              <h2>Mouvements</h2>
              <RefreshButton onClick={() => load(true)} loading={refreshing} />
            </div>
            <p className="mvt-page-sub">
              Historique des affectations, promotions et changements de poste
              {tab === 'liste' ? (
                <span className="mvt-count-pill">
                  {filtered.length}
                  {filtered.length !== mouvements.length ? ` / ${mouvements.length}` : ''}
                </span>
              ) : null}
            </p>
          </div>
          <div className="page-header-actions mvt-header-actions">
            <div className="tabs header-tabs header-tabs-compact mvt-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'dashboard'}
                className={`tab-btn tab-btn-sm mvt-tab-btn${tab === 'dashboard' ? ' active' : ''}`}
                onClick={() => setTab('dashboard')}
              >
                Dashboard
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'liste'}
                className={`tab-btn tab-btn-sm mvt-tab-btn${tab === 'liste' ? ' active' : ''}`}
                onClick={() => setTab('liste')}
              >
                Liste
              </button>
            </div>
            {canCreate && (
              <button type="button" className="btn btn-primary btn-sm mvt-primary-btn" onClick={openCreate}>
                + Nouveau mouvement
              </button>
            )}
          </div>
        </div>

        {tab === 'dashboard' && (
          <DashboardView dashboard={dashboard} onOpenListe={() => setTab('liste')} />
        )}

        {tab === 'liste' && (
          <div className="mvt-liste">
            <div className="mvt-toolbar">
              <div className="mvt-search">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
                <input
                  type="search"
                  placeholder="Rechercher agent, poste, matricule…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  aria-label="Rechercher"
                />
                {search ? (
                  <button
                    type="button"
                    className="mvt-search-clear"
                    aria-label="Effacer"
                    onClick={() => setSearch('')}
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="mvt-select-wrap">
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  aria-label="Filtrer par type"
                >
                  <option value="">Tous les types</option>
                  {MOUVEMENT_TYPES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setColFilters(EMPTY_FILTERS)}
                >
                  Effacer les filtres ({activeFilterCount})
                </button>
              ) : null}
            </div>

            <div className="panel mvt-table-panel">
              {filtered.length === 0 ? (
                <EmptyMouvementsState
                  canCreate={canCreate}
                  hasFilters={hasFilters}
                  onCreate={openCreate}
                />
              ) : (
                <div className="table-wrap">
                  <table className="data-table mvt-table">
                    <thead>
                      <tr>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="N° ordre"
                            values={filterValues.numeroOrdre}
                            selected={colFilters.numeroOrdre}
                            onChange={(next) => setColFilters((p) => ({ ...p, numeroOrdre: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Agent"
                            values={filterValues.agent}
                            selected={colFilters.agent}
                            onChange={(next) => setColFilters((p) => ({ ...p, agent: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Poste avant"
                            values={filterValues.posteAvant}
                            selected={colFilters.posteAvant}
                            onChange={(next) => setColFilters((p) => ({ ...p, posteAvant: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Poste actuel"
                            values={filterValues.posteActuel}
                            selected={colFilters.posteActuel}
                            onChange={(next) => setColFilters((p) => ({ ...p, posteActuel: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Date"
                            values={filterValues.date}
                            selected={colFilters.date}
                            onChange={(next) => setColFilters((p) => ({ ...p, date: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Type"
                            values={filterValues.type}
                            selected={colFilters.type}
                            onChange={(next) => setColFilters((p) => ({ ...p, type: next }))}
                          />
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((m) => (
                        <tr
                          key={m.id}
                          className="mvt-row"
                          onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.clientX, y: e.clientY, item: m });
                          }}
                          onDoubleClick={() => openView(m)}
                        >
                          <td className="col-num">{m.numeroOrdre}</td>
                          <td>
                            <div className="mvt-agent-cell">
                              <strong>{m.agentNom}</strong>
                              <span>{m.agentMatricule}</span>
                            </div>
                          </td>
                          <td>
                            <div className="mvt-poste-cell">
                              <strong>{m.posteAvant || '—'}</strong>
                              {m.departementAvant ? (
                                <span className="mvt-dept-mini">{m.departementAvant}</span>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="mvt-poste-cell">
                              <strong>{m.posteActuel || '—'}</strong>
                              {m.departementActuel ? (
                                <span className="mvt-dept-mini">{m.departementActuel}</span>
                              ) : null}
                            </div>
                          </td>
                          <td>{formatDate(m.date)}</td>
                          <td>
                            <span className={`mvt-type-badge ${typeBadgeClass(m.type)}`}>
                              {mouvementTypeLabel(m.type)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <p className="mvt-hint">Clic droit sur une ligne · double-clic pour voir</p>
          </div>
        )}

        <MouvementFormModal
          open={modalOpen}
          mode={modalMode}
          initial={activeRow ? formFromMouvement(activeRow) : null}
          employees={employees}
          departments={departments}
          posteSuggestions={posteSuggestions}
          saving={saving}
          onClose={() => {
            setModalOpen(false);
            setActiveRow(null);
          }}
          onSubmit={submit}
          onEditFromView={
            canEdit && activeRow
              ? () => {
                  setModalMode('edit');
                }
              : undefined
          }
        />

        {contextMenu && (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={menuItems(contextMenu.item)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </PermissionGate>
  );
}
