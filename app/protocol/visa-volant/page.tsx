'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function VisaVolantPage() {
  return (
    <PermissionGate menuId="protocol.visa-volant" action="view">
      <PlaceholderPage
        title="Visa volant"
        description="Gestion des visas volants"
      />
    </PermissionGate>
  );
}
