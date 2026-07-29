'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function GestionBilletsPage() {
  return (
    <PermissionGate menuId="protocol.billets" action="view">
      <PlaceholderPage
        title="Gestion des Billets"
        description="Suivi et gestion des billets de voyage"
      />
    </PermissionGate>
  );
}
