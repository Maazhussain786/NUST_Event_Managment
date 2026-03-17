import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { AuthProvider } from '@/components/AuthProvider';
import { ServiceWorkerRegistrar } from '@/components/ServiceWorkerRegistrar';
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
  themeColor: '#FF9F43',
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
              toastOptions={{
                className: 'font-sans',
                style: {
                  background: 'hsl(var(--card))',
                  color: 'hsl(var(--card-foreground))',
                  border: '1px solid hsl(var(--border))',
                },
              }}
            />
            <ServiceWorkerRegistrar />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
