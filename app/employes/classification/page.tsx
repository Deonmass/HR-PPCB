'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import DashboardListModal, {
  type DashboardListColumn,
  type DashboardListRow,
} from '@/components/DashboardListModal';
import HomeBarChart from '@/components/home/HomeBarChart';
import HomeDonutChart from '@/components/home/HomeDonutChart';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { usePermissions } from '@/contexts/PermissionContext';
import {
  buildClassificationDashboard,
  CLASSIFICATION_ORDER,
  classificationRank,
  emptyClassificationPoste,
  FAMILY_COLORS,
  type ClassificationDashboard,
  type ClassificationFamily,
  type ClassificationPoste,
  type ClassificationPosteInput,
  type ClassificationStatRow,
} from '@/lib/classification-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import {
  buildColumnFilterValues,
  countActiveColumnFilters,
  matchesColumnFilter,
} from '@/lib/table-column-filters';

type PageTab = 'dashboard' | 'tableau';
type ModalMode = 'create' | 'edit' | 'view';
type FilterKey = 'title' | 'department' | 'location' | 'grade' | 'classification';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  title: [],
  department: [],
  location: [],
  grade: [],
  classification: [],
};

const DRILL_COLUMNS: DashboardListColumn[] = [
  { key: 'title', label: 'Poste' },
  { key: 'department', label: 'Département' },
  { key: 'location', label: 'Localisation' },
  { key: 'classification', label: 'Classification' },
  { key: 'grade', label: 'Grade' },
  { key: 'total', label: 'Points', align: 'right' },
];

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set([...values].map((v) => v.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'fr'),
  );
}

function displayNum(value: number | null): string {
  return value == null ? '—' : String(value);
}

function toForm(poste?: ClassificationPoste | null, preset?: Partial<ClassificationPosteInput>): ClassificationPosteInput {
  return {
    ...emptyClassificationPoste(),
    ...(poste || {}),
    ...preset,
  };
}

function posteToRow(poste: ClassificationPoste): DashboardListRow {
  return {
    id: poste.id,
    cells: {
      title: poste.title,
      department: poste.department || '—',
      location: poste.location || '—',
      classification: poste.classification || '—',
      grade: poste.gradeNouveau || poste.gradePaterson || '—',
      total: displayNum(poste.total),
    },
  };
}

function CollapseIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`village-collapse-icon${open ? ' is-open' : ''}`}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      aria-hidden
    >
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

function SuggestInput({
  listId,
  value,
  onChange,
  suggestions,
  placeholder,
  required,
}: {
  listId: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <>
      <input
        type="text"
        list={listId}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
      />
      <datalist id={listId}>
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </>
  );
}

function NumInput({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      step="any"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') onChange(null);
        else {
          const n = Number(raw);
          onChange(Number.isFinite(n) ? n : null);
        }
      }}
    />
  );
}

