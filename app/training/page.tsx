'use client';

import PermissionGate from '@/components/PermissionGate';
import PlaceholderPage from '@/components/PlaceholderPage';
import { useI18n } from '@/contexts/LocaleContext';

export default function TrainingPage() {
  const { t } = useI18n();
  return (
    <PermissionGate menuId="training" action="view">
      <PlaceholderPage title={t('training.title')} description={t('training.description')} />
    </PermissionGate>
  );
}
