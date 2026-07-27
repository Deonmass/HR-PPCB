'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '@/contexts/PermissionContext';
import type { PermissionAction } from '@/lib/auth-types';

interface PermissionGateProps {
  menuId?: string;
  action?: PermissionAction;
  anyOf?: { menuId: string; action: PermissionAction }[];
  children: ReactNode;
  fallback?: ReactNode;
}

export default function PermissionGate({
  menuId,
  action = 'view',
  anyOf,
  children,
  fallback = null,
}: PermissionGateProps) {
  const { can, isLoading } = usePermissions();
  if (isLoading) return null;

  const allowed = anyOf?.length
    ? anyOf.some((entry) => can(entry.menuId, entry.action))
    : menuId
      ? can(menuId, action)
      : false;

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
