'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import CardActionMenu from '@/components/CardActionMenu';
import PermissionGate from '@/components/PermissionGate';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { DepartmentSetting, ServiceSetting } from '@/lib/auth-types';

const emptyForm = { id: '', name: '', code: '', departmentId: '', active: true };

export default function DepartmentServicesPage() {
  const { can } = usePermissions();
  const router = useRouter();
  const params = useParams();
  const departmentId = typeof params.id === 'string' ? decodeURIComponent(params.id) : '';

  const [department, setDepartment] = useState<DepartmentSetting | null>(null);
  const [departments, setDepartments] = useState<DepartmentSetting[]>([]);
  const [items, setItems] = useState<ServiceSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    const [deptRes, svcRes] = await Promise.all([
      fetch('/api/settings/departments'),
      fetch(`/api/settings/services?departmentId=${encodeURIComponent(departmentId)}`),
    ]);
    const deptJson = (await deptRes.json()) as DepartmentSetting[];
    const depts = Array.isArray(deptJson) ? deptJson : [];
    const found = depts.find((dept) => dept.id === departmentId) ?? null;
    setDepartments(depts);
    setDepartment(found);
    setNotFound(!found);
    const svcJson = svcRes.ok ? await svcRes.json() : [];
    setItems(Array.isArray(svcJson) ? svcJson : []);
    setLoading(false);
  }, [departmentId]);

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
      const haystack = `${item.name} ${item.code ?? ''} ${deptName(item.departmentId)}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [items, search, deptName]);

  const openCreate = () => {
    setForm({ ...emptyForm, departmentId });
    setModalOpen(true);
  };

  const openEdit = (item: ServiceSetting) => {
    setForm({
      id: item.id,
      name: item.name,
      code: item.code || '',
      departmentId: item.departmentId || departmentId,
      active: item.active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      await showError('Nom du service requis');
      return;
    }
    if (!form.departmentId.trim()) {
      await showError('Département associé requis');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/settings/services', {
        method: form.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const json = await res.json();
        await showError(json.error || 'Erreur');
        return;
      }
      await showSuccess(form.id ? 'Service mis à jour' : 'Service ajouté');
      setModalOpen(false);
      if (form.departmentId && form.departmentId !== departmentId) {
        router.push(`/parametres/departements/${encodeURIComponent(form.departmentId)}`);
        return;
      }
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (item: ServiceSetting) => {
    const res = await fetch('/api/settings/services', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, active: !item.active }),
    });
    if (!res.ok) {
      const json = await res.json();
      await showError(json.error || 'Erreur');
      return;
    }
    await showSuccess(item.active ? 'Service désactivé' : 'Service activé');
    await load();
  };

  const handleDelete = async (item: ServiceSetting) => {
    if (!(await confirmDelete('Supprimer ce service ?', item.name))) return;
    await fetch(`/api/settings/services?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    await load();
  };

  const menuItems = (item: ServiceSetting): ContextMenuItem[] => {
    const actions: ContextMenuItem[] = [];
    if (can('settings.departements', 'edit')) {
      actions.push({
        id: 'toggle',
        label: item.active ? 'Désactiver' : 'Activer',
        icon: 'toggle',
        onClick: () => handleToggleActive(item),
      });
      actions.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => openEdit(item),
      });
    }
    if (can('settings.departements', 'delete')) {
      actions.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => handleDelete(item),
      });
    }
    return actions;
  };

  if (loading) return <div className="loading">Chargement...</div>;

  if (notFound || !department) {
    return (
      <>
        <div className="page-header">
          <h2>Département introuvable</h2>
        </div>
        <div className="panel panel-padded">
          <p className="alert alert-danger">Ce département n’existe plus.</p>
          <Link href="/parametres/departements" className="btn btn-secondary">
            ← Retour aux départements
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <Link href="/parametres/departements" className="settings-back-link">
            ← Départements
          </Link>
          <div className="page-header-title-row">
            <h2>Services — {department.name}</h2>
            <RefreshButton onClick={load} loading={false} />
          </div>
          <p>
            {filtered.length} / {items.length} service{items.length > 1 ? 's' : ''}
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
            placeholder="Rechercher un service…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="panel panel-padded">
          <p className="empty-state">Aucun service pour ce département.</p>
        </div>
      ) : (
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
              <p className="settings-card-meta">{deptName(item.departmentId)}</p>
              <span className={`settings-badge${item.active ? '' : ' inactive'}`}>
                {item.active ? 'Actif' : 'Inactif'}
              </span>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-form" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Modifier le service' : 'Ajouter un service'}</h3>
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
                <div className="form-group">
                  <label>Département associé *</label>
                  <select
                    value={form.departmentId}
                    onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                    required
                  >
                    <option value="">Sélectionner un département</option>
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
