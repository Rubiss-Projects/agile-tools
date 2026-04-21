import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { appBodyStyle } from '@/components/app/chrome';
import { AppThemeProvider } from '@/components/app/theme-provider';
import { THEME_INIT_SCRIPT } from '@/components/app/theme';
import './globals.css';

export const metadata: Metadata = {
  title: 'Agile Tools — Kanban Flow Forecasting',
  description: 'Kanban flow visibility and story-count Monte Carlo forecasting.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body style={appBodyStyle}>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
