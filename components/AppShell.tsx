'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import RouteGuard from '@/components/RouteGuard';
import { SidebarProvider } from '@/components/SidebarContext';
import { PermissionProvider } from '@/contexts/PermissionContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ThemeSwitchOverlay from '@/components/ThemeSwitchOverlay';
import TopProgressBarHost from '@/components/TopProgressBarHost';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <ThemeProvider>
      <ThemeSwitchOverlay />
      <TopProgressBarHost />
      {isLogin ? (
        children
      ) : (
        <PermissionProvider>
          <SidebarProvider>
            <div className="app">
              <Suspense fallback={<aside className="sidebar" aria-hidden />}>
                <Sidebar />
              </Suspense>
              <main className="main">
                <RouteGuard>{children}</RouteGuard>
              </main>
            </div>
          </SidebarProvider>
        </PermissionProvider>
      )}
    </ThemeProvider>
  );
}
