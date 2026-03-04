'use client';

import BottomNav from '@/components/BottomNav';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { InstallPrompt } from '@/components/InstallPrompt';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-lg mx-auto relative min-h-screen pb-28">
      <OfflineIndicator />
      <InstallPrompt />
      {children}
      <BottomNav />
    </div>
  );
}
