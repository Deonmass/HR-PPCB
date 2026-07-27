'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import PermissionGate from '@/components/PermissionGate';
import RefreshButton from '@/components/RefreshButton';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import { usePermissions } from '@/contexts/PermissionContext';
import type { Fournisseur } from '@/lib/fournisseurs-types';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';

const MENU = 'factures.fournisseur.fournisseurs';
const emptyForm = { id: '', nom: '', natureService: '' };

export default function FournisseursPage() {
  const { can } = usePermissions();
  const [items, setItems] = useState<Fournisseur[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch('/api/fournisseurs');
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
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const haystack = `${item.nom} ${item.natureService}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search]);

  const natures = useMemo(() => {
    const set = new Set(items.map((i) => i.natureService).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [items]);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (item: Fournisseur) => {
    setForm({ id: item.id, nom: item.nom, natureService: item.natureService });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.nom.trim()) {
      await showError("Nom de l'ETS requis");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/fournisseurs', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Erreur');
        return;
      }
      await showSuccess(form.id ? 'Fournisseur mis à jour' : 'Fournisseur ajouté');
      setModalOpen(false);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: Fournisseur) => {
    if (!(await confirmDelete('Supprimer ce fournisseur ?', item.nom))) return;
    const res = await fetch(`/api/fournisseurs?id=${encodeURIComponent(item.id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      await showError(json.error || 'Suppression impossible');
      return;
    }
    await load(true);
  };

  const menuItems = (item: Fournisseur): ContextMenuItem[] => {
    const actions: ContextMenuItem[] = [];
    if (can(MENU, 'edit')) {
      actions.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => openEdit(item),
      });
    }
    if (can(MENU, 'delete')) {
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

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <PermissionGate anyOf={[{ menuId: MENU, action: 'view' }]}>
      <div className="page-header">
        <div>
          <div className="page-header-title-row">
            <h2>Fournisseurs</h2>
            <RefreshButton onClick={() => void load(true)} loading={refreshing} />
          </div>
          <p>
            {filtered.length} / {items.length} fournisseur{items.length > 1 ? 's' : ''}
          </p>
        </div>
        <PermissionGate menuId={MENU} action="create">
          <button type="button" className="btn btn-accent" onClick={openCreate}>
            + Ajouter
          </button>
        </PermissionGate>
      </div>

      <div className="panel settings-search-panel">
        <div className="panel-toolbar settings-search-toolbar">
          <input
            type="search"
            className="search-input"
            placeholder="Rechercher un fournisseur ou une nature de service…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="settings-cards-grid settings-entity-grid">
        {filtered.length === 0 ? (
          <p className="empty-state">Aucun fournisseur trouvé.</p>
        ) : (
          filtered.map((item) => (
            <article key={item.id} className="settings-card">
              <div className="settings-card-top">
                <span className="settings-card-code">{item.natureService || '—'}</span>
                {menuItems(item).length > 0 && (
                  <CardActionMenu items={menuItems(item)} ariaLabel={`Actions — ${item.nom}`} />
                )}
              </div>
              <h3 className="settings-card-title">{item.nom}</h3>
            </article>
          ))
        )}
      </div>

      {modalOpen && (
        <div className="modal-overlay open" onClick={() => setModalOpen(false)}>
          <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Modifier le fournisseur' : 'Ajouter un fournisseur'}</h3>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Nom de l&apos;ETS</label>
                  <input
                    value={form.nom}
                    onChange={(e) => setForm({ ...form, nom: e.target.value })}
                    placeholder="Ex. Gringo"
                    autoFocus
                  />
                </div>
                <div className="form-group">
                  <label>Nature de service</label>
                  <input
                    list="fournisseur-natures"
                    value={form.natureService}
                    onChange={(e) => setForm({ ...form, natureService: e.target.value })}
                    placeholder="Ex. Restauration"
                  />
                  <datalist id="fournisseur-natures">
                    {natures.map((nature) => (
                      <option key={nature} value={nature} />
                    ))}
                  </datalist>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={() => void handleSave()} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PermissionGate>
  );
}
