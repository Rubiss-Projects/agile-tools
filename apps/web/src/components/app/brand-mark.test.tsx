// @vitest-environment jsdom

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandMark } from './brand-mark';

describe('BrandMark', () => {
  it('renders the default app name without a configured logo', () => {
    render(
      <BrandMark
        heading
        branding={{
          name: 'Agile Tools',
          title: 'Agile Tools - Kanban Flow Forecasting',
          description: 'Kanban flow visibility and story-count Monte Carlo forecasting.',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Agile Tools' })).toBeVisible();
    expect(screen.getByText('A')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders the configured brand name and logo', () => {
    const { container } = render(
      <BrandMark
        heading
        branding={{
          name: 'Acme Flow',
          title: 'Acme Flow - Delivery Forecasts',
          description: 'Internal flow forecasting for Acme teams.',
          logoLightUrl: '/brand/logo.svg',
        }}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Acme Flow' })).toBeVisible();
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/brand/logo.svg');
  });

  it('renders both logo variants when light and dark assets are configured', () => {
    const { container } = render(
      <BrandMark
        branding={{
          name: 'Acme Flow',
          title: 'Acme Flow - Delivery Forecasts',
          description: 'Internal flow forecasting for Acme teams.',
          logoLightUrl: '/brand/logo-light.svg',
          logoDarkUrl: '/brand/logo-dark.svg',
        }}
      />,
    );

    expect(container.querySelector('.brand-mark-logo-light')?.getAttribute('src')).toBe('/brand/logo-light.svg');
    expect(container.querySelector('.brand-mark-logo-dark')?.getAttribute('src')).toBe('/brand/logo-dark.svg');
  });

  it('falls back to an initial when no logo is configured', () => {
    render(
      <BrandMark
        branding={{
          name: 'Beacon Metrics',
          title: 'Beacon Metrics - Delivery Forecasts',
          description: 'Internal flow forecasting.',
        }}
      />,
    );

    expect(screen.getByText('Beacon Metrics')).toBeVisible();
    expect(screen.getByText('B')).toHaveAttribute('aria-hidden', 'true');
  });
});
