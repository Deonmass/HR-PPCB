'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import RefreshButton from '@/components/RefreshButton';
import PermissionGate from '@/components/PermissionGate';
import {
  PERMISSION_ACTIONS,
  PERMISSION_MENU_CATALOG,
  computePermissionsStats,
  groupPermissionsByCatalog,
  isMenuFullyChecked,
  isMenuPartiallyChecked,
  setAllMenuActions,
} from '@/lib/permissions-catalog';
import PermissionsProgress from '@/components/PermissionsProgress';
import { usePermissions } from '@/contexts/PermissionContext';
import { showError, showSuccess } from '@/lib/swal';
import type { AuthUser, MenuPermission, PermissionAction, RolePermissions } from '@/lib/auth-types';

type SafeUser = Omit<AuthUser, 'password'>;
type SideMode = 'roles' | 'users';

function PermissionsContent() {
  const searchParams = useSearchParams();
  const { can } = usePermissions();
  const canEdit = can('settings.permissions', 'edit');
  const [sideMode, setSideMode] = useState<SideMode>('users');
  const [users, setUsers] = useState<SafeUser[]>([]);
  const [roles, setRoles] = useState<RolePermissions[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [menus, setMenus] = useState<MenuPermission[] | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingPermissions, setLoadingPermissions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(PERMISSION_MENU_CATALOG[0]?.id ?? '');
  const [newRoleName, setNewRoleName] = useState('');

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    const res = await fetch('/api/auth/users');
    const data = (await res.json()) as SafeUser[];
    const list = Array.isArray(data) ? data : [];
    setUsers(list);
    setSelectedUserId((prev) => prev ?? list[0]?.id ?? null);
    setLoadingUsers(false);
  }, []);

  const loadRoles = useCallback(async () => {
    const res = await fetch('/api/auth/permissions');
    if (!res.ok) return;
    const json = (await res.json()) as { roles?: RolePermissions[] };
    const nextRoles = json.roles ?? [];
    setRoles(nextRoles);
    setSelectedRoleId((prev) => prev ?? nextRoles[0]?.roleId ?? null);
  }, []);

  const loadUserPermissions = useCallback(async (userId: string) => {
    setLoadingPermissions(true);
    const res = await fetch(`/api/auth/permissions?userId=${encodeURIComponent(userId)}`);
    const json = await res.json();
    setMenus(json.menus ?? []);
    setLoadingPermissions(false);
  }, []);

  const loadRolePermissions = useCallback(async (roleId: string) => {
    setLoadingPermissions(true);
    const res = await fetch(`/api/auth/permissions?roleId=${encodeURIComponent(roleId)}`);
    const json = await res.json();
    setMenus(json.menus ?? []);
    setLoadingPermissions(false);
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadRoles();
  }, [loadUsers, loadRoles]);

  useEffect(() => {
    const fromUrl = searchParams.get('userId')?.trim();
    if (fromUrl) {
      setSideMode('users');
      setSelectedUserId(fromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    if (sideMode === 'users' && selectedUserId) void loadUserPermissions(selectedUserId);
    else if (sideMode === 'roles' && selectedRoleId) void loadRolePermissions(selectedRoleId);
    else setMenus(null);
  }, [sideMode, selectedUserId, selectedRoleId, loadUserPermissions, loadRolePermissions]);

  const selectedUser = users.find((user) => user.id === selectedUserId);
  const selectedRole = roles.find((role) => role.roleId === selectedRoleId);
  const grouped = useMemo(
    () => (menus ? groupPermissionsByCatalog(menus) : []),
    [menus],
  );
  const activeGroup = grouped.find((group) => group.id === activeTab) ?? grouped[0];

  const permissionStats = useMemo(
    () => (menus ? computePermissionsStats(menus) : { checked: 0, total: 0, percent: 0 }),
    [menus],
  );

  const updatePermission = (menuId: string, action: PermissionAction, value: boolean) => {
    if (!menus || !canEdit) return;
    setMenus(
      menus.map((menu) =>
        menu.menuId === menuId
          ? { ...menu, actions: { ...menu.actions, [action]: value } }
          : menu,
      ),
    );
  };

  const setAllMenuPermissions = (menuId: string, value: boolean) => {
    if (!menus || !canEdit) return;
    setMenus(
      menus.map((menu) =>
        menu.menuId === menuId ? setAllMenuActions(menu, value) : menu,
      ),
    );
  };

  const handleSave = async () => {
    if (!menus || !canEdit) return;
    setSaving(true);
    try {
      const body =
        sideMode === 'roles' && selectedRoleId
          ? { roleId: selectedRoleId, menus }
          : sideMode === 'users' && selectedUserId
            ? { userId: selectedUserId, menus }
            : null;
      if (!body) return;

      const res = await fetch('/api/auth/permissions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Erreur');
        return;
      }
      if (json.menus) setMenus(json.menus);
      await showSuccess('Permissions enregistrées');
      if (sideMode === 'roles') await loadRoles();
    } finally {
      setSaving(false);
    }
  };

  const handleCreateRole = async () => {
    if (!newRoleName.trim() || !canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/auth/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'createRole', roleName: newRoleName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Erreur');
        return;
      }
      setNewRoleName('');
      await loadRoles();
      setSelectedRoleId(json.roleId);
      setSideMode('roles');
      await showSuccess('Rôle créé');
    } finally {
      setSaving(false);
    }
  };

  const handleApplyRole = async (roleId: string) => {
    if (!selectedUserId || !canEdit) return;
    setSaving(true);
    try {
      const res = await fetch('/api/auth/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'applyRole', roleId, userId: selectedUserId }),
      });
      const json = await res.json();
      if (!res.ok) {
        await showError(json.error || 'Erreur');
        return;
      }
      setMenus(json.menus ?? []);
      await showSuccess('Rôle appliqué à l’utilisateur');
    } finally {
      setSaving(false);
    }
  };

  if (loadingUsers) return <div className="loading">Chargement...</div>;

  const selectionTitle =
    sideMode === 'roles'
      ? selectedRole
        ? `Rôle — ${selectedRole.roleName}`
        : 'Sélectionnez un rôle'
      : selectedUser
        ? `Permissions — ${selectedUser.displayName}`
        : 'Sélectionnez un utilisateur';

  return (
    <PermissionGate menuId="settings.permissions" action="view">
    <>
      <div className="page-header">
        <div>
          <div className="page-header-title-row">
            <h2>Permissions</h2>
            <RefreshButton
              onClick={() => {
                void loadUsers();
                void loadRoles();
                if (sideMode === 'users' && selectedUserId) void loadUserPermissions(selectedUserId);
                if (sideMode === 'roles' && selectedRoleId) void loadRolePermissions(selectedRoleId);
              }}
              loading={false}
            />
          </div>
          <p>Gestion des droits par utilisateur et par rôle</p>
        </div>
        {(selectedUser || selectedRole) && menus && canEdit ? (
          <button type="button" className="btn btn-accent" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        ) : null}
      </div>

      <div className="permissions-layout">
        <aside className="permissions-users-panel panel">
          <div className="permissions-side-tabs">
            <button
              type="button"
              className={`permissions-side-tab${sideMode === 'users' ? ' active' : ''}`}
              onClick={() => setSideMode('users')}
            >
              Utilisateurs
            </button>
            <button
              type="button"
              className={`permissions-side-tab${sideMode === 'roles' ? ' active' : ''}`}
              onClick={() => setSideMode('roles')}
            >
              Rôles
            </button>
          </div>

          {sideMode === 'users' ? (
            <>
              <h3 className="permissions-side-title">Utilisateurs</h3>
              <ul className="permissions-user-list">
                {users.map((user) => (
                  <li key={user.id}>
                    <button
                      type="button"
                      className={`permissions-user-item${selectedUserId === user.id ? ' active' : ''}`}
                      onClick={() => setSelectedUserId(user.id)}
                    >
                      <span className="permissions-user-avatar">{user.initials}</span>
                      <span className="permissions-user-info">
                        <span className="permissions-user-name">{user.displayName}</span>
                        <span className="permissions-user-login">@{user.username}</span>
                      </span>
                      <span className={`settings-status-dot${user.active ? ' active' : ''}`} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <>
              <h3 className="permissions-side-title">Rôles</h3>
              <ul className="permissions-user-list">
                {roles.map((role) => (
                  <li key={role.roleId}>
                    <button
                      type="button"
                      className={`permissions-user-item${selectedRoleId === role.roleId ? ' active' : ''}`}
                      onClick={() => setSelectedRoleId(role.roleId)}
                    >
                      <span className="permissions-user-avatar permissions-role-avatar">R</span>
                      <span className="permissions-user-info">
                        <span className="permissions-user-name">{role.roleName}</span>
                        <span className="permissions-user-login">{role.roleId}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {canEdit ? (
                <div className="permissions-create-role">
                  <input
                    type="text"
                    value={newRoleName}
                    placeholder="Nouveau rôle…"
                    onChange={(e) => setNewRoleName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCreateRole();
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => void handleCreateRole()}
                    disabled={saving}
                  >
                    Ajouter
                  </button>
                </div>
              ) : null}
            </>
          )}
        </aside>

        <section className="permissions-matrix-panel panel">
          {(sideMode === 'users' && !selectedUser) || (sideMode === 'roles' && !selectedRole) ? (
            <div className="permissions-empty">
              <p>
                {sideMode === 'roles'
                  ? 'Sélectionnez un rôle pour afficher et modifier ses permissions.'
                  : 'Sélectionnez un utilisateur pour afficher et modifier ses permissions.'}
              </p>
            </div>
          ) : loadingPermissions || !menus ? (
            <div className="loading">Chargement des permissions…</div>
          ) : (
            <>
              <div className="permissions-matrix-header">
                <div>
                  <h3>{selectionTitle}</h3>
                  {sideMode === 'users' && selectedUser ? (
                    <p className="permissions-matrix-subtitle">@{selectedUser.username}</p>
                  ) : null}
                </div>
                <div className="permissions-matrix-header-meta">
                  {sideMode === 'users' && selectedUser ? (
                    <span className={`settings-badge${selectedUser.active ? '' : ' inactive'}`}>
                      {selectedUser.active ? 'Actif' : 'Inactif'}
                    </span>
                  ) : null}
                  <PermissionsProgress percent={permissionStats.percent} />
                  {sideMode === 'users' && canEdit && roles.length > 0 ? (
                    <label className="permissions-apply-role">
                      <span>Appliquer rôle</span>
                      <select
                        defaultValue=""
                        disabled={saving}
                        onChange={(e) => {
                          const roleId = e.target.value;
                          if (roleId) void handleApplyRole(roleId);
                          e.currentTarget.value = '';
                        }}
                      >
                        <option value="">Choisir…</option>
                        {roles.map((role) => (
                          <option key={role.roleId} value={role.roleId}>
                            {role.roleName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                </div>
              </div>

              <div className="tabs header-tabs permissions-tabs">
                {grouped.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`tab-btn permissions-main-tab${activeTab === group.id ? ' active' : ''}`}
                    onClick={() => setActiveTab(group.id)}
                  >
                    {group.label}
                  </button>
                ))}
              </div>

              {activeGroup && (
                <div className="permissions-menu-list">
                  {(() => {
                    const showUndoCol = activeGroup.id === 'parametres';
                    const stdActions = PERMISSION_ACTIONS.filter((a) => a.id !== 'undo');
                    const gridClass = `permissions-actions-grid permissions-actions-grid-aligned permissions-matrix-cols${showUndoCol ? ' has-undo-col' : ''}${canEdit ? ' has-select-all' : ''}`;
                    const headerClass = `permissions-actions-header permissions-matrix-cols${showUndoCol ? ' has-undo-col' : ''}${canEdit ? ' has-select-all' : ''}`;
                    return (
                      <>
                        <div className={headerClass}>
                          <span className="permissions-actions-header-label">Menu</span>
                          {stdActions.map((action) => (
                            <span key={action.id} className="permissions-actions-header-cell">
                              {action.label}
                            </span>
                          ))}
                          {showUndoCol && (
                            <span className="permissions-actions-header-cell permissions-undo-col">Annuler action</span>
                          )}
                          {canEdit && <span className="permissions-actions-header-cell">Tout</span>}
                        </div>

                        {activeGroup.items.map((menu) => {
                          const allChecked = isMenuFullyChecked(menu);
                          const partiallyChecked = isMenuPartiallyChecked(menu);
                          const supportsUndo = menu.menuId === 'parametres.logs';
                          return (
                            <div key={menu.menuId} className={gridClass}>
                              <span className="permissions-row-label" title={menu.label}>
                                {shortMenuLabel(menu.label)}
                              </span>
                              {stdActions.map((action) => (
                                <label key={`${menu.menuId}-${action.id}`} className="permissions-action-item">
                                  <input
                                    type="checkbox"
                                    checked={menu.actions[action.id]}
                                    disabled={!canEdit}
                                    aria-label={`${menu.label} — ${action.label}`}
                                    onChange={(e) => updatePermission(menu.menuId, action.id, e.target.checked)}
                                  />
                                  <span className="permissions-action-label-mobile">{action.label}</span>
                                </label>
                              ))}
                              {showUndoCol && (
                                <label
                                  className={`permissions-action-item permissions-undo-col${!supportsUndo ? ' permissions-undo-na' : ''}`}
                                  title={supportsUndo ? 'Annuler l\'action' : 'Non applicable pour ce menu'}
                                >
                                  <input
                                    type="checkbox"
                                    checked={supportsUndo ? menu.actions.undo : false}
                                    disabled={!canEdit || !supportsUndo}
                                    aria-label={`${menu.label} — Annuler action`}
                                    onChange={(e) =>
                                      supportsUndo && updatePermission(menu.menuId, 'undo', e.target.checked)
                                    }
                                  />
                                </label>
                              )}
                              {canEdit && (
                                <label
                                  className="permissions-action-item permissions-row-select-all"
                                  title={`Tout cocher / décocher — ${menu.label}`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={allChecked}
                                    aria-label={`Tout cocher / décocher — ${menu.label}`}
                                    ref={(input) => {
                                      if (input) input.indeterminate = partiallyChecked && !allChecked;
                                    }}
                                    onChange={(e) => setAllMenuPermissions(menu.menuId, e.target.checked)}
                                  />
                                </label>
                              )}
                            </div>
                          );
                        })}
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </>
    </PermissionGate>
  );
}

function shortMenuLabel(label: string): string {
  return label
    .replace(/^Factures fournisseur —\s*/i, '')
    .replace(/^Voyage —\s*/i, '')
    .replace(/^Heures sup\. —\s*/i, 'HS — ');
}

export default function PermissionsPage() {
  return (
    <Suspense fallback={<div className="loading">Chargement...</div>}>
      <PermissionsContent />
    </Suspense>
  );
}
