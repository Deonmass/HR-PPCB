import 'server-only';

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { buildDefaultPermissions, mergePermissionsWithCatalog } from './permissions-catalog';
import type { AuthUser, LinkedEmployeeSnapshot, MenuPermission } from './auth-types';
import { getEmployee } from './employees-json-store';
import {
  DURABLE_USERS_KEY,
  hydrateDurableFile,
  persistDurableFile,
} from './durable-fs';
import { canPersistProjectFiles, getWritableAuthDir, getWritableDataRoot } from './runtime-mode';

interface StoredAuthUser extends AuthUser {
  menus?: MenuPermission[];
}

interface UsersStore {
  users: StoredAuthUser[];
}

function resolveUsersPath(): string {
  if (canPersistProjectFiles()) {
    return path.join(process.cwd(), 'data', 'auth', 'users.json');
  }

  const writable = path.join(getWritableAuthDir(), 'users.json');
  const bundled = path.join(process.cwd(), 'data', 'auth', 'users.json');
  try {
    if (!fs.existsSync(writable) && fs.existsSync(bundled)) {
      fs.mkdirSync(path.dirname(writable), { recursive: true });
      fs.copyFileSync(bundled, writable);
    }
  } catch {
    // ignore seed errors
  }
  // Fallback if auth dir differs from data root layout
  if (!fs.existsSync(path.dirname(writable))) {
    const alt = path.join(getWritableDataRoot(), 'auth', 'users.json');
    return alt;
  }
  return writable;
}

function sanitizeUser(user: AuthUser): Omit<AuthUser, 'password'> {
  const { password: _password, ...safe } = user;
  return safe;
}

function toPublicUser(user: StoredAuthUser): AuthUser {
  const { menus: _menus, ...rest } = user;
  return rest;
}

function employeeToSnapshot(employee: {
  matricule: string;
  nom: string;
  departement: string;
  grade: string;
  jobTitle: string;
  localisation: string;
}): LinkedEmployeeSnapshot {
  return {
    matricule: employee.matricule,
    nom: employee.nom,
    departement: employee.departement,
    grade: employee.grade,
    jobTitle: employee.jobTitle,
    localisation: employee.localisation,
  };
}

async function resolveLinkedEmployee(matriculeInput?: string): Promise<{
  matricule?: string;
  linkedEmployee?: LinkedEmployeeSnapshot;
}> {
  const matricule = matriculeInput?.trim();
  if (!matricule) return {};
  const employee = await getEmployee(matricule);
  if (!employee) throw new Error(`Employé introuvable pour le matricule ${matricule}`);
  return {
    matricule: employee.matricule,
    linkedEmployee: employeeToSnapshot(employee),
  };
}

async function readUsersStore(): Promise<UsersStore> {
  const usersPath = resolveUsersPath();
  await hydrateDurableFile(DURABLE_USERS_KEY, usersPath);
  try {
    const raw = await fsPromises.readFile(usersPath, 'utf8');
    const parsed = JSON.parse(raw) as UsersStore;
    return { users: Array.isArray(parsed.users) ? parsed.users : [] };
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === 'ENOENT') return { users: [] };
    throw err;
  }
}

async function writeUsersStore(store: UsersStore): Promise<void> {
  const usersPath = resolveUsersPath();
  await fsPromises.mkdir(path.dirname(usersPath), { recursive: true });
  await fsPromises.writeFile(usersPath, JSON.stringify(store, null, 2), 'utf8');
  await persistDurableFile(DURABLE_USERS_KEY, usersPath);
}

function findUserIndex(users: StoredAuthUser[], usernameOrId: string): number {
  const normalized = usernameOrId.trim().toLowerCase();
  return users.findIndex(
    (user) =>
      user.id.trim().toLowerCase() === normalized
      || user.username.trim().toLowerCase() === normalized,
  );
}

