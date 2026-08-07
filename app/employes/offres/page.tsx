'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function OffresPage() {
  return (
    <PermissionGate
      anyOf={[
        { menuId: 'employes.offres', action: 'view' },
        { menuId: 'employes.liste', action: 'view' },
      ]}
    >
      <PlaceholderPage
        title="Offres"
        description="Suivi des offres d’emploi et de recrutement — module en préparation"
      />
    </PermissionGate>
  );
}
