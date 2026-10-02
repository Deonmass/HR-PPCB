'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';
import { routeViewMenuIds } from '@/lib/menu-routes';
import { contractantMenuVisible, getContractantScopeFromMenus } from '@/lib/contractant-scope';

export default function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { isLoading, user, can, menus, firstAccessiblePath, isContractantOnly } = usePermissions();

  useEffect(() => {
    if (isLoading || pathname === '/login' || pathname === '/acces-refuse') return;

    if (!user) {
      const next = `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    // Accueil RH global → dashboard contractant dédié
    if (isContractantOnly && (pathname === '/accueil' || pathname === '/')) {
      if (firstAccessiblePath) router.replace(firstAccessiblePath);
      return;
    }

    const contractantScope = getContractantScopeFromMenus(menus);
    if (
      pathname.startsWith('/employes/contractants/discipline')
      && !contractantMenuVisible(contractantScope, 'discipline')
    ) {
      router.replace('/employes/contractants');
      return;
    }
    if (
      pathname.startsWith('/employes/contractants/planning')
      && !contractantMenuVisible(contractantScope, 'planning')
    ) {
      router.replace('/employes/contractants');
      return;
    }

    if (isContractantOnly) {
      const allowed =
        pathname === '/employes/contractants'
        || pathname.startsWith('/employes/contractants/');
      if (!allowed && firstAccessiblePath && firstAccessiblePath !== pathname) {
        router.replace(firstAccessiblePath);
      }
      return;
    }

    const menuIds = routeViewMenuIds(pathname);
    if (menuIds.length === 0) return;

    if (!menuIds.some((menuId) => can(menuId, 'view'))) {
      if (firstAccessiblePath && firstAccessiblePath !== pathname) {
        router.replace(firstAccessiblePath);
      } else {
        router.replace('/acces-refuse');
      }
    }
  }, [isLoading, pathname, user, can, menus, firstAccessiblePath, isContractantOnly, router]);

  if (isLoading) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  if (!user) {
    return <div className="loading">{t('common.redirecting')}</div>;
  }

  if (isContractantOnly) {
    if (pathname === '/accueil' || pathname === '/') {
      return <div className="loading">{t('common.redirecting')}</div>;
    }
    const allowed =
      pathname === '/employes/contractants'
      || pathname.startsWith('/employes/contractants/');
    if (!allowed) {
      return <div className="loading">{t('common.redirecting')}</div>;
    }
    return <>{children}</>;
  }

  const menuIds = routeViewMenuIds(pathname);
  if (menuIds.length > 0 && !menuIds.some((menuId) => can(menuId, 'view'))) {
    return <div className="loading">{t('common.redirecting')}</div>;
  }

  return <>{children}</>;
}
