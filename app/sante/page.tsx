'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function SantePage() {
  return (
    <PermissionGate menuId="sante" action="view">
      <PlaceholderPage title="Santé" description="Suivi médical et dossiers santé employés" />
    </PermissionGate>
  );
}
