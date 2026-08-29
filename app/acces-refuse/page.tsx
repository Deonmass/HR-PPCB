'use client';

import Link from 'next/link';
import { usePermissions } from '@/contexts/PermissionContext';
import { useI18n } from '@/contexts/LocaleContext';

export default function AccesRefusePage() {
  const { firstAccessiblePath } = usePermissions();
  const { t } = useI18n();

  return (
    <div className="permissions-empty" style={{ padding: '3rem 1rem' }}>
      <h2>{t('common.accessDenied')}</h2>
      <p>{t('common.accessDeniedText')}</p>
      {firstAccessiblePath ? (
        <Link href={firstAccessiblePath} className="btn btn-primary" style={{ marginTop: '1rem', display: 'inline-block' }}>
          {t('common.backHome')}
        </Link>
      ) : (
        <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>
          {t('common.noAccess')}
        </p>
      )}
    </div>
  );
}
