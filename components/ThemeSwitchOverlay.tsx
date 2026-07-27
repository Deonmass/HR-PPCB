'use client';

import { useTheme } from '@/contexts/ThemeContext';

export default function ThemeSwitchOverlay() {
  const { isSwitching } = useTheme();
  if (!isSwitching) return null;

  return (
    <div className="theme-switch-overlay" aria-live="polite" aria-busy="true">
      <div className="theme-switch-overlay-card">
        <span className="theme-switch-spinner" />
        <span className="theme-switch-label">Changement de thème…</span>
      </div>
    </div>
  );
}
