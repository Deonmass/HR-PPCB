'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { CharroiAchat, CharroiAchatStatus } from '@/lib/charroi-types';
import {
  CHARROI_ACHAT_STATUSES,
  computeAchatTotal,
  computeFuelCost,
  roundMoney,
  toMiseCirculationDateInput,
} from '@/lib/charroi-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

const MENU = 'charroi.achats';
const VIEW_ANY = [
  { menuId: MENU, action: 'view' as const },
  { menuId: 'charroi', action: 'view' as const },
];

type FormState = {
  id: string;
  nature: string;
  marque: string;
  type: string;
  plaque: string;
  cv: string;
  miseCirc: string;
  depart: string;
  centreDeCout: string;
  province: string;
  matricule: string;
  secteur: string;
  coutAchat: string;
  coutPneus: string;
  battery: string;
  othersConsumables: string;
  nbreLitrCarteEngen: string;
  prixLitre: string;
  assuranceAnnuelle: string;
  taxesControlTech: string;
  vignette: string;
  nouvellePlaque: string;
  entretienTrimestriel: string;
  reparationsDiverses: string;
  status: CharroiAchatStatus;
  notes: string;
};

const emptyForm = (): FormState => ({
  id: '',
  nature: 'Vehicule PPC',
  marque: '',
  type: '',
  plaque: '',
  cv: '',
  miseCirc: '',
  depart: '',
  centreDeCout: '',
  province: '',
  matricule: '',
  secteur: '',
  coutAchat: '0',
  coutPneus: '0',
  battery: '0',
  othersConsumables: '0',
  nbreLitrCarteEngen: '0',
  prixLitre: '0',
  assuranceAnnuelle: '0',
  taxesControlTech: '0',
  vignette: '0',
  nouvellePlaque: '0',
  entretienTrimestriel: '0',
  reparationsDiverses: '0',
  status: 'demande',
  notes: '',
});

function parseMoney(raw: string): number {
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? roundMoney(n) : 0;
}

