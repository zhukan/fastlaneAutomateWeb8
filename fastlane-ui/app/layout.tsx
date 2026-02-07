import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import { AuthGuard } from '@/components/auth-guard';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Fastlane UI 8',
  description: 'iOS 应用发布管理界面',
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <Providers>
          <AuthGuard>{children}</AuthGuard>
        </Providers>
        <Toaster position="top-right" richColors />
      </body>
    </html>
  );
}
