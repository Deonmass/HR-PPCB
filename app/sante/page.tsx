'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';
import { useI18n } from '@/contexts/LocaleContext';

export default function SantePage() {
  const { t } = useI18n();
  return (
    <PermissionGate menuId="sante" action="view">
      <PlaceholderPage title={t('nav.health')} description="Suivi médical et dossiers santé employés" />
    </PermissionGate>
  );
}
