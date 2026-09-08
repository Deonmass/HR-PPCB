'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  MOUVEMENT_TYPES,
  mouvementTypeLabel,
  compareMouvementsChrono,
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
  if (/^\d{4}$/.test(value.trim())) return value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('fr-FR');
}

function mouvementAnnee(m: Mouvement): number {
  if (m.annee && Number.isFinite(m.annee) && m.annee > 1900) return m.annee;
  const s = String(m.date || '').trim();
  if (/^\d{4}/.test(s)) return Number(s.slice(0, 4));
  return 0;
}

function mouvementMonthKey(date: string): string {
  const s = String(date || '').trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

interface PosteOption {
  title: string;
  department: string;
}

function normPosteKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function deptForPoste(title: string, options: PosteOption[]): string {
  const key = normPosteKey(title);
  if (!key) return '';
  const exact = options.find((p) => normPosteKey(p.title) === key);
  return exact?.department?.trim() || '';
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
  posteOptions,
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
  posteOptions: PosteOption[];
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
    const list = posteOptions.filter((p) => p.title.trim());
    if (!q) return list;
    return list.filter((p) => p.title.toLowerCase().includes(q));
  })();
  const mappedDept = deptForPoste(posteQuery || form.posteActuel, posteOptions);
  const deptChoices = (() => {
    const set = new Set(departments.filter(Boolean));
    if (form.departementActuel.trim()) set.add(form.departementActuel.trim());
    for (const p of posteOptions) {
      if (p.department.trim()) set.add(p.department.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  })();

  const pickPoste = (posteTitle: string) => {
    const dept = deptForPoste(posteTitle, posteOptions);
    setPosteQuery(posteTitle);
    setForm((f) => ({
      ...f,
      posteActuel: posteTitle,
      departementActuel: dept,
    }));
    setPosteOpen(false);
  };

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
                      const dept = deptForPoste(v, posteOptions);
                      setForm((f) => ({
                        ...f,
                        posteActuel: v,
                        departementActuel: dept || (normPosteKey(v) ? f.departementActuel : ''),
                      }));
                      setPosteOpen(true);
                    }}
                    onFocus={() => setPosteOpen(true)}
                    onBlur={() => window.setTimeout(() => setPosteOpen(false), 180)}
                    placeholder="Saisir ou rechercher un poste…"
                    autoComplete="off"
                    required
                  />
                  {posteOpen && filteredPostes.length > 0 && (
                    <ul className="mvt-poste-suggest-list" role="listbox">
                      {filteredPostes.map((p) => (
                        <li key={p.title}>
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickPoste(p.title)}
                          >
                            <strong>{p.title}</strong>
                            {p.department ? (
                              <span className="mvt-poste-suggest-dept">{p.department}</span>
                            ) : (
                              <span className="mvt-poste-suggest-dept is-missing">Sans département</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {mappedDept ? (
                    <span className="mvt-poste-hint">Département lié : {mappedDept}</span>
                  ) : posteQuery.trim() ? (
                    <span className="mvt-poste-hint">Aucun département lié — sélectionnez-en un ci-dessous</span>
                  ) : null}
                </div>
              )}
            </label>

            <label className="form-field">
              <span>Département actuel *</span>
              {readOnly ? (
                <div className="mvt-readonly-value">{form.departementActuel || '—'}</div>
              ) : (
                <select
                  value={form.departementActuel}
                  onChange={(e) => setForm((f) => ({ ...f, departementActuel: e.target.value }))}
                  required
                >
                  <option value="">Sélectionner un département</option>
                  {deptChoices.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
            </label>

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
  currentYear,
  onOpenListe,
  onKpiClick,
  onTypeClick,
  onDeptClick,
}: {
  dashboard: MouvementsDashboard | null;
  currentYear: number;
  onOpenListe: () => void;
  onKpiClick: (kind: 'all' | 'year' | 'month' | 'nouvelle_affectation' | 'promotion' | 'changement_transversal') => void;
  onTypeClick: (typeId: string) => void;
  onDeptClick: (dept: string) => void;
}) {
  if (!dashboard) {
    return <p className="empty-state">Aucune donnée de dashboard.</p>;
  }

  return (
    <div className="mvt-dashboard">
      <div className="travel-history-cards mvt-kpi-strip">
        <button
          type="button"
          className="card card-glow card-glow-red travel-history-card is-clickable"
          title="Voir la liste — Tous les mouvements"
          onClick={() => onKpiClick('all')}
        >
          <div className="card-label">Total mouvements</div>
          <div className="card-value">{dashboard.total}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-cyan travel-history-card is-clickable"
          title={`Voir la liste — ${currentYear} (FY${String(currentYear + 1).slice(-2)})`}
          onClick={() => onKpiClick('year')}
        >
          <div className="card-label">Cette année · {currentYear}</div>
          <div className="card-value">{dashboard.thisYear}</div>
          <div className="card-sub">FY{String(currentYear + 1).slice(-2)}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-violet travel-history-card is-clickable"
          title="Voir la liste — Ce mois"
          onClick={() => onKpiClick('month')}
        >
          <div className="card-label">Ce mois</div>
          <div className="card-value">{dashboard.thisMonth}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-green travel-history-card is-clickable"
          title="Voir la liste — Nouvelles affectations"
          onClick={() => onKpiClick('nouvelle_affectation')}
        >
          <div className="card-label">Nouvelles affectations</div>
          <div className="card-value">{dashboard.nouvellesAffectations}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-amber travel-history-card is-clickable"
          title="Voir la liste — Promotions"
          onClick={() => onKpiClick('promotion')}
        >
          <div className="card-label">Promotions</div>
          <div className="card-value">{dashboard.promotions}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-cyan travel-history-card is-clickable"
          title="Voir la liste — Transversaux"
          onClick={() => onKpiClick('changement_transversal')}
        >
          <div className="card-label">Transversaux</div>
          <div className="card-value">{dashboard.transversaux}</div>
        </button>
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
                  <button
                    type="button"
                    className="mvt-stat-click"
                    title={`Voir la liste — ${row.label}`}
                    onClick={() => onTypeClick(row.id)}
                  >
                    <span className={`mvt-type-badge ${typeBadgeClass(row.id)}`}>{row.label}</span>
                    <strong>{row.count}</strong>
                  </button>
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
                  <button
                    type="button"
                    className="mvt-stat-click"
                    title={`Voir la liste — ${row.label}`}
                    onClick={() => onDeptClick(row.label)}
                  >
                    <span>{row.label}</span>
                    <strong>{row.count}</strong>
                  </button>
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
  const listWrapRef = useRef<HTMLDivElement | null>(null);
  const [mouvements, setMouvements] = useState<Mouvement[]>([]);
  const [dashboard, setDashboard] = useState<MouvementsDashboard | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [posteOptions, setPosteOptions] = useState<PosteOption[]>([]);
  const [settingsDepartments, setSettingsDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
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
      const [resMvt, resEmp, resPostes, resDepts] = await Promise.all([
        fetch('/api/employes/mouvements'),
        fetch('/api/employees'),
        fetch('/api/employes/postes'),
        fetch('/api/settings/departments'),
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
      const catalog: PosteOption[] = [];
      const seen = new Set<string>();
      const addPoste = (title: string, department: string) => {
        const t = title.trim();
        if (!t) return;
        const key = normPosteKey(t);
        if (seen.has(key)) {
          const i = catalog.findIndex((p) => normPosteKey(p.title) === key);
          if (i >= 0 && !catalog[i].department && department.trim()) {
            catalog[i] = { ...catalog[i], department: department.trim() };
          }
          return;
        }
        seen.add(key);
        catalog.push({ title: t, department: department.trim() });
      };
      if (resPostes.ok) {
        const jsonPostes = await resPostes.json();
        for (const g of jsonPostes?.groups || []) {
          addPoste(String(g.title || ''), String(g.department || ''));
        }
        for (const v of jsonPostes?.vacants || []) {
          addPoste(String(v.title || ''), String(v.department || ''));
        }
        for (const t of jsonPostes?.titles || []) {
          addPoste(String(t || ''), '');
        }
      }
      if (resDepts.ok) {
        const jsonDepts = await resDepts.json();
        const rows = Array.isArray(jsonDepts) ? jsonDepts : jsonDepts?.departments || [];
        setSettingsDepartments(
          (rows as Array<{ name?: string; active?: boolean }>)
            .filter((d) => d?.name && d.active !== false)
            .map((d) => String(d.name).trim())
            .filter(Boolean),
        );
      } else {
        setSettingsDepartments([]);
      }
      setPosteOptions(catalog);
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
    const set = new Set<string>(settingsDepartments);
    for (const e of employees) {
      if (e.departement?.trim()) set.add(e.departement.trim());
    }
    for (const m of mouvements) {
      if (m.departementActuel?.trim()) set.add(m.departementActuel.trim());
      if (m.departementAvant?.trim()) set.add(m.departementAvant.trim());
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [employees, mouvements, settingsDepartments]);

  const posteOptionsMerged = useMemo(() => {
    const map = new Map<string, PosteOption>();
    const add = (title: string, department: string) => {
      const t = title.trim();
      if (!t) return;
      const key = normPosteKey(t);
      const prev = map.get(key);
      if (!prev) {
        map.set(key, { title: t, department: department.trim() });
        return;
      }
      if (!prev.department && department.trim()) {
        map.set(key, { ...prev, department: department.trim() });
      }
    };
    for (const p of posteOptions) add(p.title, p.department);
    for (const e of employees) {
      add(e.jobTitle || e.position || '', e.departement || e.departmentHr || '');
    }
    for (const m of mouvements) {
      add(m.posteActuel, m.departementActuel);
      add(m.posteAvant, m.departementAvant);
    }
    return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'fr'));
  }, [posteOptions, employees, mouvements]);

  const yearOptions = useMemo(() => {
    const set = new Set<number>();
    for (const m of mouvements) {
      const y = mouvementAnnee(m);
      if (y) set.add(y);
    }
    return [...set].sort((a, b) => b - a);
  }, [mouvements]);

  const dashboardDisplay = useMemo(() => {
    if (!dashboard) return null;
    const now = new Date();
    const y = now.getFullYear();
    const month = `${y}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return {
      ...dashboard,
      total: mouvements.length,
      thisYear: mouvements.filter((m) => mouvementAnnee(m) === y).length,
      thisMonth: mouvements.filter((m) => mouvementMonthKey(m.date) === month).length,
    };
  }, [dashboard, mouvements]);

  const toolbarFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const year = yearFilter ? Number(yearFilter) : 0;
    return mouvements.filter((m) => {
      if (typeFilter && m.type !== typeFilter) return false;
      if (year && mouvementAnnee(m) !== year) return false;
      if (monthFilter && mouvementMonthKey(m.date) !== monthFilter) return false;
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
        String(mouvementAnnee(m)),
        m.sourceSheet || '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [mouvements, search, typeFilter, yearFilter, monthFilter]);

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
      toolbarFiltered
        .filter(
          (m) =>
            matchesColumnFilter(colFilters.numeroOrdre, String(m.numeroOrdre)) &&
            matchesColumnFilter(colFilters.agent, agentFilterValue(m)) &&
            matchesColumnFilter(colFilters.posteAvant, m.posteAvant) &&
            matchesColumnFilter(colFilters.posteActuel, m.posteActuel) &&
            matchesColumnFilter(colFilters.date, formatDate(m.date)) &&
            matchesColumnFilter(colFilters.type, mouvementTypeLabel(m.type)),
        )
        .sort(compareMouvementsChrono),
    [toolbarFiltered, colFilters],
  );

  const activeFilterCount = useMemo(() => countActiveColumnFilters(colFilters), [colFilters]);

  const hasFilters = Boolean(search.trim() || typeFilter || yearFilter || monthFilter || activeFilterCount > 0);

  useEffect(() => {
    listWrapRef.current?.scrollTo(0, 0);
  }, [tab, search, typeFilter, yearFilter, monthFilter, colFilters]);

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
      <div className="mvt-page mvt-page-fill">
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
          <DashboardView
            dashboard={dashboardDisplay}
            currentYear={new Date().getFullYear()}
            onOpenListe={() => setTab('liste')}
            onKpiClick={(kind) => {
              setSearch('');
              setColFilters(EMPTY_FILTERS);
              setMonthFilter('');
              if (kind === 'all') {
                setYearFilter('');
                setTypeFilter('');
              } else if (kind === 'year') {
                setYearFilter(String(new Date().getFullYear()));
                setTypeFilter('');
              } else if (kind === 'month') {
                const now = new Date();
                setYearFilter('');
                setTypeFilter('');
                setMonthFilter(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
              } else {
                setYearFilter('');
                setTypeFilter(kind);
              }
              setTab('liste');
            }}
            onTypeClick={(typeId) => {
              setSearch('');
              setColFilters(EMPTY_FILTERS);
              setMonthFilter('');
              setYearFilter('');
              setTypeFilter(typeId);
              setTab('liste');
            }}
            onDeptClick={(dept) => {
              setTypeFilter('');
              setYearFilter('');
              setMonthFilter('');
              setColFilters(EMPTY_FILTERS);
              setSearch(dept === '—' ? '' : dept);
              setTab('liste');
            }}
          />
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
                  value={yearFilter}
                  onChange={(e) => {
                    setYearFilter(e.target.value);
                    setMonthFilter('');
                  }}
                  aria-label="Filtrer par année"
                >
                  <option value="">Toutes les années</option>
                  {yearOptions.map((y) => (
                    <option key={y} value={String(y)}>
                      {y} · FY{String(y + 1).slice(-2)}
                    </option>
                  ))}
                </select>
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
                <div className="table-wrap" ref={listWrapRef}>
                  <table className="data-table mvt-table">
                    <thead>
                      <tr>
                        <th className="th-filter mvt-col-ordre">
                          <TableHeaderFilter
                            label="N°"
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
                          <td className="col-num mvt-col-ordre">{m.numeroOrdre}</td>
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
          </div>
        )}

        <MouvementFormModal
          open={modalOpen}
          mode={modalMode}
          initial={activeRow ? formFromMouvement(activeRow) : null}
          employees={employees}
          departments={departments}
          posteOptions={posteOptionsMerged}
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
