import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { appBodyStyle } from '@/components/app/chrome';

export const metadata: Metadata = {
  title: 'Agile Tools — Kanban Flow Forecasting',
  description: 'Kanban flow visibility and story-count Monte Carlo forecasting.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={appBodyStyle}>{children}</body>
    </html>
  );
}
