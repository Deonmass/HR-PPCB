'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { routeViewMenuIds } from '@/lib/menu-routes';
import { canPerformAction } from '@/lib/permission-check';
import type { MenuPermission, PermissionAction, SessionUser } from '@/lib/auth-types';

interface PermissionContextValue {
  user: SessionUser | null;
  menus: MenuPermission[];
  isLoading: boolean;
  can: (menuId: string, action: PermissionAction) => boolean;
  canViewPath: (pathname: string) => boolean;
  firstAccessiblePath: string | null;
  refresh: (options?: { silent?: boolean }) => Promise<void>;
}

const PermissionContext = createContext<PermissionContextValue | null>(null);

export function PermissionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [menus, setMenus] = useState<MenuPermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true);
    try {
      const res = await fetch('/api/auth/session');
      if (!res.ok) {
        // Ne pas effacer les droits en refresh silencieux (erreur réseau / 401 transitoire).
        if (!options?.silent) {
          setUser(null);
          setMenus([]);
        }
        return;
      }
      const json = (await res.json()) as { user: SessionUser; menus?: MenuPermission[] };
      setUser(json.user ?? null);
      setMenus(Array.isArray(json.menus) ? json.menus : []);
    } catch {
      if (!options?.silent) {
        setUser(null);
        setMenus([]);
      }
    } finally {
      if (!options?.silent) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Recharge les permissions au retour sur l’onglet (après modification des droits).
  useEffect(() => {
    const onFocus = () => {
      void refresh({ silent: true });
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  const can = useCallback(
    (menuId: string, action: PermissionAction) => canPerformAction(menus, menuId, action),
    [menus],
  );

  const firstAccessiblePath = useMemo(() => {
    const candidates = [
      '/accueil',
      '/rapport',
      '/audit',
      '/employes',
      '/employes/dependants',
      '/employes/offres',
      '/employes/mouvements',
      '/employes/postes',
      '/employes/classification',
      '/employes/contractants',
      '/check-documents',
      '/heures-supplementaires',
      '/project/dashboard',
      '/project/projects',
      '/project/expenses-details',
      '/documents',
      '/documents-voyage/historique',
      '/documents-voyage/etablir',
      '/documents-voyage/attestation-services',
      '/documents-voyage/payment-voucher',
      '/documents/entetes',
      '/documents/contrat-standard',
      '/documents/attestation-conge',
      '/documents/convention-collective',
      '/documents/rrf',
      '/documents/exit',
      '/documents/newcomer',
      '/documents/interim-appraisal',
      '/politique',
      '/politique/longs-etats-de-service',
      '/politique/convention-collective',
      '/politique/heures-supplementaires',
      '/protocol/visa-travail',
      '/protocol/visa-volant',
      '/protocol/visa-voyage',
      '/protocol/billets',
      '/factures-fournisseurs/liste',
      '/factures-fournisseurs/factures',
      '/factures-fournisseurs/soa',
      '/factures-fournisseurs/fournisseurs',
      '/sante',
      '/charroi-automobile/vehicules',
      '/charroi-automobile/achats',
      '/village/maisons',
      '/village/guest-house',
      '/parametres/departements',
      '/parametres/centres-de-cout',
      '/parametres/utilisateurs',
      '/parametres/permissions',
      '/parametres/logs',
    ];
    for (const path of candidates) {
      const menuIds = routeViewMenuIds(path);
      if (menuIds.length === 0) return path;
      if (menuIds.some((menuId) => canPerformAction(menus, menuId, 'view'))) return path;
    }
    return '/accueil';
  }, [menus]);

  const canViewPath = useCallback(
    (pathname: string) => {
      const menuIds = routeViewMenuIds(pathname);
      if (menuIds.length === 0) return true;
      return menuIds.some((menuId) => can(menuId, 'view'));
    },
    [can],
  );

  const value = useMemo(
    () => ({ user, menus, isLoading, can, canViewPath, firstAccessiblePath, refresh }),
    [user, menus, isLoading, can, canViewPath, firstAccessiblePath, refresh],
  );

  return <PermissionContext.Provider value={value}>{children}</PermissionContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionProvider');
  return ctx;
}
