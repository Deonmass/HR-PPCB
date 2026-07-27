import 'server-only';

import { buildDefaultPermissions, mergePermissionsWithCatalog } from './permissions-catalog';
import {
  cloneRowStyle,
  getSheet,
  getSheetBlock,
  readWorkbook,
  saveWorkbook,
  shiftRowsUp,
  writeRowValues,
  type AoaRow,
} from './excel-io';
import type { AuthUser, LinkedEmployeeSnapshot, MenuPermission } from './auth-types';
import { getEmployee } from './employees-store';
import { getParamsPath, withParamsLock } from './params-workbook';

const USERS_SHEET = 'users';
const DATA_START = 1;
const COL_USERNAME = 0;
const COL_DISPLAY_NAME = 1;
const COL_INITIALS = 2;
const COL_EMAIL = 3;
const COL_PASSWORD = 4;
const COL_STATUS = 5;
const COL_PERMISSIONS = 6;
const COL_MATRICULE = 7;

interface UsersWorkbookState {
  filePath: string;
  wb: Awaited<ReturnType<typeof readWorkbook>>;
  ws: import('xlsx-js-style').WorkSheet;
  dataRows: AoaRow[];
}

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function parseStatus(value: unknown): boolean {
  const status = str(value).toLowerCase();
  if (!status) return true;
  return status === 'actif' || status === 'active' || status === '1' || status === 'true' || status === 'oui';
}

function formatStatus(active: boolean): string {
  return active ? 'Actif' : 'Inactif';
}

function parsePermissionsCell(value: unknown): MenuPermission[] {
  const raw = str(value);
  if (!raw) return buildDefaultPermissions();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return mergePermissionsWithCatalog(parsed as MenuPermission[]);
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      'menus' in parsed &&
      Array.isArray((parsed as { menus: MenuPermission[] }).menus)
    ) {
      return mergePermissionsWithCatalog((parsed as { menus: MenuPermission[] }).menus);
    }
  } catch {
    // ignore invalid JSON
  }
  return buildDefaultPermissions();
}

function serializePermissions(menus: MenuPermission[]): string {
  return JSON.stringify(menus);
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

function parseMatriculeCell(value: unknown): {
  matricule?: string;
  linkedEmployee?: LinkedEmployeeSnapshot;
} {
  const raw = str(value);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && 'matricule' in parsed) {
      const snapshot = parsed as LinkedEmployeeSnapshot;
      return {
        matricule: str(snapshot.matricule),
        linkedEmployee: snapshot,
      };
    }
  } catch {
    // plain matricule string
  }
  return { matricule: raw };
}

function serializeMatriculeCell(snapshot: LinkedEmployeeSnapshot | null): string {
  if (!snapshot?.matricule) return '';
  return JSON.stringify(snapshot);
}

async function resolveMatriculeCell(matriculeInput?: string): Promise<string> {
  const matricule = matriculeInput?.trim();
  if (!matricule) return '';
  const employee = await getEmployee(matricule);
  if (!employee) throw new Error(`Employé introuvable pour le matricule ${matricule}`);
  return serializeMatriculeCell(employeeToSnapshot(employee));
}

function rowToUser(row: AoaRow): AuthUser | null {
  const username = str(row[COL_USERNAME]);
  if (!username) return null;
  const email = str(row[COL_EMAIL]);
  const { matricule, linkedEmployee } = parseMatriculeCell(row[COL_MATRICULE]);
  return {
    id: username,
    username,
    password: str(row[COL_PASSWORD]),
    displayName: str(row[COL_DISPLAY_NAME]) || username,
    initials: str(row[COL_INITIALS]).toUpperCase().slice(0, 3) || 'US',
    email: email && email !== '-' ? email : undefined,
    matricule,
    linkedEmployee,
    active: parseStatus(row[COL_STATUS]),
    createdAt: '',
  };
}

function sanitizeUser(user: AuthUser): Omit<AuthUser, 'password'> {
  const { password: _password, ...safe } = user;
  return safe;
}

async function loadState(): Promise<UsersWorkbookState> {
  const filePath = getParamsPath();
  const wb = await readWorkbook(filePath);
  const ws = getSheet(wb, USERS_SHEET);
  const sheet = getSheetBlock(wb, USERS_SHEET, DATA_START);
  return { filePath, wb, ws, dataRows: sheet.dataRows };
}

function ensureHeader(ws: UsersWorkbookState['ws']): void {
  writeRowValues(ws, 0, [
    'Identifiant',
    'Nom affiché',
    'Initiales',
    'Email',
    'Mot de passe',
    'Statut',
    'permissions',
    'matricule',
  ]);
}

function findRowIndexByUsername(dataRows: AoaRow[], username: string): number {
  const normalized = username.trim().toLowerCase();
  return dataRows.findIndex((row) => str(row[COL_USERNAME]).toLowerCase() === normalized);
}

function findNextEmptyRow(dataRows: AoaRow[]): number {
  const firstEmpty = dataRows.findIndex((row) => !str(row[COL_USERNAME]));
  if (firstEmpty >= 0) return firstEmpty;
  return dataRows.length;
}

function userToRowValues(
  user: AuthUser,
  permissionsJson: string,
  matriculeJson: string,
): (string | number)[] {
  return [
    user.username,
    user.displayName,
    user.initials,
    user.email ?? '-',
    user.password,
    formatStatus(user.active),
    permissionsJson,
    matriculeJson,
  ];
}

