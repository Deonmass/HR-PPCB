import 'server-only';

import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
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
  updateUserPasswordInParams,
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
import { SESSION_COOKIE_NAME } from './auth-constants';
import {
  getWritableAuthDir,
  resolveSessionSecret,
  useStatelessSessions,
} from './runtime-mode';

const AUTH_DIR = getWritableAuthDir();
const SESSIONS_PATH = path.join(AUTH_DIR, 'sessions.json');

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const USE_STATELESS_SESSIONS = useStatelessSessions();

function getSessionSecret(): string {
  return resolveSessionSecret();
}

interface SessionsFile {
  sessions: AuthSession[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function toBase64Url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function fromBase64Url(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

function signSessionPayload(payload: string): string {
  return createHmac('sha256', getSessionSecret()).update(payload).digest('base64url');
}

/** Cookie minimal (< 4 Ko) : uniquement userId + dates. Menus rechargés côté serveur. */
interface StatelessTicket {
  uid: string;
  iat: string;
  exp: string;
}

function encodeStatelessSession(session: AuthSession): string {
  const payload = JSON.stringify({
    uid: session.userId,
    iat: session.createdAt,
    exp: session.expiresAt,
  } satisfies StatelessTicket);
  const encoded = toBase64Url(payload);
  const signature = signSessionPayload(encoded);
  return `${encoded}.${signature}`;
}

function decodeStatelessTicket(token?: string | null): StatelessTicket | null {
  if (!token?.trim()) return null;
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) return null;

  const expected = signSessionPayload(encoded);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(fromBase64Url(encoded)) as Partial<StatelessTicket> & {
      userId?: string;
      user?: unknown;
      menus?: unknown;
    };
    // Anciens cookies « gros » (user+menus) : invalides → forcer une reconnexion.
    if (parsed.user || parsed.menus) return null;
    const uid = parsed.uid || parsed.userId;
    const iat = parsed.iat;
    const exp = parsed.exp;
    if (!uid || !iat || !exp) return null;
    return { uid, iat, exp };
  } catch {
    return null;
  }
}

async function hydrateStatelessSession(token: string): Promise<AuthSession | null> {
  const ticket = decodeStatelessTicket(token);
  if (!ticket) return null;
  if (new Date(ticket.exp).getTime() < Date.now()) return null;

  const fullUser = await findUserByIdFromParams(ticket.uid);
  if (!fullUser || !fullUser.active) return null;

  const menus = await getUserPermissionsFromParams(fullUser.id);
  return {
    token,
    userId: fullUser.id,
    user: toSessionUser(fullUser),
    menus,
    createdAt: ticket.iat,
    expiresAt: ticket.exp,
  };
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
  const baseSession: AuthSession = {
    token: '',
    userId: user.id,
    user,
    menus,
    createdAt: nowIso(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  if (USE_STATELESS_SESSIONS) {
    const token = encodeStatelessSession(baseSession);
    return { ...baseSession, token };
  }

  const sessionsData = await readSessionsFile();
  const token = randomBytes(32).toString('hex');
  const session = { ...baseSession, token };
  sessionsData.sessions = sessionsData.sessions.filter((item) => item.userId !== user.id);
  sessionsData.sessions.push(session);
  await writeSessionsFile(sessionsData);
  return session;
}

export async function destroySession(token: string): Promise<void> {
  if (USE_STATELESS_SESSIONS) return;
  const sessionsData = await readSessionsFile();
  sessionsData.sessions = sessionsData.sessions.filter((item) => item.token !== token);
  await writeSessionsFile(sessionsData);
}

async function findValidSession(token?: string | null): Promise<AuthSession | null> {
  if (!token?.trim()) return null;
  if (USE_STATELESS_SESSIONS) {
    return hydrateStatelessSession(token);
  }
  const sessionsData = await readSessionsFile();
  const session = sessionsData.sessions.find((item) => item.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }
  if (!session.user || !session.userId) {
    await destroySession(token);
    return null;
  }

  // Toujours relire les permissions utilisateur (nouveaux menus actifs sans reconnexion).
  let menus = session.menus ?? [];
  try {
    menus = await getUserPermissionsFromParams(session.userId);
    // Met à jour la session en arrière-plan si l’écart est détecté.
    if (JSON.stringify(menus) !== JSON.stringify(session.menus)) {
      session.menus = menus;
      void writeSessionsFile(sessionsData).catch(() => undefined);
    }
  } catch {
    if (!session.menus?.length) {
      await destroySession(token);
      return null;
    }
    menus = session.menus;
  }

  return { ...session, menus };
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
  if (USE_STATELESS_SESSIONS) return;
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
  if (USE_STATELESS_SESSIONS) return;
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

/** Change le mot de passe de l'utilisateur connecté après vérification de l'ancien. */
export async function changeUserPassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
): Promise<Omit<AuthUser, 'password'>> {
  const user = await findUserByIdFromParams(userId);
  if (!user || !user.active) throw new Error('Utilisateur introuvable');
  if (user.password !== oldPassword) throw new Error('Ancien mot de passe incorrect');
  return updateUserPasswordInParams(userId, newPassword);
}

/** Réinitialise le mot de passe d'un utilisateur (action admin, permission requise). */
export async function resetUserPassword(
  userId: string,
  newPassword: string,
): Promise<Omit<AuthUser, 'password'>> {
  return updateUserPasswordInParams(userId, newPassword);
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
