'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function VillageClubHousePage() {
  return (
    <PermissionGate menuId="village.club-house" action="view">
      <PlaceholderPage
        title="Club house"
        description="Gestion du club house du village"
      />
    </PermissionGate>
  );
}
