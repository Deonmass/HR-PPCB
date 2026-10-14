'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import RouteGuard from '@/components/RouteGuard';
import { SidebarProvider } from '@/components/SidebarContext';
import { PermissionProvider } from '@/contexts/PermissionContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LocaleProvider } from '@/contexts/LocaleContext';
import ThemeSwitchOverlay from '@/components/ThemeSwitchOverlay';
import TopProgressBarHost from '@/components/TopProgressBarHost';
import MobileChrome from '@/components/MobileChrome';
import MobileAccountMenu from '@/components/MobileAccountMenu';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <LocaleProvider>
      <ThemeProvider>
        <ThemeSwitchOverlay />
        <TopProgressBarHost />
        <MobileChrome />
        {isLogin ? (
          children
        ) : (
          <PermissionProvider>
            <SidebarProvider>
              <div className={`app${navOpen ? ' nav-open' : ''}`}>
                <Sidebar />
                {navOpen ? (
                  <button
                    type="button"
                    className="nav-backdrop"
                    aria-label="Fermer le menu"
                    onClick={() => setNavOpen(false)}
                  />
                ) : null}
                <main className="main">
                  <div className="mobile-bar">
                    <button
                      type="button"
                      className="mobile-menu-btn"
                      aria-expanded={navOpen}
                      aria-label={navOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
                      onClick={() => setNavOpen((open) => !open)}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                        {navOpen ? (
                          <>
                            <line x1="6" y1="6" x2="18" y2="18" />
                            <line x1="18" y1="6" x2="6" y2="18" />
                          </>
                        ) : (
                          <>
                            <line x1="4" y1="7" x2="20" y2="7" />
                            <line x1="4" y1="12" x2="20" y2="12" />
                            <line x1="4" y1="17" x2="20" y2="17" />
                          </>
                        )}
                      </svg>
                    </button>
                    <span className="mobile-bar-title">PPC RH</span>
                    <div className="mobile-bar-end">
                      <MobileAccountMenu />
                    </div>
                  </div>
                  <RouteGuard>{children}</RouteGuard>
                </main>
              </div>
            </SidebarProvider>
          </PermissionProvider>
        )}
      </ThemeProvider>
    </LocaleProvider>
  );
}