function SummaryTable({
  title,
  rows,
  onRowClick,
}: {
  title: string;
  rows: ClassificationStatRow[];
  onRowClick: (label: string) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  return (
    <div className="panel cls-summary-panel">
      <h4>{title}</h4>
      {rows.length === 0 ? (
        <p className="empty-state">Aucune donnée</p>
      ) : (
        <div className="table-wrap cls-summary-wrap">
          <table className="data-table cls-summary-table">
            <thead>
              <tr>
                <th>Libellé</th>
                <th className="num">Postes</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="cls-summary-row" onClick={() => onRowClick(row.label)}>
                  <td>
                    <span className="cls-dot" style={{ background: row.color || '#94a3b8' }} />
                    {row.label}
                  </td>
                  <td className="num">{row.value}</td>
                  <td className="num">{total ? `${Math.round((row.value / total) * 100)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DashboardView({
  dashboard,
  onOpenTable,
  onDrill,
}: {
  dashboard: ClassificationDashboard;
  onOpenTable: () => void;
  onDrill: (title: string, predicate: (poste: ClassificationPoste) => boolean) => void;
}) {
  const familySlices = dashboard.byFamily.map((r) => ({
    label: r.label,
    value: r.value,
    color: r.color,
  }));
  const classifSlices = dashboard.byClassification.slice(0, 8).map((r) => ({
    label: r.label,
    value: r.value,
    color: r.color,
  }));
  const deptSlices = dashboard.byDepartment.slice(0, 8).map((r) => ({
    label: r.label,
    value: r.value,
    color: r.color,
  }));
  const locSlices = dashboard.byLocation.map((r) => ({
    label: r.label,
    value: r.value,
    color: r.color,
  }));

  return (
    <div className="mvt-dashboard postes-dashboard cls-dashboard">
      <div className="travel-history-cards mvt-kpi-strip postes-kpi-strip">
        <button type="button" className="card card-glow card-glow-red travel-history-card postes-kpi-card" onClick={onOpenTable}>
          <div className="card-label">Postes classifiés</div>
          <div className="card-value">{dashboard.totalPostes}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-cyan travel-history-card postes-kpi-card"
          onClick={() => onDrill('Par département', () => true)}
        >
          <div className="card-label">Départements</div>
          <div className="card-value">{dashboard.totalDepartements}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-violet travel-history-card postes-kpi-card"
          onClick={() => onDrill('Par classification', () => true)}
        >
          <div className="card-label">Classifications</div>
          <div className="card-value">{dashboard.totalClassifications}</div>
        </button>
        <button
          type="button"
          className="card card-glow card-glow-green travel-history-card postes-kpi-card"
          onClick={() => onDrill('Par localisation', () => true)}
        >
          <div className="card-label">Localisations</div>
          <div className="card-value">{dashboard.totalLocations}</div>
        </button>
        {dashboard.byFamily.map((row) => (
          <button
            key={row.label}
            type="button"
            className="card card-glow card-glow-amber travel-history-card postes-kpi-card"
            onClick={() => onDrill(row.label, (p) => p.family === row.label)}
          >
            <div className="card-label">{row.label}</div>
            <div className="card-value">{row.value}</div>
          </button>
        ))}
      </div>

      <div className="postes-charts-grid home-charts-grid">
        <div className="postes-chart-host">
          <HomeDonutChart
            title="Famille de classification"
            slices={familySlices}
            centerLabel="Postes"
            centerValue={dashboard.totalPostes}
            emptyLabel="Aucune donnée"
            onItemClick={(label) => onDrill(label, (p) => p.family === label)}
          />
        </div>
        <div className="postes-chart-host">
          <HomeDonutChart
            title="Classification nationale"
            slices={classifSlices}
            centerLabel="Postes"
            centerValue={dashboard.byClassification.reduce((s, r) => s + r.value, 0)}
            emptyLabel="Aucune classification"
            onItemClick={(label) => onDrill(label, (p) => (p.classification || 'Non renseigné') === label)}
          />
        </div>
        <div className="postes-chart-host">
          <HomeDonutChart
            title="Par département"
            slices={deptSlices}
            centerLabel="Postes"
            emptyLabel="Aucun département"
            onItemClick={(label) =>
              onDrill(label, (p) => (p.department || p.departmentShort || 'Non renseigné') === label)
            }
          />
        </div>
        <div className="postes-chart-host">
          <HomeDonutChart
            title="Par localisation"
            slices={locSlices}
            centerLabel="Postes"
            emptyLabel="Aucune localisation"
            onItemClick={(label) => onDrill(label, (p) => (p.location || 'Non renseigné') === label)}
          />
        </div>
        <div className="postes-chart-host">
          <HomeBarChart
            title="Postes par département"
            items={dashboard.byDepartment.map((r) => ({ label: r.label, value: r.value }))}
            valueLabel="Postes"
            maxBars={8}
            emptyLabel="Aucun département"
            onItemClick={(label) =>
              onDrill(label, (p) => (p.department || p.departmentShort || 'Non renseigné') === label)
            }
          />
        </div>
        <div className="postes-chart-host">
          <HomeBarChart
            title="Postes par classification"
            items={dashboard.byClassification.map((r) => ({ label: r.label, value: r.value }))}
            valueLabel="Postes"
            maxBars={10}
            emptyLabel="Aucune classification"
            onItemClick={(label) => onDrill(label, (p) => (p.classification || 'Non renseigné') === label)}
          />
        </div>
      </div>

      <div className="cls-summary-grid">
        <SummaryTable
          title="Résumé par département"
          rows={dashboard.byDepartment}
          onRowClick={(label) =>
            onDrill(label, (p) => (p.department || p.departmentShort || 'Non renseigné') === label)
          }
        />
        <SummaryTable
          title="Résumé par classification"
          rows={dashboard.byClassification}
          onRowClick={(label) => onDrill(label, (p) => (p.classification || 'Non renseigné') === label)}
        />
        <SummaryTable
          title="Résumé par localisation"
          rows={dashboard.byLocation}
          onRowClick={(label) => onDrill(label, (p) => (p.location || 'Non renseigné') === label)}
        />
      </div>
    </div>
  );
}

function PosteModal({
  open,
  mode,
  form,
  saving,
  suggestions,
  onClose,
  onChange,
  onSubmit,
  onEditFromView,
}: {
  open: boolean;
  mode: ModalMode;
  form: ClassificationPosteInput;
  saving: boolean;
  suggestions: {
    departments: string[];
    locations: string[];
    classifications: string[];
    grades: string[];
  };
  onClose: () => void;
  onChange: (next: ClassificationPosteInput) => void;
  onSubmit: () => void;
  onEditFromView?: () => void;
}) {
  if (!open) return null;
  const readOnly = mode === 'view';
  const title =
    mode === 'view' ? 'Détail du poste' : mode === 'edit' ? 'Modifier le poste' : 'Nouveau poste';

  const field = (label: string, node: ReactNode, span = false) => (
    <label className={`form-field${span ? ' form-field-span-2' : ''}`}>
      <span>{label}</span>
      {readOnly ? <div className="mvt-readonly-value">{typeof node === 'string' ? node || '—' : node}</div> : node}
    </label>
  );

  return (
    <div className="modal-overlay open" onClick={() => !saving && onClose()}>
      <div className="modal modal-lg postes-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} disabled={saving}>
            &times;
          </button>
        </div>
        <div className="modal-body">
          <div className="mvt-form-grid">
            {field(
              'Intitulé du poste *',
              readOnly ? (
                form.title || '—'
              ) : (
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => onChange({ ...form, title: e.target.value })}
                  required
                />
              ),
              true,
            )}
            {field(
              'Département',
              readOnly ? (
                form.department || '—'
              ) : (
                <SuggestInput
                  listId="cls-dept-list"
                  value={form.department}
                  onChange={(v) => onChange({ ...form, department: v, departmentShort: v })}
                  suggestions={suggestions.departments}
                />
              ),
            )}
            {field(
              'Localisation',
              readOnly ? (
                form.location || '—'
              ) : (
                <SuggestInput
                  listId="cls-loc-list"
                  value={form.location}
                  onChange={(v) => onChange({ ...form, location: v })}
                  suggestions={suggestions.locations}
                />
              ),
            )}
            {field(
              'Classification nationale',
              readOnly ? (
                form.classification || '—'
              ) : (
                <SuggestInput
                  listId="cls-class-list"
                  value={form.classification}
                  onChange={(v) => onChange({ ...form, classification: v })}
                  suggestions={suggestions.classifications.length ? suggestions.classifications : CLASSIFICATION_ORDER}
                />
              ),
            )}
            {field(
              'Classification (ancienne)',
              readOnly ? (
                form.classificationNationale || '—'
              ) : (
                <input
                  type="text"
                  value={form.classificationNationale}
                  onChange={(e) => onChange({ ...form, classificationNationale: e.target.value })}
                />
              ),
            )}
            {field(
              'Grade Paterson',
              readOnly ? (
                form.gradePaterson || '—'
              ) : (
                <SuggestInput
                  listId="cls-grade-list"
                  value={form.gradePaterson}
                  onChange={(v) => onChange({ ...form, gradePaterson: v })}
                  suggestions={suggestions.grades}
                />
              ),
            )}
            {field(
              'Nouveau grade',
              readOnly ? (
                form.gradeNouveau || '—'
              ) : (
                <SuggestInput
                  listId="cls-grade2-list"
                  value={form.gradeNouveau}
                  onChange={(v) => onChange({ ...form, gradeNouveau: v })}
                  suggestions={suggestions.grades}
                />
              ),
            )}
            {field(
              'Blueprint',
              readOnly ? (
                form.blueprint || '—'
              ) : (
                <input
                  type="text"
                  value={form.blueprint}
                  onChange={(e) => onChange({ ...form, blueprint: e.target.value })}
                />
              ),
            )}
            {field(
              'Éventail de points',
              readOnly ? (
                form.eventailPoints || '—'
              ) : (
                <input
                  type="text"
                  value={form.eventailPoints}
                  onChange={(e) => onChange({ ...form, eventailPoints: e.target.value })}
                />
              ),
            )}
            {field('Total points', readOnly ? displayNum(form.total) : <NumInput value={form.total} onChange={(v) => onChange({ ...form, total: v })} />)}
            {field('Échelon', readOnly ? displayNum(form.echelon) : <NumInput value={form.echelon} onChange={(v) => onChange({ ...form, echelon: v })} />)}
            {field(
              'Date d’évaluation',
              readOnly ? (
                form.dateEval || '—'
              ) : (
                <input
                  type="text"
                  value={form.dateEval}
                  onChange={(e) => onChange({ ...form, dateEval: e.target.value })}
                />
              ),
            )}
            {field('Instructions', readOnly ? displayNum(form.instructions) : <NumInput value={form.instructions} onChange={(v) => onChange({ ...form, instructions: v })} />)}
            {field('Expérience', readOnly ? displayNum(form.experience) : <NumInput value={form.experience} onChange={(v) => onChange({ ...form, experience: v })} />)}
            {field('Initiative', readOnly ? displayNum(form.initiative) : <NumInput value={form.initiative} onChange={(v) => onChange({ ...form, initiative: v })} />)}
            {field('Responsabilité', readOnly ? displayNum(form.responsabilite) : <NumInput value={form.responsabilite} onChange={(v) => onChange({ ...form, responsabilite: v })} />)}
            {field('Commandement', readOnly ? displayNum(form.commandement) : <NumInput value={form.commandement} onChange={(v) => onChange({ ...form, commandement: v })} />)}
            {field('Discretion', readOnly ? displayNum(form.discretion) : <NumInput value={form.discretion} onChange={(v) => onChange({ ...form, discretion: v })} />)}
            {field('Effort physique', readOnly ? displayNum(form.effortPhysique) : <NumInput value={form.effortPhysique} onChange={(v) => onChange({ ...form, effortPhysique: v })} />)}
            {field('Effort mental', readOnly ? displayNum(form.effortMental) : <NumInput value={form.effortMental} onChange={(v) => onChange({ ...form, effortMental: v })} />)}
            {field('Conditions de travail', readOnly ? displayNum(form.conditionsTravail) : <NumInput value={form.conditionsTravail} onChange={(v) => onChange({ ...form, conditionsTravail: v })} />)}
            {field('Risques', readOnly ? displayNum(form.risques) : <NumInput value={form.risques} onChange={(v) => onChange({ ...form, risques: v })} />)}
          </div>
        </div>
        <div className="modal-footer">
          {readOnly && onEditFromView ? (
            <button type="button" className="btn btn-secondary" onClick={onEditFromView}>
              Modifier
            </button>
          ) : null}
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            {readOnly ? 'Fermer' : 'Annuler'}
          </button>
          {!readOnly && (
            <button type="button" className="btn btn-primary" onClick={onSubmit} disabled={saving || !form.title.trim()}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ClassificationPage() {
  const { can } = usePermissions();
  const canCreate =
    can('employes.classification', 'create')
    || can('employes.postes', 'create')
    || can('employes.liste', 'create');
  const canEdit =
    can('employes.classification', 'edit')
    || can('employes.postes', 'edit')
    || can('employes.liste', 'edit');
  const canDelete =
    can('employes.classification', 'delete')
    || can('employes.postes', 'delete')
    || can('employes.liste', 'delete');

  const [tab, setTab] = useState<PageTab>('dashboard');
  const [postes, setPostes] = useState<ClassificationPoste[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [contextMenu, setContextMenu] = useState<
    | { x: number; y: number; kind: 'poste'; poste: ClassificationPoste }
    | { x: number; y: number; kind: 'group'; classification: string }
    | null
  >(null);
  const [modal, setModal] = useState<{
    mode: ModalMode;
    form: ClassificationPosteInput;
    id?: string;
    saving: boolean;
  } | null>(null);
  const [drill, setDrill] = useState<{ title: string; rows: DashboardListRow[] } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/employes/classification');
      const data = await res.json();
      if (!res.ok) {
        await showError(data?.error || 'Chargement impossible');
        setPostes([]);
      } else {
        setPostes(Array.isArray(data.postes) ? data.postes : []);
      }
    } catch {
      await showError('Chargement impossible');
      setPostes([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dashboard = useMemo(() => buildClassificationDashboard(postes), [postes]);
  const suggestions = useMemo(
    () => ({
      departments: uniqueSorted(postes.map((p) => p.department || p.departmentShort)),
      locations: uniqueSorted(postes.map((p) => p.location)),
      classifications: uniqueSorted([
        ...CLASSIFICATION_ORDER,
        ...postes.map((p) => p.classification),
      ]),
      grades: uniqueSorted(postes.flatMap((p) => [p.gradeNouveau, p.gradePaterson])),
    }),
    [postes],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return postes.filter((p) => {
      if (q) {
        const hay = [
          p.title,
          p.department,
          p.location,
          p.classification,
          p.gradeNouveau,
          p.gradePaterson,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (!matchesColumnFilter(colFilters.title, p.title)) return false;
      if (!matchesColumnFilter(colFilters.department, p.department || p.departmentShort)) return false;
      if (!matchesColumnFilter(colFilters.location, p.location)) return false;
      if (!matchesColumnFilter(colFilters.grade, p.gradeNouveau || p.gradePaterson)) return false;
      if (!matchesColumnFilter(colFilters.classification, p.classification)) return false;
      return true;
    });
  }, [postes, search, colFilters]);

  const groups = useMemo(() => {
    const map = new Map<string, ClassificationPoste[]>();
    for (const poste of filtered) {
      const key = poste.classification || 'Non classifié';
      const list = map.get(key) || [];
      list.push(poste);
      map.set(key, list);
    }
    return [...map.entries()]
      .sort((a, b) => classificationRank(a[0]) - classificationRank(b[0]) || a[0].localeCompare(b[0], 'fr'))
      .map(([classification, items]) => ({
        classification,
        family: items[0]?.family || 'Execution',
        items: items.sort((a, b) => a.title.localeCompare(b.title, 'fr')),
      }));
  }, [filtered]);

  const filterValues = useMemo(
    () =>
      buildColumnFilterValues(postes, {
        title: (p) => p.title,
        department: (p) => p.department || p.departmentShort,
        location: (p) => p.location,
        grade: (p) => p.gradeNouveau || p.gradePaterson,
        classification: (p) => p.classification,
      }),
    [postes],
  );
  const activeFilters = countActiveColumnFilters(colFilters);

  const openCreate = (preset?: Partial<ClassificationPosteInput>) => {
    setModal({ mode: 'create', form: toForm(null, preset), saving: false });
  };
  const openView = (poste: ClassificationPoste) => {
    setModal({ mode: 'view', form: toForm(poste), id: poste.id, saving: false });
  };
  const openEdit = (poste: ClassificationPoste) => {
    setModal({ mode: 'edit', form: toForm(poste), id: poste.id, saving: false });
  };

  const saveModal = async () => {
    if (!modal) return;
    const isEdit = modal.mode === 'edit' && modal.id;
    setModal({ ...modal, saving: true });
    try {
      const res = await fetch(
        isEdit ? `/api/employes/classification/${modal.id}` : '/api/employes/classification',
        {
          method: isEdit ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(modal.form),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        await showError(data?.error || 'Enregistrement impossible');
        setModal({ ...modal, saving: false });
        return;
      }
      setModal(null);
      await showSuccess(isEdit ? 'Poste mis à jour' : 'Poste créé');
      await load(true);
    } catch {
      await showError('Enregistrement impossible');
      setModal({ ...modal, saving: false });
    }
  };

  const removePoste = async (poste: ClassificationPoste) => {
    const ok = await confirmDelete(`Supprimer « ${poste.title} » ?`, 'Cette action est irréversible.');
    if (!ok) return;
    try {
      const res = await fetch(`/api/employes/classification/${poste.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        await showError(data?.error || 'Suppression impossible');
        return;
      }
      await showSuccess('Poste supprimé');
      await load(true);
    } catch {
      await showError('Suppression impossible');
    }
  };

  const openContext = (
    e: ReactMouseEvent,
    payload:
      | { kind: 'poste'; poste: ClassificationPoste }
      | { kind: 'group'; classification: string },
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, ...payload });
  };

  const contextItems = useMemo((): ContextMenuItem[] => {
    if (!contextMenu) return [];
    if (contextMenu.kind === 'group') {
      const items: ContextMenuItem[] = [];
      if (canCreate) {
        items.push({
          id: 'add',
          label: 'Ajouter un poste',
          icon: 'add',
          onClick: () => openCreate({ classification: contextMenu.classification }),
        });
      }
      return items;
    }
    const { poste } = contextMenu;
    const items: ContextMenuItem[] = [
      { id: 'view', label: 'Voir', icon: 'view', onClick: () => openView(poste) },
    ];
    if (canEdit) {
      items.push({ id: 'edit', label: 'Modifier', icon: 'edit', onClick: () => openEdit(poste) });
    }
    if (canCreate) {
      items.push({
        id: 'add',
        label: 'Ajouter un poste',
        icon: 'add',
        onClick: () => openCreate({ classification: poste.classification, department: poste.department, location: poste.location }),
      });
    }
    if (canDelete) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => void removePoste(poste),
      });
    }
    return items;
  }, [contextMenu, canCreate, canEdit, canDelete]);

  const gate = [
    { menuId: 'employes.classification', action: 'view' as const },
    { menuId: 'employes.postes', action: 'view' as const },
    { menuId: 'employes.liste', action: 'view' as const },
  ];

  if (loading) {
    return (
      <PermissionGate anyOf={gate}>
        <div className="loading">Chargement de la classification…</div>
      </PermissionGate>
    );
  }

  return (
    <PermissionGate anyOf={gate}>
      <div className="mvt-page postes-page cls-page">
        <div className="postes-sticky">
          <div className="page-header page-header-with-tabs mvt-page-header">
            <div>
              <div className="page-header-title-row">
                <h2>Classification des postes</h2>
                <RefreshButton onClick={() => load(true)} loading={refreshing} />
              </div>
              <p className="mvt-page-sub">
                Grille Hay, grades Paterson et classification nationale harmonisée
              </p>
            </div>
            <div className="page-header-actions mvt-header-actions">
              <div className="tabs header-tabs header-tabs-compact mvt-tabs" role="tablist">
                {([
                  ['dashboard', 'Dashboard'],
                  ['tableau', 'Tableau'],
                ] as const).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={`tab-btn tab-btn-sm mvt-tab-btn${tab === id ? ' active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {tab === 'tableau' && (
                <div className="th-filter">
                  <TableHeaderFilter
                    label="Classification"
                    values={filterValues.classification}
                    selected={colFilters.classification}
                    onChange={(next) => setColFilters((p) => ({ ...p, classification: next }))}
                  />
                </div>
              )}
              {tab === 'tableau' && (
                <div className="mvt-search">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                    <circle cx="11" cy="11" r="7" />
                    <path d="m20 20-3.5-3.5" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Rechercher un poste…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    aria-label="Rechercher"
                  />
                  {search ? (
                    <button type="button" className="mvt-search-clear" aria-label="Effacer" onClick={() => setSearch('')}>
                      ×
                    </button>
                  ) : null}
                </div>
              )}
              {tab === 'tableau' && activeFilters > 0 ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setColFilters(EMPTY_FILTERS)}
                >
                  Effacer les filtres ({activeFilters})
                </button>
              ) : null}
              {canCreate && tab === 'tableau' && (
                <button type="button" className="btn btn-primary btn-sm mvt-primary-btn" onClick={() => openCreate()}>
                  + Poste
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`postes-body${tab === 'dashboard' ? ' is-dashboard' : ' is-table'}`}>
          {tab === 'dashboard' && (
            <DashboardView
              dashboard={dashboard}
              onOpenTable={() => setTab('tableau')}
              onDrill={(title, predicate) =>
                setDrill({ title, rows: postes.filter(predicate).map(posteToRow) })
              }
            />
          )}

          {tab === 'tableau' && (
            <div className="mvt-table-panel postes-table-panel">
              {groups.length === 0 ? (
                <p className="empty-state">Aucun poste classifié.</p>
              ) : (
                <div className="table-wrap postes-table-wrap">
                  <table className="data-table mvt-table postes-compact-table">
                    <thead>
                      <tr>
                        <th className="cls-collapse-th" />
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Poste"
                            values={filterValues.title}
                            selected={colFilters.title}
                            onChange={(next) => setColFilters((p) => ({ ...p, title: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Département"
                            values={filterValues.department}
                            selected={colFilters.department}
                            onChange={(next) => setColFilters((p) => ({ ...p, department: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Localisation"
                            values={filterValues.location}
                            selected={colFilters.location}
                            onChange={(next) => setColFilters((p) => ({ ...p, location: next }))}
                          />
                        </th>
                        <th className="th-filter">
                          <TableHeaderFilter
                            label="Grade"
                            values={filterValues.grade}
                            selected={colFilters.grade}
                            onChange={(next) => setColFilters((p) => ({ ...p, grade: next }))}
                          />
                        </th>
                        <th>Points</th>
                        <th>Échelon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groups.flatMap((group) => {
                        const isOpen = !(collapsed[group.classification] ?? false);
                        const familyColor = FAMILY_COLORS[group.family as ClassificationFamily] || '#64748b';
                        const head = (
                          <tr
                            key={`g-${group.classification}`}
                            className={`cls-group-row${canCreate ? ' has-context-menu' : ''}`}
                            onContextMenu={(e) =>
                              openContext(e, { kind: 'group', classification: group.classification })
                            }
                          >
                            <td>
                              <button
                                type="button"
                                className="btn-icon village-collapse-btn"
                                aria-expanded={isOpen}
                                onClick={() =>
                                  setCollapsed((prev) => ({
                                    ...prev,
                                    [group.classification]: isOpen,
                                  }))
                                }
                                title={isOpen ? 'Replier' : 'Déplier'}
                              >
                                <CollapseIcon open={isOpen} />
                              </button>
                            </td>
                            <td colSpan={6}>
                              <span className="cls-dot" style={{ background: familyColor }} />
                              <strong>{group.classification || 'Non classifié'}</strong>
                              <span className="cls-group-meta">
                                {group.family} · {group.items.length} poste{group.items.length > 1 ? 's' : ''}
                              </span>
                            </td>
                          </tr>
                        );
                        if (!isOpen) return [head];
                        return [
                          head,
                          ...group.items.map((poste) => (
                            <tr
                              key={poste.id}
                              className="cls-child-row has-context-menu"
                              onContextMenu={(e) => openContext(e, { kind: 'poste', poste })}
                              onDoubleClick={() => openView(poste)}
                            >
                              <td />
                              <td><strong>{poste.title}</strong></td>
                              <td>{poste.department || '—'}</td>
                              <td>{poste.location || '—'}</td>
                              <td>{poste.gradeNouveau || poste.gradePaterson || '—'}</td>
                              <td className="num">{displayNum(poste.total)}</td>
                              <td className="num">{displayNum(poste.echelon)}</td>
                            </tr>
                          )),
                        ];
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {modal && (
        <PosteModal
          open
          mode={modal.mode}
          form={modal.form}
          saving={modal.saving}
          suggestions={suggestions}
          onClose={() => !modal.saving && setModal(null)}
          onChange={(form) => setModal({ ...modal, form })}
          onSubmit={() => void saveModal()}
          onEditFromView={
            canEdit && modal.mode === 'view' && modal.id
              ? () => setModal({ ...modal, mode: 'edit' })
              : undefined
          }
        />
      )}

      {drill && (
        <DashboardListModal
          title={drill.title}
          columns={DRILL_COLUMNS}
          rows={drill.rows}
          onClose={() => setDrill(null)}
          searchPlaceholder="Rechercher un poste…"
        />
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
