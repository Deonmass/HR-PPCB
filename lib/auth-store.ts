import 'server-only';

import { randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import {
  createRole,
  getRolePermissions,
  listRoles,
  readPermissionsFile,
  saveRolePermissions,
} from './permissions-file-store';
import {
  deleteUserFromParams,
  findUserByIdFromParams,
  findUserByUsernameFromParams,
  getUserPermissionsFromParams,
  listUsersFromParams,
  saveUserPermissionsInParams,
  upsertUserInParams,
} from './params-users-store';
import type {
  AuthSession,
  AuthUser,
  MenuPermission,
  PermissionsData,
  RolePermissions,
  SessionUser,
  UserPermissions,
} from './auth-types';

// Vercel mount `/var/task` is read-only. Use a writable dir for session persistence.
// - Local/dev: keep existing `data/auth`.
// - Vercel: default to `/tmp/hr-rh-auth` (override with `AUTH_DATA_DIR` if needed).
const AUTH_DIR = process.env.AUTH_DATA_DIR
  ? path.resolve(process.env.AUTH_DATA_DIR)
  : process.env.VERCEL
    ? path.join('/tmp', 'hr-rh-auth')
    : path.join(process.cwd(), 'data', 'auth');
const SESSIONS_PATH = path.join(AUTH_DIR, 'sessions.json');

import { SESSION_COOKIE_NAME } from './auth-constants';

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface SessionsFile {
  sessions: AuthSession[];
}

function nowIso(): string {
  return new Date().toISOString();
}

async function ensureAuthDir(): Promise<void> {
  await fs.mkdir(AUTH_DIR, { recursive: true });
}

async function readSessionsFile(): Promise<SessionsFile> {
  await ensureAuthDir();
  try {
    const raw = await fs.readFile(SESSIONS_PATH, 'utf8');
    return JSON.parse(raw) as SessionsFile;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== 'ENOENT') throw err;
    return { sessions: [] };
  }
}

async function writeSessionsFile(data: SessionsFile): Promise<void> {
  await ensureAuthDir();
  // Compact JSON: faster than pretty-print on large session payloads.
  await fs.writeFile(SESSIONS_PATH, `${JSON.stringify(data)}\n`, 'utf8');
}

function toSessionUser(user: AuthUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    initials: user.initials,
    email: user.email,
    matricule: user.matricule,
    linkedEmployee: user.linkedEmployee,
  };
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE_NAME;
}

export async function listUsers(): Promise<Omit<AuthUser, 'password'>[]> {
  return listUsersFromParams();
}

