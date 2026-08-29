'use client';

import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/LocaleContext';

export default function ThemeSwitchOverlay() {
  const { isSwitching } = useTheme();
  const { t } = useI18n();
  if (!isSwitching) return null;

  return (
    <div className="theme-switch-overlay" aria-live="polite" aria-busy="true">
      <div className="theme-switch-overlay-card">
        <span className="theme-switch-spinner" />
        <span className="theme-switch-label">{t('common.themeSwitching')}</span>
      </div>
    </div>
  );
}
