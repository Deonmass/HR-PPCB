'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  isAppLocale,
  LOCALE_STORAGE_KEY,
  setRuntimeLocale,
  translate,
  type AppLocale,
  type MessageKey,
} from '@/lib/i18n';

interface LocaleContextValue {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  toggleLocale: () => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'fr',
  setLocale: () => {},
  toggleLocale: () => {},
  t: (key) => translate('fr', key),
});

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>('fr');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (isAppLocale(saved)) setLocaleState(saved);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    setRuntimeLocale(locale);
    document.documentElement.lang = locale;
    if (!mounted) return;
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale, mounted]);

  const setLocale = useCallback((next: AppLocale) => {
    setLocaleState(next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocaleState((current) => (current === 'fr' ? 'en' : 'fr'));
  }, []);

  const t = useCallback(
    (key: MessageKey, vars?: Record<string, string | number>) => translate(locale, key, vars),
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, t }),
    [locale, setLocale, toggleLocale, t],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  return useContext(LocaleContext);
}