export async function listUsersFromParams(): Promise<Omit<AuthUser, 'password'>[]> {
  const store = await readUsersStore();
  return store.users.map((user) => sanitizeUser(toPublicUser(user)));
}

export async function findUserByUsernameFromParams(username: string): Promise<AuthUser | null> {
  const store = await readUsersStore();
  const index = findUserIndex(store.users, username);
  if (index < 0) return null;
  return toPublicUser(store.users[index]);
}

export async function findUserByIdFromParams(userId: string): Promise<AuthUser | null> {
  return findUserByUsernameFromParams(userId);
}

export async function getUserPermissionsFromParams(userId: string): Promise<MenuPermission[]> {
  const store = await readUsersStore();
  const index = findUserIndex(store.users, userId);
  if (index < 0) return buildDefaultPermissions();
  const menus = store.users[index].menus;
  if (!menus?.length) return buildDefaultPermissions();
  return mergePermissionsWithCatalog(menus);
}

export async function upsertUserInParams(
  input: Omit<AuthUser, 'createdAt' | 'password'> & { password?: string },
): Promise<Omit<AuthUser, 'password'>> {
  const store = await readUsersStore();
  const username = input.username.trim();
  if (!username) throw new Error('Identifiant requis');

  const displayName = input.displayName.trim() || username;
  const initials = input.initials.trim().toUpperCase().slice(0, 3) || 'US';
  const existingIndex = input.id ? findUserIndex(store.users, input.id) : -1;
  const usernameIndex = findUserIndex(store.users, username);

  if (usernameIndex >= 0 && usernameIndex !== existingIndex) {
    throw new Error('Cet identifiant est déjà utilisé');
  }

  const existing = existingIndex >= 0 ? store.users[existingIndex] : null;
  const password = input.password?.trim() || existing?.password || '123';

  const linked =
    input.matricule !== undefined
      ? await resolveLinkedEmployee(input.matricule)
      : {
          matricule: existing?.matricule,
          linkedEmployee: existing?.linkedEmployee,
        };

  const user: StoredAuthUser = {
    id: username,
    username,
    password,
    displayName,
    initials,
    email: input.email?.trim() || undefined,
    matricule: linked.matricule,
    linkedEmployee: linked.linkedEmployee,
    active: input.active ?? true,
    createdAt: existing?.createdAt || new Date().toISOString(),
    menus: existing?.menus ?? buildDefaultPermissions(),
  };

  if (existingIndex >= 0) store.users[existingIndex] = user;
  else store.users.push(user);

  await writeUsersStore(store);
  return sanitizeUser(toPublicUser(user));
}

export async function updateUserPasswordInParams(
  userId: string,
  newPassword: string,
): Promise<Omit<AuthUser, 'password'>> {
  const password = newPassword.trim();
  if (!password) throw new Error('Nouveau mot de passe requis');
  const store = await readUsersStore();
  const index = findUserIndex(store.users, userId);
  if (index < 0) throw new Error('Utilisateur introuvable');
  store.users[index] = { ...store.users[index], password };
  await writeUsersStore(store);
  return sanitizeUser(toPublicUser(store.users[index]));
}

export async function deleteUserFromParams(userId: string): Promise<boolean> {
  const store = await readUsersStore();
  const next = store.users.filter(
    (user) =>
      user.id.trim().toLowerCase() !== userId.trim().toLowerCase()
      && user.username.trim().toLowerCase() !== userId.trim().toLowerCase(),
  );
  if (next.length === store.users.length) return false;
  await writeUsersStore({ users: next });
  return true;
}

export async function saveUserPermissionsInParams(
  userId: string,
  menus: MenuPermission[],
): Promise<MenuPermission[]> {
  const store = await readUsersStore();
  const index = findUserIndex(store.users, userId);
  if (index < 0) throw new Error('Utilisateur introuvable');

  const merged = mergePermissionsWithCatalog(menus);
  store.users[index] = { ...store.users[index], menus: merged };
  await writeUsersStore(store);
  return merged;
}
