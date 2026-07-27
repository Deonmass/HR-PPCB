import 'server-only';

import fs from 'fs/promises';
import path from 'path';
import type { MenuPermission, PermissionsData, RolePermissions } from './auth-types';
import { mergePermissionsWithCatalog } from './permissions-catalog';
import { getWritableAuthDir, canPersistProjectFiles } from './runtime-mode';
import fsSync from 'fs';

function resolvePermissionsPath(): string {
  const writable = path.join(getWritableAuthDir(), 'permissions.json');
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'auth', 'permissions.json');
  }
  // Seed from bundled file once on Vercel/tmp.
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

const PERMISSIONS_PATH = resolvePermissionsPath();

function mergeRoleMenus(role: RolePermissions): RolePermissions {
  return {
    ...role,
    menus: mergePermissionsWithCatalog(role.menus),
  };
}

export async function readPermissionsFile(): Promise<PermissionsData> {
  try {
    const raw = await fs.readFile(PERMISSIONS_PATH, 'utf8');
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

export async function writePermissionsFile(data: PermissionsData): Promise<void> {
  await fs.mkdir(path.dirname(PERMISSIONS_PATH), { recursive: true });
  await fs.writeFile(PERMISSIONS_PATH, JSON.stringify(data, null, 2), 'utf8');
}

export async function listRoles(): Promise<RolePermissions[]> {
  const data = await readPermissionsFile();
  return data.roles;
}

export async function getRolePermissions(roleId: string): Promise<MenuPermission[]> {
  const data = await readPermissionsFile();
  const role = data.roles.find((item) => item.roleId === roleId);
  if (!role) return mergePermissionsWithCatalog([]);
  return mergeRoleMenus(role).menus;
}

export async function saveRolePermissions(
  roleId: string,
  menus: MenuPermission[],
): Promise<RolePermissions> {
  const data = await readPermissionsFile();
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
  const data = await readPermissionsFile();
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
