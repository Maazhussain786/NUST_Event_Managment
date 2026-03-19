'use client';

import BottomNav from '@/components/BottomNav';
import DesktopSidebar from '@/components/DesktopSidebar';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { InstallPrompt } from '@/components/InstallPrompt';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Desktop sidebar - fixed left */}
      <DesktopSidebar />

      {/* Main content area */}
      <main className="lg:pl-sidebar">
        {/* Content wrapper with notch-safe top space and bottom-nav clearance */}
        <div className="app-shell">
          <OfflineIndicator />
          <InstallPrompt />
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation - now floating */}
      <BottomNav />
    </div>
  );
}
