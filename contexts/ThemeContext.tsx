'use client';

import { createContext, useContext, useEffect, useState } from 'react';

export type AppTheme = 'dark' | 'light';

const STORAGE_KEY = 'app-theme';

interface ThemeContextValue {
  theme: AppTheme;
  toggleTheme: () => void;
  isSwitching: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  toggleTheme: () => {},
  isSwitching: false,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<AppTheme>('dark');
  const [mounted, setMounted] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') setTheme(saved);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme, mounted]);

  const toggleTheme = () => {
    setIsSwitching(true);
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'));
    window.setTimeout(() => setIsSwitching(false), 380);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isSwitching }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
