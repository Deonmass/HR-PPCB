'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';
import { routeViewMenuIds } from '@/lib/menu-routes';

export default function RouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useI18n();
  const { isLoading, user, can, firstAccessiblePath } = usePermissions();

  useEffect(() => {
    if (isLoading || pathname === '/login' || pathname === '/acces-refuse') return;

    if (!user) {
      const next = `${pathname}${typeof window !== 'undefined' ? window.location.search : ''}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
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
  }, [isLoading, pathname, user, can, firstAccessiblePath, router]);

  if (isLoading) {
    return <div className="loading">{t('common.loading')}</div>;
  }

  if (!user) {
    return <div className="loading">{t('common.redirecting')}</div>;
  }

  const menuIds = routeViewMenuIds(pathname);
  if (menuIds.length > 0 && !menuIds.some((menuId) => can(menuId, 'view'))) {
    return <div className="loading">{t('common.redirecting')}</div>;
  }

  return <>{children}</>;
}
