'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';

export default function CharroiAutomobilePage() {
  return (
    <PermissionGate menuId="charroi" action="view">
      <PlaceholderPage title="Charroi automobile" description="Gestion du parc automobile" />
    </PermissionGate>
  );
}
