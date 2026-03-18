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
        {/* Content wrapper - pb-24 ensures nav doesn't overlap content */}
        <div className="mx-auto w-full max-w-2xl lg:max-w-3xl xl:max-w-4xl pb-24 lg:pb-6 lg:px-6">
          <OfflineIndicator />
          <InstallPrompt />
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <BottomNav />
    </div>
  );
}
