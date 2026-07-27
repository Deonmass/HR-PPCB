'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import CardActionMenu from '@/components/CardActionMenu';
import PermissionGate from '@/components/PermissionGate';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { CostCenterSetting, DepartmentSetting } from '@/lib/auth-types';

const emptyForm = { id: '', code: '', name: '', departmentId: '', active: true };

export default function CentresDeCoutPage() {
  const { can } = usePermissions();
  const [items, setItems] = useState<CostCenterSetting[]>([]);
  const [departments, setDepartments] = useState<DepartmentSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [centersRes, deptRes] = await Promise.all([
      fetch('/api/settings/cost-centers'),
      fetch('/api/settings/departments'),
    ]);
    setItems(await centersRes.json());
    setDepartments(await deptRes.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const deptName = useCallback(
    (id?: string) => departments.find((dept) => dept.id === id)?.name || '—',
    [departments],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => {
      const haystack = `${item.code} ${item.name} ${deptName(item.departmentId)}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search, deptName]);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (item: CostCenterSetting) => {
    setForm({
      id: item.id,
      code: item.code,
      name: item.name,
      departmentId: item.departmentId || '',
      active: item.active ?? true,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      await showError('Code et nom requis');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/cost-centers', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          departmentId: form.departmentId || undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        await showError(json.error || 'Erreur');
        return;
      }
      await showSuccess(form.id ? 'Centre de coût mis à jour' : 'Centre de coût ajouté');
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: CostCenterSetting) => {
    const res = await fetch('/api/settings/cost-centers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, active: !(item.active ?? true) }),
    });
    if (!res.ok) {
      const json = await res.json();
      await showError(json.error || 'Erreur');
      return;
    }
    await showSuccess(item.active ? 'Centre désactivé' : 'Centre activé');
    await load();
  };

  const handleDelete = async (item: CostCenterSetting) => {
    if (!(await confirmDelete('Supprimer ce centre de coût ?', `${item.code} — ${item.name}`))) return;
    await fetch(`/api/settings/cost-centers?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    await load();
  };

  const menuItems = (item: CostCenterSetting): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (can('settings.centres', 'edit')) {
      items.push({
        id: 'toggle',
        label: item.active !== false ? 'Désactiver' : 'Activer',
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
    if (can('settings.centres', 'delete')) {
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
            <h2>Centre de coût</h2>
            <RefreshButton onClick={load} loading={false} />
          </div>
          <p>
            {filtered.length} / {items.length} centre{items.length > 1 ? 's' : ''} de coût
          </p>
        </div>
        <PermissionGate menuId="settings.centres" action="create">
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
            placeholder="Rechercher un centre de coût…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="settings-cards-grid settings-entity-grid">
        {filtered.map((item) => (
          <article key={item.id} className="settings-card">
            <div className="settings-card-top">
              <span className="settings-card-code">{item.code}</span>
              {menuItems(item).length > 0 && (
                <CardActionMenu items={menuItems(item)} ariaLabel={`Actions — ${item.name}`} />
              )}
            </div>
            <h3 className="settings-card-title">{item.name}</h3>
            <p className="settings-card-meta">{deptName(item.departmentId)}</p>
            <span className={`settings-badge${item.active !== false ? '' : ' inactive'}`}>
              {item.active !== false ? 'Actif' : 'Inactif'}
            </span>
          </article>
        ))}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Modifier centre de coût' : 'Ajouter un centre de coût'}</h3>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Code</label>
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Libellé</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Département</label>
                  <select
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  >
                    <option value="">Aucun</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.id}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
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