export interface AuthenticatedUser {
  user: SessionUser;
  menus: MenuPermission[];
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<AuthenticatedUser | null> {
  const user = await findUserByUsernameFromParams(username);
  if (!user || !user.active) return null;
  if (user.password !== password) return null;
  const menus = await getUserPermissionsFromParams(user.id);
  return { user: toSessionUser(user), menus };
}

export async function createSession(
  user: SessionUser,
  menus: MenuPermission[],
): Promise<AuthSession> {
  const sessionsData = await readSessionsFile();
  const token = randomBytes(32).toString('hex');
  const session: AuthSession = {
    token,
    userId: user.id,
    user,
    menus,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  sessionsData.sessions = sessionsData.sessions.filter((item) => item.userId !== user.id);
  sessionsData.sessions.push(session);
  await writeSessionsFile(sessionsData);
  return session;
}

export async function destroySession(token: string): Promise<void> {
  const sessionsData = await readSessionsFile();
  sessionsData.sessions = sessionsData.sessions.filter((item) => item.token !== token);
  await writeSessionsFile(sessionsData);
}

async function findValidSession(token?: string | null): Promise<AuthSession | null> {
  if (!token?.trim()) return null;
  const sessionsData = await readSessionsFile();
  const session = sessionsData.sessions.find((item) => item.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  if (!session.user || !session.menus) {
    await destroySession(token);
    return null;
  }
  return session;
}

export async function getSessionUser(token?: string | null): Promise<SessionUser | null> {
  const session = await findValidSession(token);
  return session?.user ?? null;
}

export async function getSessionPermissions(token?: string | null): Promise<MenuPermission[] | null> {
  const session = await findValidSession(token);
  return session?.menus ?? null;
}

export async function getSession(token?: string | null): Promise<AuthSession | null> {
  return findValidSession(token);
}

async function refreshSessionsForUser(
  userId: string,
  patch: Partial<Pick<AuthSession, 'user' | 'menus'>>,
): Promise<void> {
  const sessionsData = await readSessionsFile();
  let changed = false;
  for (const session of sessionsData.sessions) {
    if (session.userId !== userId) continue;
    if (patch.user) session.user = patch.user;
    if (patch.menus) session.menus = patch.menus;
    changed = true;
  }
  if (changed) await writeSessionsFile(sessionsData);
}

async function destroySessionsForUser(userId: string): Promise<void> {
  const sessionsData = await readSessionsFile();
  const next = sessionsData.sessions.filter((item) => item.userId !== userId);
  if (next.length === sessionsData.sessions.length) return;
  sessionsData.sessions = next;
  await writeSessionsFile(sessionsData);
}

export async function upsertUser(
  input: Omit<AuthUser, 'createdAt' | 'password'> & { password?: string },
): Promise<Omit<AuthUser, 'password'>> {
  const previousId = input.id?.trim();
  const saved = await upsertUserInParams(input);

  if (previousId && previousId !== saved.id) {
    await destroySessionsForUser(previousId);
  }

  const fullUser = await findUserByIdFromParams(saved.id);
  if (fullUser) {
    await refreshSessionsForUser(saved.id, { user: toSessionUser(fullUser) });
  }

  return saved;
}

export async function deleteUser(userId: string): Promise<boolean> {
  const ok = await deleteUserFromParams(userId);
  if (ok) await destroySessionsForUser(userId);
  return ok;
}

export async function getPermissions(): Promise<PermissionsData> {
  const fileData = await readPermissionsFile();
  const users = await listUsersFromParams();
  const entries: UserPermissions[] = await Promise.all(
    users.map(async (user) => ({
      userId: user.id,
      menus: await getUserPermissionsFromParams(user.id),
    })),
  );
  return { roles: fileData.roles, users: entries };
}

export async function getRolePermissionsById(roleId: string): Promise<MenuPermission[]> {
  return getRolePermissions(roleId);
}

export async function listPermissionRoles(): Promise<RolePermissions[]> {
  return listRoles();
}

export async function saveRolePermissionsData(
  roleId: string,
  menus: MenuPermission[],
): Promise<RolePermissions> {
  return saveRolePermissions(roleId, menus);
}

export async function createPermissionRole(roleName: string): Promise<RolePermissions> {
  return createRole(roleName);
}

export async function applyRoleToUser(roleId: string, userId: string): Promise<UserPermissions> {
  const menus = await getRolePermissions(roleId);
  return saveUserPermissions(userId, menus);
}

export async function getUserPermissions(userId: string): Promise<MenuPermission[]> {
  return getUserPermissionsFromParams(userId);
}

export async function saveUserPermissions(
  userId: string,
  menus: MenuPermission[],
): Promise<UserPermissions> {
  const merged = await saveUserPermissionsInParams(userId, menus);
  await refreshSessionsForUser(userId, { menus: merged });
  return { userId, menus: merged };
}

export async function savePermissions(data: PermissionsData): Promise<PermissionsData> {
  if (data.roles?.length) {
    for (const role of data.roles) {
      await saveRolePermissions(role.roleId, role.menus);
    }
  }
  if (data.users?.length) {
    for (const entry of data.users) {
      await saveUserPermissions(entry.userId, entry.menus);
    }
  }
  return getPermissions();
}

export function createUserId(): string {
  return '';
}
