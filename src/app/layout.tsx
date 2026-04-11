import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
import { PushTokenSync } from '@/components/PushTokenSync';
import { Toaster } from 'sonner';

const geist = localFont({
  src: [{ path: '../../public/fonts/GeistVF.woff2', style: 'normal' }],
  variable: '--font-geist',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NUST Events - University Society & Event Management',
  description: 'Discover amazing events, join societies, and manage everything at NUST',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'NUST Events',
  },
  icons: {
    apple: '/icons/apple-touch-icon.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#00AEEF',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={geist.variable} suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased">
        <ThemeProvider>
          <AuthProvider>
            {children}
            <Toaster
              position="top-center"
              expand={false}
              richColors
              closeButton
              toastOptions={{
                className: 'font-sans text-body-sm',
                duration: 4000,
                style: {
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.08)',
                },
              }}
            />
            <ServiceWorkerRegistrar />
            <PushTokenSync />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
