'use client';

import { useI18n } from '@/contexts/LocaleContext';

interface Props {
  title: string;
  description?: string;
}

export default function PlaceholderPage({ title, description }: Props) {
  const { t } = useI18n();
  return (
    <>
      <div className="page-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
      </div>
      <div className="panel panel-padded placeholder-panel">
        <p>{t('common.comingSoon')}</p>
      </div>
    </>
  );
}
