'use client';

import BottomNav from '@/components/BottomNav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-lg mx-auto relative min-h-screen pb-28">
      {children}
      <BottomNav />
    </div>
  );
}
