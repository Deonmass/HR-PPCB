export interface LinkedEmployeeSnapshot {
  matricule: string;
  nom: string;
  departement: string;
  grade: string;
  jobTitle: string;
  localisation: string;
}

export interface AuthUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  initials: string;
  email?: string;
  /** Matricule employé lié (optionnel). */
  matricule?: string;
  /** Snapshot JSON de l'employé lié (colonne matricule Excel). */
  linkedEmployee?: LinkedEmployeeSnapshot;
  active: boolean;
  createdAt: string;
}

export interface SessionUser {
  id: string;
  username: string;
  displayName: string;
  initials: string;
  email?: string;
  /** Matricule employé lié — utilisé pour le timesheet personnel. */
  matricule?: string;
  linkedEmployee?: LinkedEmployeeSnapshot;
}

export interface AuthSession {
  token: string;
  userId: string;
  user: SessionUser;
  menus: MenuPermission[];
  createdAt: string;
  expiresAt: string;
}

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | 'export';

export interface MenuPermission {
  menuId: string;
  label: string;
  actions: Record<PermissionAction, boolean>;
}

export interface RolePermissions {
  roleId: string;
  roleName: string;
  menus: MenuPermission[];
}

export interface UserPermissions {
  userId: string;
  menus: MenuPermission[];
}

export interface PermissionsData {
  roles: RolePermissions[];
  users?: UserPermissions[];
}

export interface DepartmentSetting {
  id: string;
  name: string;
  code?: string;
  active: boolean;
}

export interface CostCenterSetting {
  id: string;
  code: string;
  name: string;
  departmentId?: string;
  active: boolean;
}