export async function listUsersFromParams(): Promise<Omit<AuthUser, 'password'>[]> {
  return withParamsLock(async () => {
    const state = await loadState();
    return state.dataRows
      .map((row) => rowToUser(row))
      .filter((user): user is AuthUser => user !== null)
      .map(sanitizeUser);
  });
}

export async function findUserByUsernameFromParams(username: string): Promise<AuthUser | null> {
  return withParamsLock(async () => {
    const state = await loadState();
    const rowIndex = findRowIndexByUsername(state.dataRows, username);
    if (rowIndex < 0) return null;
    return rowToUser(state.dataRows[rowIndex]);
  });
}

export async function findUserByIdFromParams(userId: string): Promise<AuthUser | null> {
  return findUserByUsernameFromParams(userId);
}

export async function getUserPermissionsFromParams(userId: string): Promise<MenuPermission[]> {
  return withParamsLock(async () => {
    const state = await loadState();
    const rowIndex = findRowIndexByUsername(state.dataRows, userId);
    if (rowIndex < 0) return buildDefaultPermissions();
    return parsePermissionsCell(state.dataRows[rowIndex][COL_PERMISSIONS]);
  });
}

export async function upsertUserInParams(
  input: Omit<AuthUser, 'createdAt' | 'password'> & { password?: string },
): Promise<Omit<AuthUser, 'password'>> {
  return withParamsLock(async () => {
    const state = await loadState();
    ensureHeader(state.ws);

    const username = input.username.trim();
    if (!username) throw new Error('Identifiant requis');

    const displayName = input.displayName.trim() || username;
    const initials = input.initials.trim().toUpperCase().slice(0, 3) || 'US';
    const existingRowIndex = input.id ? findRowIndexByUsername(state.dataRows, input.id) : -1;
    const usernameRowIndex = findRowIndexByUsername(state.dataRows, username);

    if (usernameRowIndex >= 0 && usernameRowIndex !== existingRowIndex) {
      throw new Error('Cet identifiant est déjà utilisé');
    }

    const existingUser =
      existingRowIndex >= 0 ? rowToUser(state.dataRows[existingRowIndex]) : null;
    const password =
      input.password?.trim() || existingUser?.password || '123';

    const permissionsJson =
      existingRowIndex >= 0
        ? str(state.dataRows[existingRowIndex][COL_PERMISSIONS])
        : serializePermissions(buildDefaultPermissions());

    const matriculeJson =
      input.matricule !== undefined
        ? await resolveMatriculeCell(input.matricule)
        : existingRowIndex >= 0
          ? str(state.dataRows[existingRowIndex][COL_MATRICULE])
          : '';

    const resolvedLink = parseMatriculeCell(matriculeJson);

    const user: AuthUser = {
      id: username,
      username,
      password,
      displayName,
      initials,
      email: input.email?.trim() || undefined,
      matricule: resolvedLink.matricule,
      linkedEmployee: resolvedLink.linkedEmployee,
      active: input.active ?? true,
      createdAt: existingUser?.createdAt ?? '',
    };

    if (existingRowIndex >= 0) {
      const excelRow = DATA_START + existingRowIndex;
      writeRowValues(state.ws, excelRow, userToRowValues(user, permissionsJson, matriculeJson));
    } else {
      const targetRowIndex = DATA_START + findNextEmptyRow(state.dataRows);
      const styleSourceRow = targetRowIndex > DATA_START ? targetRowIndex - 1 : DATA_START;
      cloneRowStyle(state.ws, styleSourceRow, targetRowIndex, COL_USERNAME, COL_MATRICULE);
      writeRowValues(
        state.ws,
        targetRowIndex,
        userToRowValues(user, serializePermissions(buildDefaultPermissions()), matriculeJson),
      );
    }

    await saveWorkbook(state.wb, state.filePath);
    return sanitizeUser(user);
  }, { persist: true });
}

export async function deleteUserFromParams(userId: string): Promise<boolean> {
  return withParamsLock(async () => {
    const state = await loadState();
    const rowIndex = findRowIndexByUsername(state.dataRows, userId);
    if (rowIndex < 0) return false;
    shiftRowsUp(state.ws, DATA_START + rowIndex, 1);
    await saveWorkbook(state.wb, state.filePath);
    return true;
  }, { persist: true });
}

export async function saveUserPermissionsInParams(
  userId: string,
  menus: MenuPermission[],
): Promise<MenuPermission[]> {
  return withParamsLock(async () => {
    const state = await loadState();
    const rowIndex = findRowIndexByUsername(state.dataRows, userId);
    if (rowIndex < 0) throw new Error('Utilisateur introuvable');

    const merged = mergePermissionsWithCatalog(menus);
    const excelRow = DATA_START + rowIndex;
    const row = state.dataRows[rowIndex];
    writeRowValues(state.ws, excelRow, [
      str(row[COL_USERNAME]),
      str(row[COL_DISPLAY_NAME]),
      str(row[COL_INITIALS]),
      str(row[COL_EMAIL]) || '-',
      str(row[COL_PASSWORD]),
      str(row[COL_STATUS]) || formatStatus(true),
      serializePermissions(merged),
      str(row[COL_MATRICULE]),
    ]);
    await saveWorkbook(state.wb, state.filePath);
    return merged;
  }, { persist: true });
}
