'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import CardActionMenu from '@/components/CardActionMenu';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import EmployeePicker, { type EmployeeSelection } from '@/components/EmployeePicker';
import PermissionGate from '@/components/PermissionGate';
import PermissionsProgress from '@/components/PermissionsProgress';
import type { ContextMenuItem } from '@/components/RowContextMenu';
import RefreshButton from '@/components/RefreshButton';
import { usePermissions } from '@/contexts/PermissionContext';
import { computePermissionsStats } from '@/lib/permissions-catalog';
import { confirmDelete, showError, showSuccess } from '@/lib/swal';
import type { AuthUser, MenuPermission } from '@/lib/auth-types';
import type { Employee } from '@/lib/types';

type SafeUser = Omit<AuthUser, 'password'>;

const emptyForm = {
  id: '',
  username: '',
  displayName: '',
  initials: '',
  email: '',
  password: '',
  active: true,
  matricule: '',
};

export default function UtilisateursPage() {
  const router = useRouter();
  const { can } = usePermissions();
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [permissionPercents, setPermissionPercents] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [resetUser, setResetUser] = useState<SafeUser | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/auth/users');
    const loadedUsers: SafeUser[] = await res.json();
    setUsers(loadedUsers);

    const results = await Promise.all(
      loadedUsers.map(async (user) => {
        const permRes = await fetch(`/api/auth/permissions?userId=${encodeURIComponent(user.id)}`);
        const json = (await permRes.json()) as { menus?: MenuPermission[] };
        const menus = json.menus ?? [];
        return [user.id, computePermissionsStats(menus).percent] as const;
      }),
    );
    setPermissionPercents(Object.fromEntries(results));
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    fetch('/api/employees')
      .then((res) => (res.ok ? res.json() : []))
      .then((json: Employee[]) => setEmployees(json))
      .catch(() => setEmployees([]));
  }, [load]);

  const openCreate = () => {
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (user: SafeUser) => {
    setForm({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      initials: user.initials,
      email: user.email || '',
      password: '',
      active: user.active,
      matricule: user.matricule || '',
    });
    setModalOpen(true);
  };

  const editingUser = users.find((user) => user.id === form.id);

  const linkedEmployeeSelection: EmployeeSelection | null = form.matricule
    ? employees.find((employee) => employee.matricule === form.matricule) ??
      (editingUser?.linkedEmployee
        ? {
            matricule: editingUser.linkedEmployee.matricule,
            nom: editingUser.linkedEmployee.nom,
            departement: editingUser.linkedEmployee.departement,
          }
        : null)
    : null;

  const handleSave = async () => {
    if (!form.username.trim() || !form.displayName.trim()) {
      await showError('Identifiant et nom affiché requis');
      return;
    }
    setSaving(true);
    try {
      const method = form.id ? 'PUT' : 'POST';
      const res = await fetch('/api/auth/users', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          initials:
            form.initials.trim() ||
            form.displayName
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 3)
              .toUpperCase(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Erreur');
        return;
      }
      await showSuccess(form.id ? 'Utilisateur mis à jour' : 'Utilisateur créé');
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (user: SafeUser) => {
    const res = await fetch('/api/auth/users', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...user, active: !user.active }),
    });
    const json = await res.json();
    if (!res.ok) {
      await showError(json.error || 'Erreur');
      return;
    }
    await showSuccess(user.active ? 'Utilisateur désactivé' : 'Utilisateur activé');
    await load();
  };

  const handleDelete = async (user: SafeUser) => {
    if (!(await confirmDelete('Supprimer cet utilisateur ?', user.displayName))) return;
    const res = await fetch(`/api/auth/users?id=${encodeURIComponent(user.id)}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      await showError(json.error || 'Erreur');
      return;
    }
    await load();
  };

  const userMenuItems = (user: SafeUser): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    if (can('settings.utilisateurs', 'edit')) {
      items.push({
        id: 'toggle',
        label: user.active ? 'Désactiver' : 'Activer',
        icon: 'toggle',
        onClick: () => handleToggleActive(user),
      });
      items.push({
        id: 'edit',
        label: 'Modifier',
        icon: 'edit',
        onClick: () => openEdit(user),
      });
    }
    if (can('settings.utilisateurs.reset', 'edit')) {
      items.push({
        id: 'reset-password',
        label: 'Réinitialiser le mot de passe',
        icon: 'edit',
        onClick: () => setResetUser(user),
      });
    }
    if (can('settings.permissions', 'view')) {
      items.push({
        id: 'permissions',
        label: 'Permissions',
        icon: 'permissions',
        onClick: () => router.push(`/parametres/permissions?userId=${encodeURIComponent(user.id)}`),
      });
    }
    if (user.id !== 'admin' && can('settings.utilisateurs', 'delete')) {
      items.push({
        id: 'delete',
        label: 'Supprimer',
        icon: 'delete',
        danger: true,
        onClick: () => handleDelete(user),
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
            <h2>Utilisateurs</h2>
            <RefreshButton onClick={load} loading={false} />
          </div>
          <p>{users.length} utilisateur{users.length > 1 ? 's' : ''}</p>
        </div>
        <PermissionGate menuId="settings.utilisateurs" action="create">
          <button type="button" className="btn btn-accent" onClick={openCreate}>
            + Nouvel utilisateur
          </button>
        </PermissionGate>
      </div>

      <div className="settings-cards-grid settings-users-grid">
        {users.map((user) => (
          <article key={user.id} className="settings-card settings-user-card">
            <div className="settings-card-top">
              <span className="settings-card-avatar">{user.initials}</span>
              {userMenuItems(user).length > 0 && (
                <CardActionMenu items={userMenuItems(user)} ariaLabel={`Actions — ${user.displayName}`} />
              )}
            </div>
            <h3 className="settings-card-title">{user.displayName}</h3>
            <p className="settings-card-subtitle">@{user.username}</p>
            {user.linkedEmployee ? (
              <p className="settings-card-meta">
                {user.linkedEmployee.nom} · {user.linkedEmployee.matricule} · {user.linkedEmployee.departement}
              </p>
            ) : user.matricule ? (
              <p className="settings-card-meta">Matricule {user.matricule}</p>
            ) : null}
            {user.email && <p className="settings-card-meta">{user.email}</p>}
            <div className="settings-user-card-footer">
              <span className={`settings-badge${user.active ? '' : ' inactive'}`}>
                {user.active ? 'Actif' : 'Inactif'}
              </span>
              <PermissionsProgress percent={permissionPercents[user.id] ?? 0} compact />
            </div>
          </article>
        ))}
      </div>

      {modalOpen && (
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div className="modal modal-form settings-user-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{form.id ? 'Modifier utilisateur' : 'Nouvel utilisateur'}</h3>
              <button type="button" className="modal-close" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="form-group">
                  <label>Identifiant</label>
                  <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Nom affiché</label>
                  <input value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Initiales</label>
                  <input value={form.initials} onChange={(e) => setForm({ ...form, initials: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="form-group form-group-full">
                  <label>Employé lié</label>
                  <EmployeePicker
                    employees={employees}
                    value={linkedEmployeeSelection}
                    onChange={(employee) =>
                      setForm({ ...form, matricule: employee?.matricule ?? '' })
                    }
                  />
                  <p className="form-hint">
                    Le matricule et les informations employé sont enregistrés en JSON dans Params (colonne matricule).
                  </p>
                </div>
                <div className="form-group">
                  <label>{form.id ? 'Nouveau mot de passe (optionnel)' : 'Mot de passe'}</label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label>Statut</label>
                  <select
                    value={form.active ? 'active' : 'inactive'}
                    onChange={(e) => setForm({ ...form, active: e.target.value === 'active' })}
                  >
                    <option value="active">Actif</option>
                    <option value="inactive">Inactif</option>
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

      {resetUser && (
        <ChangePasswordModal
          mode="reset"
          targetUser={{ id: resetUser.id, displayName: resetUser.displayName }}
          onClose={() => setResetUser(null)}
        />
      )}
    </>
  );
}
