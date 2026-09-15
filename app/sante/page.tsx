'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/contexts/PermissionContext';

export default function SanteIndexPage() {
  const router = useRouter();
  const { can, isLoading } = usePermissions();

  useEffect(() => {
    if (isLoading) return;
    const dash = can('sante.dashboard', 'view') || can('sante', 'view');
    const data = can('sante.donnees', 'view') || can('sante', 'view');
    if (dash) router.replace('/sante/dashboard');
    else if (data) router.replace('/sante/donnees');
  }, [can, isLoading, router]);

  return <div className="loading">Redirection…</div>;
}
