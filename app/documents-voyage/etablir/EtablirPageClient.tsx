'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const EtablirTravelForm = dynamic(() => import('@/components/travel/EtablirTravelForm'), {
  ssr: false,
  loading: () => <div className="loading">Chargement...</div>,
});

export default function EtablirPageClient() {
  return (
    <Suspense fallback={<div className="loading">Chargement...</div>}>
      <EtablirTravelForm />
    </Suspense>
  );
}
