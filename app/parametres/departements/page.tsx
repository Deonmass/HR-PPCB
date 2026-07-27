'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import PermissionGate from '@/components/PermissionGate';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { DepartmentSetting } from '@/lib/auth-types';

const emptyForm = { id: '', name: '', code: '', active: true };

export default function DepartementsPage() {
  const { can } = usePermissions();
  const [items, setItems] = useState<DepartmentSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/settings/departments');
    setItems(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const haystack = `${item.name} ${item.code ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search]);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (item: DepartmentSetting) => {
    setForm({ id: item.id, name: item.name, code: item.code || '', active: item.active });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      await showError('Nom du département requis');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/departments', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const json = await res.json();
        await showError(json.error || 'Erreur');
        return;
      }
      await showSuccess(form.id ? 'Département mis à jour' : 'Département ajouté');
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: DepartmentSetting) => {
    const res = await fetch('/api/settings/departments', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, active: !item.active }),
    });
    if (!res.ok) {
      const json = await res.json();
      await showError(json.error || 'Erreur');
      return;
    }
    await showSuccess(item.active ? 'Département désactivé' : 'Département activé');
    await load();
  };

  const handleDelete = async (item: DepartmentSetting) => {
    if (!(await confirmDelete('Supprimer ce département ?', item.name))) return;
    await fetch(`/api/settings/departments?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    await load();
  };

  const menuItems = (item: DepartmentSetting): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (can('settings.departements', 'edit')) {
      items.push({
        id: 'toggle',
        label: item.active ? 'Désactiver' : 'Activer',
        icon: 'toggle',
        onClick: () => handleToggleActive(item),
      });
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => openEdit(item),
      });
    }
    if (can('settings.departements', 'delete')) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => handleDelete(item),
      });
    }
    return items;
  };

  if (loading) return <div className="loading">Chargement...</div>;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-header-title-row">
            <h2>Départements</h2>
            <RefreshButton onClick={load} loading={false} />
          </div>
          <p>
            {filtered.length} / {items.length} département{items.length > 1 ? 's' : ''}
          </p>
        </div>
        <PermissionGate menuId="settings.departements" action="create">
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
            placeholder="Rechercher un département…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="settings-cards-grid settings-entity-grid">
        {filtered.map((item) => (
          <article key={item.id} className="settings-card">
            <div className="settings-card-top">
              <span className="settings-card-code">{item.code || '—'}</span>
              {menuItems(item).length > 0 && (
                <CardActionMenu items={menuItems(item)} ariaLabel={`Actions — ${item.name}`} />
              )}
            </div>
            <h3 className="settings-card-title">{item.name}</h3>
            <span className={`settings-badge${item.active ? '' : ' inactive'}`}>
              {item.active ? 'Actif' : 'Inactif'}
            </span>
          </article>
        ))}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Modifier département' : 'Ajouter un département'}</h3>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Nom</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Code</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Annuler
              </button>
              <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
