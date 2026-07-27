'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import PermissionGate from '@/components/PermissionGate';

const EtablirTravelForm = dynamic(() => import('@/components/travel/EtablirTravelForm'), {
  ssr: false,
  loading: () => <div className="loading">Chargement...</div>,
});

export default function EtablirPageClient() {
  return (
    <PermissionGate menuId="travel.etablir" action="view">
      <Suspense fallback={<div className="loading">Chargement...</div>}>
        <EtablirTravelForm />
      </Suspense>
    </PermissionGate>
  );
}
