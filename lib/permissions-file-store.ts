import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import type { MenuPermission, PermissionsData, RolePermissions } from './auth-types';
import { mergePermissionsWithCatalog } from './permissions-catalog';
import {
  DURABLE_PERMISSIONS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { getWritableAuthDir, canPersistProjectFiles } from './runtime-mode';
import fsSync from 'fs';

function resolvePermissionsPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'auth', 'permissions.json');
  }

  const writable = path.join(getWritableAuthDir(), 'permissions.json');
  const bundled = path.join(process.cwd(), 'data', 'auth', 'permissions.json');
  try {
    if (!fsSync.existsSync(writable) && fsSync.existsSync(bundled)) {
      fsSync.mkdirSync(path.dirname(writable), { recursive: true });
      fsSync.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  return writable;
}

function mergeRoleMenus(role: RolePermissions): RolePermissions {
  return {
    ...role,
    menus: mergePermissionsWithCatalog(role.menus),
  };
}

async function readPermissionsFileInternal(): Promise<PermissionsData> {
  const permissionsPath = resolvePermissionsPath();
  await hydrateDurableFile(DURABLE_PERMISSIONS_KEY, permissionsPath);

  try {
    const raw = await fs.readFile(permissionsPath, 'utf8');
    const parsed = JSON.parse(raw) as PermissionsData;
    return {
      roles: (parsed.roles ?? []).map(mergeRoleMenus),
      users: parsed.users ?? [],
    };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { roles: [], users: [] };
    throw err;
  }
}

export async function readPermissionsFile(): Promise<PermissionsData> {
  return readPermissionsFileInternal();
}

async function writePermissionsFile(data: PermissionsData): Promise<void> {
  const permissionsPath = resolvePermissionsPath();
  await fs.mkdir(path.dirname(permissionsPath), { recursive: true });
  await fs.writeFile(permissionsPath, JSON.stringify(data, null, 2), 'utf8');
  await persistDurableFile(DURABLE_PERMISSIONS_KEY, permissionsPath);
}

export async function listRoles(): Promise<RolePermissions[]> {
  const data = await readPermissionsFileInternal();
  return data.roles;
}

export async function getRolePermissions(roleId: string): Promise<MenuPermission[]> {
  const data = await readPermissionsFileInternal();
  const role = data.roles.find((item) => item.roleId === roleId);
  if (!role) return mergePermissionsWithCatalog([]);
  return mergeRoleMenus(role).menus;
}

export async function saveRolePermissions(
  roleId: string,
  menus: MenuPermission[],
): Promise<RolePermissions> {
  const data = await readPermissionsFileInternal();
  const mergedMenus = mergePermissionsWithCatalog(menus);
  const existingIndex = data.roles.findIndex((item) => item.roleId === roleId);
  const existing = existingIndex >= 0 ? data.roles[existingIndex] : null;

  const saved: RolePermissions = {
    roleId,
    roleName: existing?.roleName ?? roleId,
    menus: mergedMenus,
  };

  if (existingIndex >= 0) data.roles[existingIndex] = saved;
  else data.roles.push(saved);

  await writePermissionsFile(data);
  return saved;
}

export async function createRole(roleName: string): Promise<RolePermissions> {
  const data = await readPermissionsFileInternal();
  const baseId = roleName
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let roleId = baseId || 'role';
  let suffix = 1;
  while (data.roles.some((role) => role.roleId === roleId)) {
    roleId = `${baseId || 'role'}-${suffix}`;
    suffix += 1;
  }

  const role: RolePermissions = {
    roleId,
    roleName: roleName.trim() || roleId,
    menus: mergePermissionsWithCatalog([]),
  };
  data.roles.push(role);
  await writePermissionsFile(data);
  return role;
}
