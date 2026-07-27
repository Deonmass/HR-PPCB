'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function VillageGuestHousePage() {
  return (
    <PermissionGate menuId="village.guest-house" action="view">
      <PlaceholderPage
        title="Guest house"
        description="Gestion de la guest house du village"
      />
    </PermissionGate>
  );
}