function formatMoney(value: number): string {
  return value.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function statusLabel(status: CharroiAchatStatus): string {
  return CHARROI_ACHAT_STATUSES.find((s) => s.id === status)?.label ?? status;
}

function statusClass(status: CharroiAchatStatus): string {
  return `charroi-status is-${status}`;
}

function fromAchat(item: CharroiAchat): FormState {
  const money = (n: number) => String(n ?? 0);
  return {
    id: item.id,
    nature: item.nature,
    marque: item.marque,
    type: item.type,
    plaque: item.plaque,
    cv: item.cv,
    miseCirc: toMiseCirculationDateInput(item.miseCirc),
    depart: item.depart,
    centreDeCout: item.centreDeCout,
    province: item.province,
    matricule: item.matricule,
    secteur: item.secteur,
    coutAchat: money(item.coutAchat),
    coutPneus: money(item.coutPneus),
    battery: money(item.battery),
    othersConsumables: money(item.othersConsumables),
    nbreLitrCarteEngen: money(item.nbreLitrCarteEngen),
    prixLitre: money(item.prixLitre),
    assuranceAnnuelle: money(item.assuranceAnnuelle),
    taxesControlTech: money(item.taxesControlTech),
    vignette: money(item.vignette),
    nouvellePlaque: money(item.nouvellePlaque),
    entretienTrimestriel: money(item.entretienTrimestriel),
    reparationsDiverses: money(item.reparationsDiverses),
    status: item.status,
    notes: item.notes || '',
  };
}

export default function CharroiAchatsPage() {
  const { can } = usePermissions();
  const canCreate = can(MENU, 'create') || can('charroi', 'create');
  const canEdit = can(MENU, 'edit') || can('charroi', 'edit');
  const canDelete = can(MENU, 'delete') || can('charroi', 'delete');

  const [items, setItems] = useState<CharroiAchat[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<CharroiAchat | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  const computed = useMemo(() => {
    const litres = parseMoney(form.nbreLitrCarteEngen);
    const prixLitre = parseMoney(form.prixLitre);
    const fuelCost = computeFuelCost(litres, prixLitre);
    const parts = {
      coutAchat: parseMoney(form.coutAchat),
      coutPneus: parseMoney(form.coutPneus),
      battery: parseMoney(form.battery),
      othersConsumables: parseMoney(form.othersConsumables),
      fuelCost,
      assuranceAnnuelle: parseMoney(form.assuranceAnnuelle),
      taxesControlTech: parseMoney(form.taxesControlTech),
      vignette: parseMoney(form.vignette),
      nouvellePlaque: parseMoney(form.nouvellePlaque),
      entretienTrimestriel: parseMoney(form.entretienTrimestriel),
      reparationsDiverses: parseMoney(form.reparationsDiverses),
    };
    return { fuelCost, total: computeAchatTotal(parts), parts };
  }, [form]);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/charroi/achats');
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filterStatus && item.status !== filterStatus) return false;
      if (!q) return true;
      const hay = [
        item.nature,
        item.marque,
        item.type,
        item.plaque,
        item.depart,
        item.province,
        item.centreDeCout,
        item.secteur,
        item.matricule,
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [items, search, filterStatus]);

  const openCreate = () => {
    setForm(emptyForm());
    setModalOpen(true);
  };

  const openEdit = (item: CharroiAchat) => {
    setForm(fromAchat(item));
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nature.trim() && !form.marque.trim()) {
      await showError('Nature ou marque requise');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nature: form.nature.trim(),
        marque: form.marque.trim(),
        type: form.type.trim(),
        plaque: form.plaque.trim(),
        cv: form.cv.trim(),
        miseCirc: form.miseCirc.trim(),
        depart: form.depart.trim(),
        centreDeCout: form.centreDeCout.trim(),
        province: form.province.trim(),
        matricule: form.matricule.trim(),
        secteur: form.secteur.trim(),
        ...computed.parts,
        nbreLitrCarteEngen: parseMoney(form.nbreLitrCarteEngen),
        prixLitre: parseMoney(form.prixLitre),
        total: computed.total,
        status: form.status,
        notes: form.notes.trim(),
      };
      const res = await fetch(
        form.id ? `/api/charroi/achats/${encodeURIComponent(form.id)}` : '/api/charroi/achats',
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
      await showSuccess(form.id ? 'Achat mis à jour' : 'Demande d’achat enregistrée');
      setModalOpen(false);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: CharroiAchat) => {
    if (!(await confirmDelete('Supprimer cet achat ?', `${item.marque} ${item.type}`.trim()))) {
      return;
    }
    const res = await fetch(`/api/charroi/achats/${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await showError(json.error || 'Suppression impossible');
      return;
    }
    await load(true);
  };

  const menuItems = (item: CharroiAchat): ContextMenuItem[] => {
    const actions: ContextMenuItem[] = [
      { id: 'view', label: 'Voir', icon: 'view', onClick: () => setDetail(item) },
    ];
    if (canEdit) {
      actions.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => openEdit(item),
      });
    }
    if (canDelete) {
      actions.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => void handleDelete(item),
      });
    }
    return actions;
  };

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate anyOf={VIEW_ANY}>
      <div className="charroi-page">
        <div className="page-header">
          <div>
            <div className="page-header-title-row">
              <h2>Nouveaux achats</h2>
              <RefreshButton onClick={() => void load(true)} loading={refreshing} />
            </div>
            <p>
              {filtered.length} / {items.length} demande{items.length > 1 ? 's' : ''}
            </p>
          </div>
          {canCreate && (
            <button type="button" className="btn btn-accent" onClick={openCreate}>
              + Nouvelle demande
            </button>
          )}
        </div>

        <div className="panel docs-filter-bar-compact charroi-filters">
          <input
            type="search"
            className="search-input"
            placeholder="Rechercher nature, marque, province…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="filter-select filter-select-sm"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="">Statut (tous)</option>
            {CHARROI_ACHAT_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap charroi-table-wrap">
          <table className="data-table charroi-table">
            <thead>
              <tr>
                <th>N°</th>
                <th>Nature</th>
                <th>Marque</th>
                <th>Type</th>
                <th>Départ</th>
                <th>Province</th>
                <th>Secteur</th>
                <th>Fuel</th>
                <th>Total</th>
                <th>Statut</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={11} className="empty-state">Aucune demande trouvée.</td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr key={item.id} className="charroi-row-click" onClick={() => setDetail(item)}>
                    <td>{item.numero ?? '—'}</td>
                    <td>{item.nature || '—'}</td>
                    <td><strong>{item.marque || '—'}</strong></td>
                    <td>{item.type || '—'}</td>
                    <td>{item.depart || '—'}</td>
                    <td>{item.province || '—'}</td>
                    <td>{item.secteur || '—'}</td>
                    <td>{formatMoney(item.fuelCost)}</td>
                    <td><strong>{formatMoney(item.total)}</strong></td>
                    <td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td>
                    <td className="charroi-actions-cell" onClick={(e) => e.stopPropagation()}>
                      <CardActionMenu
                        items={menuItems(item)}
                        ariaLabel={`Actions — ${item.marque || item.nature}`}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {detail && (
          <div className="modal-overlay open" onClick={() => setDetail(null)}>
            <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Détail achat — {detail.marque || detail.nature || detail.id}</h3>
                <button type="button" className="modal-close" onClick={() => setDetail(null)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-grid charroi-detail-grid">
                  {[
                    ['Nature', detail.nature],
                    ['Marque', detail.marque],
                    ['Type', detail.type],
                    ['Plaque', detail.plaque],
                    ['CV', detail.cv],
                    ['Mise circ.', detail.miseCirc],
                    ['Département', detail.depart],
                    ['Centre de coût', detail.centreDeCout],
                    ['Province', detail.province],
                    ['Matricule', detail.matricule],
                    ['Secteur', detail.secteur],
                    ['Statut', statusLabel(detail.status)],
                    ['Coût achat', formatMoney(detail.coutAchat)],
                    ['Pneus', formatMoney(detail.coutPneus)],
                    ['Batterie', formatMoney(detail.battery)],
                    ['Autres conso.', formatMoney(detail.othersConsumables)],
                    ['Litres', detail.nbreLitrCarteEngen],
                    ['Prix/litre', formatMoney(detail.prixLitre)],
                    ['Fuel', formatMoney(detail.fuelCost)],
                    ['Assurance', formatMoney(detail.assuranceAnnuelle)],
                    ['Taxes ctrl', formatMoney(detail.taxesControlTech)],
                    ['Vignette', formatMoney(detail.vignette)],
                    ['Nouvelle plaque', formatMoney(detail.nouvellePlaque)],
                    ['Entretien trim.', formatMoney(detail.entretienTrimestriel)],
                    ['Réparations', formatMoney(detail.reparationsDiverses)],
                    ['TOTAL', formatMoney(detail.total)],
                    ['Notes', detail.notes],
                  ].map(([label, value]) => (
                    <div className="form-group" key={String(label)}>
                      <label>{label}</label>
                      <div className={`charroi-detail-value${label === 'TOTAL' ? ' charroi-total-input' : ''}`}>
                        {value || '—'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setDetail(null)}>Fermer</button>
                {canEdit && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => { setDetail(null); openEdit(detail); }}
                  >
                    Modifier
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {modalOpen && (
          <div className="modal-overlay open" onClick={() => setModalOpen(false)}>
            <div className="modal modal-lg modal-form charroi-achat-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>{form.id ? 'Modifier la demande d’achat' : 'Nouvelle demande d’achat'}</h3>
                <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>×</button>
              </div>
              <div className="modal-body">
                <div className="form-grid">
                  {[
                    ['nature', 'Nature'],
                    ['marque', 'Marque'],
                    ['type', 'Type'],
                    ['plaque', 'Plaque'],
                    ['cv', 'CV'],
                    ['depart', 'Département'],
                    ['centreDeCout', 'Centre de coût'],
                    ['province', 'Province'],
                    ['matricule', 'Matricule'],
                    ['secteur', 'Secteur'],
                  ].map(([key, label]) => (
                    <div className="form-group" key={key}>
                      <label>{label}</label>
                      <input
                        value={form[key as keyof FormState] as string}
                        onChange={(e) => setField(key as keyof FormState, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="form-group">
                    <label>Mise en circulation</label>
                    <input
                      type="date"
                      value={form.miseCirc}
                      onChange={(e) => setField('miseCirc', e.target.value)}
                    />
                  </div>
                  <div className="form-group">
                    <label>Statut</label>
                    <select
                      value={form.status}
                      onChange={(e) => setForm({ ...form, status: e.target.value as CharroiAchatStatus })}
                    >
                      {CHARROI_ACHAT_STATUSES.map((s) => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <h4 className="charroi-form-section">Coûts</h4>
                <div className="form-grid">
                  {[
                    ['coutAchat', 'Coût d’achat'],
                    ['coutPneus', 'Coût pneus'],
                    ['battery', 'Batterie'],
                    ['othersConsumables', 'Autres consommables'],
                    ['nbreLitrCarteEngen', 'Nb litres carte engin'],
                    ['prixLitre', 'Prix / litre'],
                    ['assuranceAnnuelle', 'Assurance annuelle'],
                    ['taxesControlTech', 'Taxes contrôle tech.'],
                    ['vignette', 'Vignette'],
                    ['nouvellePlaque', 'Nouvelle plaque'],
                    ['entretienTrimestriel', 'Entretien trimestriel'],
                    ['reparationsDiverses', 'Réparations diverses'],
                  ].map(([key, label]) => (
                    <div className="form-group" key={key}>
                      <label>{label}</label>
                      <input
                        type="number"
                        step="0.01"
                        value={form[key as keyof FormState] as string}
                        onChange={(e) => setField(key as keyof FormState, e.target.value)}
                      />
                    </div>
                  ))}
                  <div className="form-group">
                    <label>Fuel cost (auto)</label>
                    <input value={formatMoney(computed.fuelCost)} readOnly />
                  </div>
                  <div className="form-group">
                    <label>TOTAL (auto)</label>
                    <input className="charroi-total-input" value={formatMoney(computed.total)} readOnly />
                  </div>
                  <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                    <label>Notes</label>
                    <textarea
                      rows={2}
                      value={form.notes}
                      onChange={(e) => setField('notes', e.target.value)}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                  Annuler
                </button>
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
