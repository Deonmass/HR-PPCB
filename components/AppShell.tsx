'use client';

import { usePathname } from 'next/navigation';
import Sidebar from '@/components/Sidebar';
import RouteGuard from '@/components/RouteGuard';
import { SidebarProvider } from '@/components/SidebarContext';
import { PermissionProvider } from '@/contexts/PermissionContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import ThemeSwitchOverlay from '@/components/ThemeSwitchOverlay';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  return (
    <ThemeProvider>
      <ThemeSwitchOverlay />
      {isLogin ? (
        children
      ) : (
        <PermissionProvider>
          <SidebarProvider>
            <div className="app">
              <Sidebar />
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
