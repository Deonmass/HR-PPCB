'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function VisaVoyagePage() {
  return (
    <PermissionGate menuId="protocol.visa-voyage" action="view">
      <PlaceholderPage
        title="Visa de voyage"
        description="Gestion des visas de voyage"
      />
    </PermissionGate>
  );
}
