'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import CharroiDashboard from '@/components/charroi/CharroiDashboard';
import CharroiDocHistoryModal from '@/components/charroi/CharroiDocHistoryModal';
import TableHeaderFilter from '@/components/TableHeaderFilter';
import { countActiveColumnFilters, matchesColumnFilter } from '@/lib/table-column-filters';
import CharroiKmHeaderFilter from '@/components/charroi/CharroiKmHeaderFilter';
import { EmployeeSuggestInput } from '@/components/EmployeePicker';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import RowContextMenu, { type ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type {
  CharroiDocKind,
  CharroiEtatManuel,
  CharroiProprietaire,
  CharroiVehicule,
} from '@/lib/charroi-types';
import {
  CHARROI_DOC_LABELS,
  CHARROI_ETATS,
  charroiExpiryStatus,
  computeAgeFromMiseCirculation,
  explainObservationTech,
  formatCharroiDate,
  normalizeMarqueLabel,
  normalizeProvinceLabel,
  toMiseCirculationDateInput,
} from '@/lib/charroi-types';
import { downloadVehiculesExport } from '@/lib/charroi-vehicules-export';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { Employee } from '@/lib/types';

const MENU = 'charroi.vehicules';
const VIEW_ANY = [
  { menuId: MENU, action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];

type Tab = 'dashboard' | 'liste' | 'declasses';

/* ── Modification directe (menu contextuel) ────────────────────── */

type QuickField =
  | 'user'
  | 'province'
  | 'proprietaire'
  | 'kilometrage'
  | 'cv'
  | 'etat';

const QUICK_FIELD_LABELS: Record<QuickField, string> = {
  user: 'Responsable',
  province: 'Province',
  proprietaire: 'Propriétaire',
  kilometrage: 'Kilométrage',
  cv: 'CV',
  etat: 'État tech.',
};

/* ── Filtres d'en-tête (façon Excel) ───────────────────────────── */

type FilterKey =
  | 'marque'
  | 'plaque'
  | 'cv'
  | 'departement'
  | 'user'
  | 'province'
  | 'proprietaire'
  | 'miseCirculation'
  | 'assurance'
  | 'vignette'
  | 'controle'
  | 'etat';

const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  marque: [],
  plaque: [],
  cv: [],
  departement: [],
  user: [],
  province: [],
  proprietaire: [],
  miseCirculation: [],
  assurance: [],
  vignette: [],
  controle: [],
  etat: [],
};

const EXPIRY_FILTER_LABELS: Record<string, string> = {
  none: '—',
  expired: 'Expiré',
  soon: '≤ 1 mois',
  ok: 'OK',
};

function expiryFilterLabel(dateIso: string): string {
  return EXPIRY_FILTER_LABELS[charroiExpiryStatus(dateIso)] || '—';
}

function miseCircFilterValue(item: CharroiVehicule): string {
  const raw = (item.miseCirculation || '').trim();
  if (!raw) return '—';
  const year = raw.match(/(?:19|20)\d{2}/)?.[0];
  return year || raw;
}

function filterValueOf(item: CharroiVehicule, key: FilterKey): string {
  switch (key) {
    case 'marque': return item.marque || '—';
    case 'plaque': return item.plaque || '—';
    case 'cv': return item.cv || '—';
    case 'departement': return item.departement || '—';
    case 'user': return item.user || '—';
    case 'province': return item.province || '—';
    case 'proprietaire': return item.proprietaire || '—';
    case 'miseCirculation': return miseCircFilterValue(item);
    case 'assurance': return expiryFilterLabel(item.assuranceFin);
    case 'vignette': return expiryFilterLabel(item.vignetteFin);
    case 'controle': return expiryFilterLabel(item.controleTechniqueFin);
    case 'etat': return item.observationTech || '—';
    default: return '—';
  }
}

type FormState = {
  id: string;
  numero: string;
  marque: string;
  type: string;
  numeroChassis: string;
  plaque: string;
  cv: string;
  assureur: string;
  departement: string;
  user: string;
  province: string;
  proprietaire: CharroiProprietaire;
  kilometrage: string;
  miseCirculation: string;
  etatManuel: string;
  assuranceFin: string;
  vignetteFin: string;
  controleTechniqueFin: string;
  notes: string;
};

const emptyForm = (): FormState => ({
  id: '',
  numero: '',
  marque: '',
  type: '',
  numeroChassis: '',
  plaque: '',
  cv: '',
  assureur: '',
  departement: '',
  user: '',
  province: '',
  proprietaire: 'PPC',
  kilometrage: '',
  miseCirculation: '',
  etatManuel: '',
  assuranceFin: '',
  vignetteFin: '',
  controleTechniqueFin: '',
  notes: '',
});

function observationClass(value: string): string {
  const v = value.trim().toLowerCase();
  if (v === 'déclassé' || v === 'declassé' || v === 'déclasse' || v === 'declasse') {
    return 'charroi-obs is-retired';
  }
  if (v.includes('bon')) return 'charroi-obs is-ok';
  if (v.includes('avert')) return 'charroi-obs is-warn';
  if (v.includes('déclass') || v.includes('declas')) return 'charroi-obs is-bad';
  return 'charroi-obs';
}

function rowClass(item: CharroiVehicule): string {
  const v = item.observationTech.trim().toLowerCase();
  if (v === 'déclassé' || v === 'declassé' || v === 'déclasse' || v === 'declasse') {
    return 'charroi-row-click charroi-row-retired';
  }
  if (v.includes('déclass') || v.includes('declas')) return 'charroi-row-click charroi-row-bad';
  return 'charroi-row-click';
}

function toNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function DateCell({
  value,
  onManage,
}: {
  value: string;
  onManage?: (e: React.MouseEvent) => void;
}) {
  const status = charroiExpiryStatus(value);
  if (status === 'none') {
    return (
      <button
        type="button"
        className="charroi-date-btn charroi-date is-none"
        onClick={onManage}
        title="Gérer l’historique"
      >
        —
      </button>
    );
  }
  return (
    <button
      type="button"
      className={`charroi-date-btn charroi-date is-${status}`}
      onClick={onManage}
      title={
        status === 'expired'
          ? 'Expiré — cliquer pour l’historique'
          : status === 'soon'
            ? 'Expire dans moins de 30 jours — cliquer pour l’historique'
            : 'Cliquer pour l’historique'
      }
    >
      {formatCharroiDate(value)}
    </button>
  );
}

export default function CharroiVehiculesPage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create') || can('charroi', 'create');
  const canEdit = can(MENU, 'edit') || can('charroi', 'edit');
  const canDelete = can(MENU, 'delete') || can('charroi', 'delete');

  const [tab, setTab] = useState<Tab>('dashboard');
  const [items, setItems] = useState<CharroiVehicule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [colFilters, setColFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
  const [kmMin, setKmMin] = useState('');
  const [kmMax, setKmMax] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<CharroiVehicule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: CharroiVehicule } | null>(null);
  const [quickEdit, setQuickEdit] = useState<{ item: CharroiVehicule; field: QuickField } | null>(null);
  const [qeValue, setQeValue] = useState('');
  const [qeDept, setQeDept] = useState('');
  const [qeSaving, setQeSaving] = useState(false);
  const [docModal, setDocModal] = useState<{ item: CharroiVehicule; kind: CharroiDocKind } | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/charroi/vehicules');
      const data = await res.json();
      if (!res.ok) {
        await showError(data?.error || 'Chargement impossible');
        setItems([]);
        return;
      }
      setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      await showError(err instanceof Error ? err.message : 'Chargement impossible');
      setItems([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    fetch('/api/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(Array.isArray(json) ? json : []))
      .catch(() => setEmployees([]));
  }, [load]);

  const findEmployeeByName = useCallback(
    (name: string): Employee | undefined => {
      const t = name.trim().toLowerCase();
      if (!t) return undefined;
      return employees.find((e) => e.nom.trim().toLowerCase() === t);
    },
    [employees],
  );

  const declasses = useMemo(
    () => items.filter((i) => observationClass(i.observationTech).includes('is-retired')),
    [items],
  );
  const actifs = useMemo(
    () => items.filter((i) => !observationClass(i.observationTech).includes('is-retired')),
    [items],
  );
  const base = tab === 'declasses' ? declasses : actifs;

  const filterValues = useMemo(() => {
    const result = {} as Record<FilterKey, string[]>;
    (Object.keys(EMPTY_FILTERS) as FilterKey[]).forEach((key) => {
      const set = new Set(base.map((item) => filterValueOf(item, key)));
      result[key] = [...set].sort((a, b) => a.localeCompare(b, 'fr'));
    });
    return result;
  }, [base]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const min = toNum(kmMin);
    const max = toNum(kmMax);
    return base.filter((item) => {
      for (const key of Object.keys(colFilters) as FilterKey[]) {
        if (!matchesColumnFilter(colFilters[key], filterValueOf(item, key))) return false;
      }
      if (min != null) {
        if (item.kilometrage == null || item.kilometrage < min) return false;
      }
      if (max != null) {
        if (item.kilometrage == null || item.kilometrage > max) return false;
      }
      if (!q) return true;
      const hay = [
        item.numero, item.marque, item.type, item.numeroChassis, item.plaque,
        item.user, item.departement, item.province, item.assureur,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [base, search, colFilters, kmMin, kmMax]);

  const activeFilterCount = useMemo(() => {
    let count = countActiveColumnFilters(colFilters);
    if (kmMin.trim()) count += 1;
    if (kmMax.trim()) count += 1;
    return count;
  }, [colFilters, kmMin, kmMax]);

  const clearAllFilters = () => {
    setColFilters(EMPTY_FILTERS);
    setKmMin('');
    setKmMax('');
  };

  const setColFilter = (key: FilterKey) => (next: string[]) =>
    setColFilters((prev) => ({ ...prev, [key]: next }));

  const openDocModal = (item: CharroiVehicule, kind: CharroiDocKind) => {
    setContextMenu(null);
    setDocModal({ item, kind });
  };

  const handleDocSaved = (updated: CharroiVehicule) => {
    setItems((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
    setDocModal((prev) => (prev ? { ...prev, item: updated } : null));
    setDetail((prev) => (prev?.id === updated.id ? updated : prev));
  };

  const formPreview = useMemo(() => {
    const kilometrage = toNum(form.kilometrage);
    const age = computeAgeFromMiseCirculation(form.miseCirculation);
    return explainObservationTech({ age, kilometrage, miseCirculation: form.miseCirculation });
  }, [form.kilometrage, form.miseCirculation]);

  const formEmployee = useMemo(
    () => findEmployeeByName(form.user),
    [findEmployeeByName, form.user],
  );

  const openCreate = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (item: CharroiVehicule) => {
    setDetail(null);
    setForm({
      id: item.id,
      numero: item.numero == null ? '' : String(item.numero),
      marque: item.marque,
      type: item.type,
      numeroChassis: item.numeroChassis,
      plaque: item.plaque,
      cv: item.cv,
      assureur: item.assureur,
      departement: item.departement,
      user: item.user,
      province: item.province,
      proprietaire: item.proprietaire || 'PPC',
      kilometrage: item.kilometrage == null ? '' : String(item.kilometrage),
      miseCirculation: toMiseCirculationDateInput(item.miseCirculation),
      etatManuel: item.etatManuel || '',
      assuranceFin: item.assuranceFin || '',
      vignetteFin: item.vignetteFin || '',
      controleTechniqueFin: item.controleTechniqueFin || '',
      notes: item.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.marque.trim() && !form.plaque.trim()) {
      await showError('Marque ou plaque requise');
      return;
    }
    setSaving(true);
    try {
      const kilometrage = toNum(form.kilometrage);
      const payload = {
        numero: toNum(form.numero),
        marque: normalizeMarqueLabel(form.marque),
        type: form.type.trim(),
        numeroChassis: form.numeroChassis.trim(),
        plaque: form.plaque.trim(),
        cv: form.cv.trim(),
        assureur: form.assureur.trim(),
        // Le département suit automatiquement le responsable employé.
        departement: formEmployee ? formEmployee.departement : form.departement.trim(),
        user: form.user.trim(),
        province: normalizeProvinceLabel(form.province),
        proprietaire: form.proprietaire,
        kilometrage,
        miseCirculation: form.miseCirculation.trim(),
        etatManuel: form.etatManuel as CharroiEtatManuel,
        assuranceFin: form.assuranceFin.trim(),
        vignetteFin: form.vignetteFin.trim(),
        controleTechniqueFin: form.controleTechniqueFin.trim(),
        notes: form.notes.trim(),
      };
      const res = await fetch(
        form.id ? `/api/charroi/vehicules/${encodeURIComponent(form.id)}` : '/api/charroi/vehicules',
        {
          method: form.id ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Erreur');
        return;
      }
      await showSuccess(form.id ? 'Véhicule mis à jour' : 'Véhicule ajouté');
      setModalOpen(false);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CharroiVehicule) => {
    if (!(await confirmDelete('Supprimer ce véhicule ?', `${item.marque} ${item.plaque}`.trim()))) {
      return;
    }
    const res = await fetch(`/api/charroi/vehicules/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await showError(json.error || 'Suppression impossible');
      return;
    }
    setDetail(null);
    await load(true);
  };

  /* ── Modification directe ────────────────────────────────────── */

  const openQuickEdit = (item: CharroiVehicule, field: QuickField) => {
    setContextMenu(null);
    let value = '';
    switch (field) {
      case 'user': value = item.user; break;
      case 'province': value = item.province; break;
      case 'proprietaire': value = item.proprietaire; break;
      case 'kilometrage': value = item.kilometrage == null ? '' : String(item.kilometrage); break;
      case 'cv': value = item.cv; break;
      case 'etat': value = item.etatManuel || ''; break;
    }
    setQeValue(value);
    setQeDept(item.departement);
    setQuickEdit({ item, field });
  };

  const qeEmployee = useMemo(
    () => (quickEdit?.field === 'user' ? findEmployeeByName(qeValue) : undefined),
    [quickEdit, findEmployeeByName, qeValue],
  );

  const handleQuickSave = async () => {
    if (!quickEdit) return;
    const { item, field } = quickEdit;
    let patch: Record<string, unknown>;
    switch (field) {
      case 'user':
        patch = {
          user: qeValue.trim(),
          departement: qeEmployee ? qeEmployee.departement : qeDept.trim(),
        };
        break;
      case 'province':
        patch = { province: normalizeProvinceLabel(qeValue) };
        break;
      case 'proprietaire':
        patch = { proprietaire: qeValue };
        break;
      case 'kilometrage':
        patch = { kilometrage: toNum(qeValue) };
        break;
      case 'cv':
        patch = { cv: qeValue.trim() };
        break;
      case 'etat':
        patch = { etatManuel: qeValue };
        break;
      default:
        return;
    }

    setQeSaving(true);
    try {
      const res = await fetch(`/api/charroi/vehicules/${encodeURIComponent(item.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Modification impossible');
        return;
      }
      setQuickEdit(null);
      await load(true);
    } finally {
      setQeSaving(false);
    }
  };

  const contextItems = useMemo<ContextMenuItem[]>(() => {
    if (!contextMenu) return [];
    const { item } = contextMenu;
    const items: ContextMenuItem[] = [];
    if (canEdit) {
      const fields: QuickField[] = [
        'user', 'province', 'proprietaire', 'kilometrage', 'cv', 'etat',
      ];
      for (const field of fields) {
        items.push({
          id: field,
          label: QUICK_FIELD_LABELS[field],
          icon: 'edit',
          onClick: () => openQuickEdit(item, field),
        });
      }
    }
    (['assurance', 'vignette', 'controleTechnique'] as CharroiDocKind[]).forEach((kind) => {
      items.push({
        id: `doc-${kind}`,
        label: `${CHARROI_DOC_LABELS[kind]} (historique)`,
        icon: 'edit',
        onClick: () => openDocModal(item, kind),
      });
    });
    return items;
  }, [contextMenu, canEdit]);

  const menuItems = (item: CharroiVehicule): ContextMenuItem[] => {
    const actions: ContextMenuItem[] = [
      { id: 'view', label: 'Voir', icon: 'view', onClick: () => setDetail(item) },
    ];
    if (canEdit) {
      actions.push({ id: 'edit', label: 'Modifier', icon: 'edit', onClick: () => openEdit(item) });
    }
    if (canDelete) {
      actions.push({
        id: 'delete', label: 'Supprimer', icon: 'delete', danger: true,
        onClick: () => void handleDelete(item),
      });
    }
    return actions;
  };

  if (loading) return <div className="loading">Chargement...</div>;

  const detailExpl = detail
    ? explainObservationTech({
      age: detail.age,
      kilometrage: detail.kilometrage,
      miseCirculation: detail.miseCirculation,
    })
    : null;

  const renderTable = () => (
    <>
      <div className="panel docs-filter-bar-compact charroi-filters">
        <input
          type="search"
          className="search-input"
          placeholder="Rechercher marque, plaque, châssis, responsable…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {activeFilterCount > 0 && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={clearAllFilters}
          >
            Effacer les filtres ({activeFilterCount})
          </button>
        )}
        <span className="toolbar-count">
          {filtered.length} / {base.length} véhicule{base.length > 1 ? 's' : ''}
        </span>
      </div>

      <div className="table-wrap charroi-table-wrap">
        <table className="data-table charroi-table">
          <thead>
            <tr>
              <th>N°</th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Marque"
                  values={filterValues.marque}
                  selected={colFilters.marque}
                  onChange={setColFilter('marque')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Plaque"
                  values={filterValues.plaque}
                  selected={colFilters.plaque}
                  onChange={setColFilter('plaque')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="CV"
                  values={filterValues.cv}
                  selected={colFilters.cv}
                  onChange={setColFilter('cv')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Département"
                  values={filterValues.departement}
                  selected={colFilters.departement}
                  onChange={setColFilter('departement')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Responsable"
                  values={filterValues.user}
                  selected={colFilters.user}
                  onChange={setColFilter('user')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Province"
                  values={filterValues.province}
                  selected={colFilters.province}
                  onChange={setColFilter('province')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Proprio."
                  values={filterValues.proprietaire}
                  selected={colFilters.proprietaire}
                  onChange={setColFilter('proprietaire')}
                />
              </th>
              <th className="th-filter">
                <CharroiKmHeaderFilter
                  label="Km"
                  min={kmMin}
                  max={kmMax}
                  onChange={({ min, max }) => {
                    setKmMin(min);
                    setKmMax(max);
                  }}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Mise circ."
                  values={filterValues.miseCirculation}
                  selected={colFilters.miseCirculation}
                  onChange={setColFilter('miseCirculation')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Assurance"
                  values={filterValues.assurance}
                  selected={colFilters.assurance}
                  onChange={setColFilter('assurance')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Vignette"
                  values={filterValues.vignette}
                  selected={colFilters.vignette}
                  onChange={setColFilter('vignette')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="Contr. tech."
                  values={filterValues.controle}
                  selected={colFilters.controle}
                  onChange={setColFilter('controle')}
                />
              </th>
              <th className="th-filter">
                <TableHeaderFilter
                  label="État tech."
                  values={filterValues.etat}
                  selected={colFilters.etat}
                  onChange={setColFilter('etat')}
                />
              </th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={15} className="empty-state">Aucun véhicule trouvé.</td></tr>
            ) : (
              filtered.map((item) => (
                <tr
                  key={item.id}
                  className={rowClass(item)}
                  onClick={() => setDetail(item)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setContextMenu({ x: event.clientX, y: event.clientY, item });
                  }}
                >
                  <td>{item.numero ?? '—'}</td>
                  <td>
                    <div className="charroi-marque-cell">
                      <strong>{item.marque || '—'}</strong>
                      {item.type && <span>{item.type}</span>}
                    </div>
                  </td>
                  <td>{item.plaque || '—'}</td>
                  <td>{item.cv || '—'}</td>
                  <td>{item.departement || '—'}</td>
                  <td>{item.user || '—'}</td>
                  <td>{item.province || '—'}</td>
                  <td>
                    <span className={`charroi-owner is-${(item.proprietaire || 'na').toLowerCase()}`}>
                      {item.proprietaire || '—'}
                    </span>
                  </td>
                  <td>
                    <strong>
                      {item.kilometrage == null ? '—' : item.kilometrage.toLocaleString('fr-FR')}
                    </strong>
                  </td>
                  <td>
                    <div className="charroi-marque-cell">
                      <span>{item.miseCirculation || '—'}</span>
                      {item.age != null && <span>{item.age} an{item.age > 1 ? 's' : ''}</span>}
                    </div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <DateCell
                      value={item.assuranceFin}
                      onManage={(e) => {
                        e.stopPropagation();
                        openDocModal(item, 'assurance');
                      }}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <DateCell
                      value={item.vignetteFin}
                      onManage={(e) => {
                        e.stopPropagation();
                        openDocModal(item, 'vignette');
                      }}
                    />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <DateCell
                      value={item.controleTechniqueFin}
                      onManage={(e) => {
                        e.stopPropagation();
                        openDocModal(item, 'controleTechnique');
                      }}
                    />
                  </td>
                  <td>
                    <span className={observationClass(item.observationTech)}>
                      {item.observationTech || '—'}
                    </span>
                  </td>
                  <td className="charroi-actions-cell" onClick={(e) => e.stopPropagation()}>
                    <CardActionMenu items={menuItems(item)} ariaLabel={`Actions — ${item.plaque || item.marque}`} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );

  return (
    <PermissionGate anyOf={VIEW_ANY}>
      <div className="charroi-page">
        <div className="page-header page-header-with-tabs">
          <div>
            <div className="page-header-title-row">
              <h2>Base véhicules</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
            <p>
              {actifs.length} véhicule{actifs.length > 1 ? 's' : ''}
              {declasses.length > 0 ? ` · ${declasses.length} déclassé${declasses.length > 1 ? 's' : ''}` : ''}
            </p>
          </div>
          <div className="guest-house-header-actions">
            <div className="guest-house-toolbar-right">
              <div className="tabs header-tabs header-tabs-compact guest-house-main-tabs">
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
                </button>
                <button
                  type="button"
                  className={`tab-btn tab-btn-sm${tab === 'declasses' ? ' active' : ''}`}
                  onClick={() => setTab('declasses')}
                >
                  Déclassés{declasses.length > 0 ? ` (${declasses.length})` : ''}
                </button>
              </div>
              {canCreate && (
                <button type="button" className="btn btn-accent btn-sm" onClick={openCreate}>
                  + Ajouter
                </button>
              )}
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  try {
                    const source =
                      tab === 'dashboard'
                        ? items
                        : filtered;
                    if (source.length === 0) {
                      void showError('Aucun véhicule à exporter');
                      return;
                    }
                    downloadVehiculesExport(source, {
                      filename: `base-vehicules-${tab}-${new Date().toISOString().slice(0, 10)}.xlsx`,
                    });
                    void showSuccess(
                      tab === 'dashboard'
                        ? `${source.length} véhicule(s) exporté(s)`
                        : `${source.length} véhicule(s) exporté(s) (filtres appliqués)`,
                    );
                  } catch (err) {
                    void showError(err instanceof Error ? err.message : 'Export impossible');
                  }
                }}
                title={
                  tab === 'dashboard'
                    ? 'Exporter tous les véhicules'
                    : 'Exporter les véhicules visibles (filtres appliqués)'
                }
              >
                Export
              </button>
            </div>
          </div>
        </div>

        {tab === 'dashboard' && (
          <CharroiDashboard
            items={items}
            onSelectVehicle={setDetail}
            onOpenDoc={(v, kind) => openDocModal(v, kind)}
          />
        )}

        {(tab === 'liste' || tab === 'declasses') && renderTable()}

        {contextMenu && contextItems.length > 0 && (
          <RowContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            items={contextItems}
          />
        )}

        {docModal && (
          <CharroiDocHistoryModal
            vehicle={docModal.item}
            kind={docModal.kind}
            canEdit={canEdit}
            onClose={() => setDocModal(null)}
            onSaved={handleDocSaved}
          />
        )}

        {quickEdit && (
          <div className="modal-overlay open" onClick={() => setQuickEdit(null)}>
            <div className="modal charroi-quick-edit-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>
                  {QUICK_FIELD_LABELS[quickEdit.field]} —{' '}
                  {quickEdit.item.plaque || quickEdit.item.marque || quickEdit.item.id}
                </h3>
                <button type="button" className="modal-close" onClick={() => setQuickEdit(null)}>×</button>
              </div>
              <div className="modal-body">
                {quickEdit.field === 'user' && (
                  <>
                    <div className="form-group">
                      <label>Responsable</label>
                      <EmployeeSuggestInput
                        employees={employees}
                        value={qeValue}
                        onChange={(value) => setQeValue(value)}
                        onEmployeeSelect={(employee) => {
                          setQeValue(employee.nom);
                          setQeDept(employee.departement || '');
                        }}
                        placeholder="Rechercher un employé ou saisir un nom…"
                      />
                    </div>
                    <div className="form-group">
                      <label>Département {qeEmployee ? '(suivi automatique)' : ''}</label>
                      <input
                        value={qeEmployee ? (qeEmployee.departement || '') : qeDept}
                        disabled={Boolean(qeEmployee)}
                        onChange={(e) => setQeDept(e.target.value)}
                        placeholder="Saisir le département"
                      />
                    </div>
                  </>
                )}
                {quickEdit.field === 'province' && (
                  <div className="form-group">
                    <label>Province</label>
                    <input
                      list="charroi-provinces"
                      value={qeValue}
                      onChange={(e) => setQeValue(e.target.value)}
                      autoFocus
                    />
                    <datalist id="charroi-provinces">
                      {filterValues.province.filter((p) => p !== '—').map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </div>
                )}
                {quickEdit.field === 'proprietaire' && (
                  <div className="form-group">
                    <label>Propriétaire</label>
                    <select value={qeValue} onChange={(e) => setQeValue(e.target.value)} autoFocus>
                      <option value="PPC">PPC</option>
                      <option value="LOXEA">LOXEA</option>
                      <option value="">—</option>
                    </select>
                  </div>
                )}
                {quickEdit.field === 'kilometrage' && (
                  <div className="form-group">
                    <label>Kilométrage</label>
                    <input
                      type="number"
                      min="0"
                      value={qeValue}
                      onChange={(e) => setQeValue(e.target.value)}
                      autoFocus
                    />
                  </div>
                )}
                {quickEdit.field === 'cv' && (
                  <div className="form-group">
                    <label>CV</label>
                    <input value={qeValue} onChange={(e) => setQeValue(e.target.value)} autoFocus />
                  </div>
                )}
                {quickEdit.field === 'etat' && (
                  <div className="form-group">
                    <label>État tech.</label>
                    <select value={qeValue} onChange={(e) => setQeValue(e.target.value)} autoFocus>
                      <option value="">Automatique (âge / km)</option>
                      {CHARROI_ETATS.map((etat) => (
                        <option key={etat} value={etat}>{etat}</option>
                      ))}
                    </select>
                    <p className="form-hint">
                      « Automatique » recalcule l&apos;état selon l&apos;âge et le kilométrage.
                    </p>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setQuickEdit(null)}>
                  Annuler
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleQuickSave()}
                  disabled={qeSaving}
                >
                  {qeSaving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}

        {detail && detailExpl && (
          <div className="modal-overlay open" onClick={() => setDetail(null)}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Fiche véhicule — {detail.plaque || detail.marque || detail.id}</h3>
                <button type="button" className="modal-close" onClick={() => setDetail(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="charroi-status-box">
                  <div className="charroi-status-line">{detailExpl.ageLabel}</div>
                  <div className="charroi-status-line">{detailExpl.kmLabel}</div>
                  <div className="charroi-status-line">
                    <strong>
                      {detail.etatManuel ? 'Statut manuel' : detailExpl.finalLabel}
                    </strong>{' '}
                    <span className={observationClass(detail.observationTech)}>
                      {detail.observationTech}
                    </span>
                  </div>
                </div>
                <div className="form-grid charroi-detail-grid">
                  {[
                    ['N°', detail.numero],
                    ['Marque', detail.marque],
                    ['Type', detail.type],
                    ['N° châssis', detail.numeroChassis],
                    ['Plaque', detail.plaque],
                    ['CV', detail.cv],
                    ['Assureur', detail.assureur],
                    ['Département', detail.departement],
                    ['Responsable', detail.user],
                    ['Province', detail.province],
                    ['Propriétaire', detail.proprietaire],
                    ['Kilométrage', detail.kilometrage == null ? '—' : detail.kilometrage.toLocaleString('fr-FR')],
                    ['Mise en circulation', detail.miseCirculation],
                    ['Âge', detail.age],
                    ['Assurance (fin)', formatCharroiDate(detail.assuranceFin)],
                    ['Vignette (fin)', formatCharroiDate(detail.vignetteFin)],
                    ['Contrôle technique (fin)', formatCharroiDate(detail.controleTechniqueFin)],
                    ['État tech.', detail.observationTech],
                    ['Notes', detail.notes],
                  ].map(([label, value]) => (
                    <div className="form-group" key={String(label)}>
                      <label>{label}</label>
                      <div className="charroi-detail-value">{value || '—'}</div>
                    </div>
                  ))}
                </div>
                {canEdit && (
                  <div className="charroi-detail-doc-actions">
                    {(['assurance', 'vignette', 'controleTechnique'] as CharroiDocKind[]).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setDetail(null);
                          openDocModal(detail, kind);
                        }}
                      >
                        Historique {CHARROI_DOC_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>Fermer</button>
                {canEdit && (
                  <button type="button" className="btn btn-primary" onClick={() => openEdit(detail)}>Modifier</button>
                )}
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="modal-overlay open" onClick={() => setModalOpen(false)}>
            <div className="modal modal-lg modal-form" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{form.id ? 'Modifier le véhicule' : 'Ajouter un véhicule'}</h3>
                <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="charroi-status-box">
                  <div className="charroi-status-line">{formPreview.ageLabel}</div>
                  <div className="charroi-status-line">{formPreview.kmLabel}</div>
                  <div className="charroi-status-line">
                    <strong>{form.etatManuel ? 'Statut manuel' : 'Statut calculé'}</strong>{' '}
                    <span className={observationClass(form.etatManuel || formPreview.final)}>
                      {form.etatManuel || formPreview.final}
                    </span>
                  </div>
                </div>
                <div className="form-grid">
                  {[
                    ['numero', 'N°'],
                    ['marque', 'Marque'],
                    ['type', 'Type'],
                    ['numeroChassis', 'N° châssis'],
                    ['plaque', 'Plaque'],
                    ['cv', 'CV'],
                    ['assureur', 'Assureur'],
                    ['kilometrage', 'Kilométrage'],
                  ].map(([key, label]) => (
                    <div className="form-group" key={key}>
                      <label>{label}</label>
                      <input
                        value={form[key as keyof FormState] as string}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      />
                    </div>
                  ))}
                  <div className="form-group">
                    <label>Responsable</label>
                    <EmployeeSuggestInput
                      employees={employees}
                      value={form.user}
                      onChange={(value) => setForm((prev) => ({ ...prev, user: value }))}
                      onEmployeeSelect={(employee) =>
                        setForm((prev) => ({
                          ...prev,
                          user: employee.nom,
                          departement: employee.departement || prev.departement,
                        }))
                      }
                      placeholder="Rechercher un employé ou saisir un nom…"
                    />
                  </div>
                  <div className="form-group">
                    <label>Département {formEmployee ? '(suivi automatique)' : ''}</label>
                    <input
                      value={formEmployee ? (formEmployee.departement || '') : form.departement}
                      disabled={Boolean(formEmployee)}
                      onChange={(e) => setForm({ ...form, departement: e.target.value })}
                      placeholder="Saisir le département"
                    />
                  </div>
                  <div className="form-group">
                    <label>Province</label>
                    <input
                      value={form.province}
                      onChange={(e) => setForm({ ...form, province: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Mise en circulation</label>
                    <input
                      type="date"
                      value={form.miseCirculation}
                      onChange={(e) => setForm({ ...form, miseCirculation: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Propriétaire</label>
                    <select
                      value={form.proprietaire}
                      onChange={(e) => setForm({ ...form, proprietaire: e.target.value as CharroiProprietaire })}
                    >
                      <option value="PPC">PPC</option>
                      <option value="LOXEA">LOXEA</option>
                      <option value="">—</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>État tech.</label>
                    <select
                      value={form.etatManuel}
                      onChange={(e) => setForm({ ...form, etatManuel: e.target.value })}
                    >
                      <option value="">Automatique (âge / km)</option>
                      {CHARROI_ETATS.map((etat) => (
                        <option key={etat} value={etat}>{etat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Assurance / Vignette / Contr. tech.</label>
                    <p className="form-hint">
                      Gérez les périodes et preuves via les cellules du tableau ou le menu
                      « historique » (formulaire date début / fin + URL preuve).
                    </p>
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <textarea
                      rows={2}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Annuler</button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PermissionGate>
  );
}
