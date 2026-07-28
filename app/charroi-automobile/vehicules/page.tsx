'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import CharroiDashboard from '@/components/charroi/CharroiDashboard';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { CharroiProprietaire, CharroiVehicule } from '@/lib/charroi-types';
import {
  CHARROI_OBSERVATIONS,
  computeAgeFromMiseCirculation,
  computeObservationTech,
  explainObservationTech,
  normalizeMarqueLabel,
  normalizeProvinceLabel,
  toMiseCirculationDateInput,
} from '@/lib/charroi-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

const MENU = 'charroi.vehicules';
const VIEW_ANY = [
  { menuId: MENU, action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];

type Tab = 'dashboard' | 'liste';

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
  notes: '',
});

function observationClass(value: string): string {
  const v = value.trim().toLowerCase();
  if (v.includes('bon')) return 'charroi-obs is-ok';
  if (v.includes('avert')) return 'charroi-obs is-warn';
  if (v.includes('déclass') || v.includes('declas')) return 'charroi-obs is-bad';
  return 'charroi-obs';
}

function toNum(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function toPayload(form: FormState) {
  const kilometrage = toNum(form.kilometrage);
  const miseCirculation = form.miseCirculation.trim();
  const age = computeAgeFromMiseCirculation(miseCirculation);
  return {
    numero: toNum(form.numero),
    marque: normalizeMarqueLabel(form.marque),
    type: form.type.trim(),
    numeroChassis: form.numeroChassis.trim(),
    plaque: form.plaque.trim(),
    cv: form.cv.trim(),
    assureur: form.assureur.trim(),
    departement: form.departement.trim(),
    user: form.user.trim(),
    province: normalizeProvinceLabel(form.province),
    proprietaire: form.proprietaire,
    kilometrage,
    miseCirculation,
    age,
    observationTech: computeObservationTech({ age, kilometrage }),
    notes: form.notes.trim(),
  };
}

export default function CharroiVehiculesPage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create') || can('charroi', 'create');
  const canEdit = can(MENU, 'edit') || can('charroi', 'edit');
  const canDelete = can(MENU, 'delete') || can('charroi', 'delete');

  const [tab, setTab] = useState<Tab>('dashboard');
  const [items, setItems] = useState<CharroiVehicule[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterProp, setFilterProp] = useState('');
  const [filterObs, setFilterObs] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<CharroiVehicule | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

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
  }, [load]);

  const departments = useMemo(() => {
    const set = new Set(items.map((i) => i.departement).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filterProp && item.proprietaire !== filterProp) return false;
      if (filterObs && item.observationTech !== filterObs) return false;
      if (filterDept && item.departement !== filterDept) return false;
      if (!q) return true;
      const hay = [
        item.numero, item.marque, item.type, item.numeroChassis, item.plaque,
        item.user, item.departement, item.province, item.assureur,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, filterProp, filterObs, filterDept]);

  const formPreview = useMemo(() => {
    const kilometrage = toNum(form.kilometrage);
    const age = computeAgeFromMiseCirculation(form.miseCirculation);
    return explainObservationTech({ age, kilometrage, miseCirculation: form.miseCirculation });
  }, [form.kilometrage, form.miseCirculation]);

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
      const payload = toPayload(form);
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

  return (
    <PermissionGate anyOf={VIEW_ANY}>
      <div className="charroi-page">
        <div className="page-header page-header-with-tabs">
          <div>
            <div className="page-header-title-row">
              <h2>Base véhicules</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
            <p>{items.length} véhicule{items.length > 1 ? 's' : ''}</p>
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
              </div>
              {canCreate && (
                <button type="button" className="btn btn-accent btn-sm" onClick={openCreate}>
                  + Ajouter
                </button>
              )}
            </div>
          </div>
        </div>

        {tab === 'dashboard' && (
          <CharroiDashboard items={items} onSelectVehicle={setDetail} />
        )}

        {tab === 'liste' && (
          <>
            <div className="panel docs-filter-bar-compact charroi-filters">
              <input
                type="search"
                className="search-input"
                placeholder="Rechercher marque, plaque, châssis, user…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select className="filter-select filter-select-sm" value={filterProp} onChange={(e) => setFilterProp(e.target.value)}>
                <option value="">Propriétaire (tous)</option>
                <option value="PPC">PPC</option>
                <option value="LOXEA">LOXEA</option>
              </select>
              <select className="filter-select filter-select-sm" value={filterObs} onChange={(e) => setFilterObs(e.target.value)}>
                <option value="">État tech. (tous)</option>
                {CHARROI_OBSERVATIONS.map((obs) => (
                  <option key={obs} value={obs}>{obs}</option>
                ))}
              </select>
              <select className="filter-select filter-select-sm" value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
                <option value="">Département (tous)</option>
                {departments.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div className="table-wrap charroi-table-wrap">
              <table className="data-table charroi-table">
                <thead>
                  <tr>
                    <th>N°</th>
                    <th>Marque</th>
                    <th>Type</th>
                    <th>Plaque</th>
                    <th>CV</th>
                    <th>Département</th>
                    <th>User</th>
                    <th>Province</th>
                    <th>Proprio.</th>
                    <th>Km</th>
                    <th>Mise circ.</th>
                    <th>Âge</th>
                    <th>État tech.</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr><td colSpan={14} className="empty-state">Aucun véhicule trouvé.</td></tr>
                  ) : (
                    filtered.map((item) => (
                      <tr key={item.id} className="charroi-row-click" onClick={() => setDetail(item)}>
                        <td>{item.numero ?? '—'}</td>
                        <td><strong>{item.marque || '—'}</strong></td>
                        <td>{item.type || '—'}</td>
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
                        <td>{item.kilometrage == null ? '—' : item.kilometrage.toLocaleString('fr-FR')}</td>
                        <td>{item.miseCirculation || '—'}</td>
                        <td>{item.age ?? '—'}</td>
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
                    <strong>{detailExpl.finalLabel}</strong>{' '}
                    <span className={observationClass(detailExpl.final)}>{detailExpl.final}</span>
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
                    ['User', detail.user],
                    ['Province', detail.province],
                    ['Propriétaire', detail.proprietaire],
                    ['Kilométrage', detail.kilometrage == null ? '—' : detail.kilometrage.toLocaleString('fr-FR')],
                    ['Mise en circulation', detail.miseCirculation],
                    ['Âge', detail.age],
                    ['État tech.', detail.observationTech],
                    ['Notes', detail.notes],
                  ].map(([label, value]) => (
                    <div className="form-group" key={String(label)}>
                      <label>{label}</label>
                      <div className="charroi-detail-value">{value || '—'}</div>
                    </div>
                  ))}
                </div>
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
                    <strong>Statut calculé</strong>{' '}
                    <span className={observationClass(formPreview.final)}>{formPreview.final}</span>
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
                    ['departement', 'Département'],
                    ['user', 'User'],
                    ['province', 'Province'],
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
