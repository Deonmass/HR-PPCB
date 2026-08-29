'use client';

import { useI18n } from '@/contexts/LocaleContext';

export default function LanguageToggle({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={`lang-toggle${compact ? ' lang-toggle-compact' : ''}${className ? ` ${className}` : ''}`}
      role="group"
      aria-label={t('common.language')}
    >
      <button
        type="button"
        className={`lang-toggle-btn${locale === 'fr' ? ' active' : ''}`}
        onClick={() => setLocale('fr')}
        aria-pressed={locale === 'fr'}
        title={t('common.languageFr')}
      >
        FR
      </button>
      <button
        type="button"
        className={`lang-toggle-btn${locale === 'en' ? ' active' : ''}`}
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        title={t('common.languageEn')}
      >
        EN
      </button>
    </div>
  );
}
