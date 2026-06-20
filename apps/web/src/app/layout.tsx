import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { ClerkProvider } from '@clerk/nextjs';
import { appBodyStyle } from '@/components/app/chrome';
import { AppThemeProvider } from '@/components/app/theme-provider';
import { THEME_INIT_SCRIPT } from '@/components/app/theme';
import { getAppBranding, getBrandingCss } from '@/server/branding';
import './globals.css';

export function generateMetadata(): Metadata {
  const branding = getAppBranding();

  return {
    title: branding.title,
    description: branding.description,
    icons: branding.faviconUrl ? { icon: branding.faviconUrl } : undefined,
  };
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const branding = getAppBranding();
  const brandingCss = getBrandingCss(branding);
  const body = <AppThemeProvider>{children}</AppThemeProvider>;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {brandingCss && <style>{brandingCss}</style>}
      </head>
      <body style={appBodyStyle}>
        {process.env['AUTH_PROVIDER'] === 'clerk' ? (
          <ClerkProvider>{body}</ClerkProvider>
        ) : (
          body
        )}
      </body>
    </html>
  );
}
