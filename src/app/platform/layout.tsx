import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { PlatformShell } from './_components/PlatformShell';

export const metadata = {
  title: 'NUST Platform Admin',
  description: 'SuperAdmin management dashboard',
};

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user || user.userType !== 'SUPER_ADMIN') {
    redirect('/login');
  }

  return <PlatformShell user={user}>{children}</PlatformShell>;
}
