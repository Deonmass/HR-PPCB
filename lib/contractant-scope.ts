import type { ContractantAccessScope, MenuPermission } from './auth-types';
import type { Contractant } from './contractants-types';
import { canPerformAction } from './permission-check';

const CONTRACTANTS_MENU = 'employes.contractants';

export function emptyContractantScope(): ContractantAccessScope {
  return { contractantIds: [] };
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
  return { contractantIds: unique };
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
