import type { ContractantAccessScope, ContractantPortalMenus, MenuPermission } from './auth-types';
import type { Contractant } from './contractants-types';
import { canPerformAction } from './permission-check';

const CONTRACTANTS_MENU = 'employes.contractants';

export function emptyContractantScope(): ContractantAccessScope {
  return { contractantIds: [] };
}

export const CONTRACTANT_PORTAL_MENUS = [
  { id: 'dashboard', label: 'Accueil' },
  { id: 'employes', label: 'Liste des employés' },
  { id: 'exit', label: 'Exit' },
  { id: 'discipline', label: 'Cas disciplinaire' },
  { id: 'planning', label: 'Planning de travail' },
] as const;

export type ContractantPortalMenuId = (typeof CONTRACTANT_PORTAL_MENUS)[number]['id'];

export function normalizeContractantMenus(
  raw?: ContractantPortalMenus | null,
): ContractantPortalMenus | undefined {
  if (!raw) return undefined;
  const menus: ContractantPortalMenus = {};
  let explicit = false;
  for (const item of CONTRACTANT_PORTAL_MENUS) {
    if (typeof raw[item.id] === 'boolean') {
      menus[item.id] = raw[item.id];
      explicit = true;
    }
  }
  return explicit ? menus : undefined;
}

/** Absent ou true → menu affiché. false → masqué. */
export function contractantMenuVisible(
  scope: ContractantAccessScope | null | undefined,
  id: ContractantPortalMenuId,
): boolean {
  return scope?.menus?.[id] !== false;
}

export function normalizeContractantScope(
  raw?: Partial<ContractantAccessScope> | null,
): ContractantAccessScope {
  const unique = Array.from(
    new Set(
      (Array.isArray(raw?.contractantIds) ? raw.contractantIds : [])
        .map((value) => String(value ?? '').trim())
        .filter(Boolean),
    ),
  );
  const menus = normalizeContractantMenus(raw?.menus);
  return menus ? { contractantIds: unique, menus } : { contractantIds: unique };
}

/** true si au moins un contractant est explicitement coché. */
export function hasExplicitContractantScope(scope?: ContractantAccessScope | null): boolean {
  return Boolean(scope?.contractantIds?.length);
}

export function getContractantScopeFromMenus(
  menus: MenuPermission[] | null | undefined,
): ContractantAccessScope {
  const menu = menus?.find((item) => item.menuId === CONTRACTANTS_MENU);
  return normalizeContractantScope(menu?.contractantScope);
}

/**
 * Utilisateur limité aux contractants cochés (ex. EKMM) :
 * périmètre explicite + aucun autre menu avec droits hors Contractants.
 */
export function isContractantOnlyUser(menus: MenuPermission[] | null | undefined): boolean {
  if (!menus?.length) return false;
  const scope = getContractantScopeFromMenus(menus);
  if (!hasExplicitContractantScope(scope)) return false;
  if (!canPerformAction(menus, CONTRACTANTS_MENU, 'view')) return false;

  const otherGranted = menus.some(
    (menu) =>
      menu.menuId !== CONTRACTANTS_MENU
      && Object.values(menu.actions).some(Boolean),
  );
  return !otherGranted;
}

/**
 * Filtre la liste. Sans périmètre explicite → tous les contractants visibles
 * (comportement admin / droit générique).
 */
export function filterContractantsByScope<T extends Pick<Contractant, 'id'>>(
  contractants: T[],
  scope?: ContractantAccessScope | null,
): T[] {
  if (!hasExplicitContractantScope(scope)) return contractants;
  const allowed = new Set(scope!.contractantIds);
  return contractants.filter((item) => allowed.has(item.id));
}

export function canAccessContractantId(
  contractantId: string,
  scope?: ContractantAccessScope | null,
): boolean {
  if (!hasExplicitContractantScope(scope)) return true;
  return scope!.contractantIds.includes(contractantId);
}

export const CONTRACTANT_HOME_PATH = '/employes/contractants';
