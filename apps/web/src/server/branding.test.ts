import { describe, expect, it } from 'vitest';

import { getAppBranding, getBrandingCss, getBrandingCssProperties, getBrandingThemeCss } from './branding';

describe('getAppBranding', () => {
  it('returns Agile Tools defaults when branding variables are absent', () => {
    expect(getAppBranding({})).toMatchObject({
      name: 'Agile Tools',
      title: 'Agile Tools - Kanban Flow Forecasting',
      description: 'Kanban flow visibility and story-count Monte Carlo forecasting.',
    });
  });

  it('reads validated self-host branding values', () => {
    const branding = getAppBranding({
      APP_BRAND_NAME: 'Acme Flow',
      APP_BRAND_TITLE_SUFFIX: 'Delivery Forecasts',
      APP_BRAND_DESCRIPTION: 'Internal flow forecasting for Acme teams.',
      APP_BRAND_LOGO_LIGHT_URL: '/brand/logo-light.svg',
      APP_BRAND_LOGO_DARK_URL: 'https://assets.example.test/logo-dark.svg',
      APP_BRAND_FAVICON_URL: '/brand/favicon.ico',
      APP_BRAND_PRIMARY_COLOR: '#2468a8',
      APP_BRAND_SECONDARY_COLOR: '#7f6db8',
      APP_BRAND_PRIMARY_COLOR_LIGHT: '#123456',
      APP_BRAND_PRIMARY_COLOR_DARK: '#abcdef',
      APP_BRAND_SECONDARY_COLOR_LIGHT: '#654321',
      APP_BRAND_SECONDARY_COLOR_DARK: '#fedcba',
    });

    expect(branding).toEqual({
      name: 'Acme Flow',
      title: 'Acme Flow - Delivery Forecasts',
      description: 'Internal flow forecasting for Acme teams.',
      logoLightUrl: '/brand/logo-light.svg',
      logoDarkUrl: 'https://assets.example.test/logo-dark.svg',
      faviconUrl: '/brand/favicon.ico',
      primaryColor: '#2468a8',
      secondaryColor: '#7f6db8',
      primaryColorLight: '#123456',
      primaryColorDark: '#abcdef',
      secondaryColorLight: '#654321',
      secondaryColorDark: '#fedcba',
    });
  });

  it('rejects invalid colors and asset URLs with a readable error', () => {
    expect(() => getAppBranding({
      APP_BRAND_LOGO_LIGHT_URL: 'javascript:alert(1)',
      APP_BRAND_PRIMARY_COLOR: 'blue',
    })).toThrowError(/APP_BRAND_LOGO_LIGHT_URL|APP_BRAND_PRIMARY_COLOR/);
  });

  it('rejects insecure external branding asset URLs', () => {
    expect(() => getAppBranding({
      APP_BRAND_LOGO_LIGHT_URL: 'http://assets.example.test/logo.svg',
    })).toThrowError(/APP_BRAND_LOGO_LIGHT_URL/);
  });
});

describe('getBrandingCssProperties', () => {
  it('does not override theme tokens when branding colors are absent', () => {
    expect(getBrandingCssProperties({
      name: 'Agile Tools',
      title: 'Agile Tools - Kanban Flow Forecasting',
      description: 'Kanban flow visibility and story-count Monte Carlo forecasting.',
    })).toEqual({});
  });

  it('maps configured colors to the existing semantic tokens', () => {
    expect(getBrandingCssProperties({
      name: 'Acme Flow',
      title: 'Acme Flow - Delivery Forecasts',
      description: 'Internal flow forecasting for Acme teams.',
      primaryColor: '#ffffff',
      secondaryColor: '#112233',
    })).toMatchObject({
      '--color-accent': '#ffffff',
      '--color-accent-strong': '#ffffff',
      '--color-button-primary-bg': '#ffffff',
      '--color-button-primary-text': '#111827',
      '--chart-hold': '#112233',
    });
  });
});

describe('getBrandingThemeCss', () => {
  it('does not emit mode-specific CSS when branding colors are absent', () => {
    expect(getBrandingThemeCss({
      name: 'Agile Tools',
      title: 'Agile Tools - Kanban Flow Forecasting',
      description: 'Kanban flow visibility and story-count Monte Carlo forecasting.',
    })).toBe('');
  });

  it('emits mode-specific color overrides when configured', () => {
    expect(getBrandingThemeCss({
      name: 'Acme Flow',
      title: 'Acme Flow - Delivery Forecasts',
      description: 'Internal flow forecasting for Acme teams.',
      primaryColorLight: '#123456',
      primaryColorDark: '#abcdef',
      secondaryColorLight: '#654321',
      secondaryColorDark: '#fedcba',
    })).toContain("html[data-theme='light'] { --color-accent: #123456;");

    expect(getBrandingThemeCss({
      name: 'Acme Flow',
      title: 'Acme Flow - Delivery Forecasts',
      description: 'Internal flow forecasting for Acme teams.',
      primaryColorLight: '#123456',
      primaryColorDark: '#abcdef',
      secondaryColorLight: '#654321',
      secondaryColorDark: '#fedcba',
    })).toContain("html[data-theme='dark'] { --color-accent: #abcdef;");
  });

  it('uses base colors as mode-specific fallbacks', () => {
    expect(getBrandingThemeCss({
      name: 'Acme Flow',
      title: 'Acme Flow - Delivery Forecasts',
      description: 'Internal flow forecasting for Acme teams.',
      primaryColor: '#2468a8',
      secondaryColor: '#7f6db8',
    })).toBe(
      "html[data-theme='light'] { --color-accent: #2468a8; --color-accent-strong: #2468a8; --color-accent-soft: color-mix(in srgb, #2468a8 14%, transparent); --color-button-primary-bg: #2468a8; --color-button-primary-text: #ffffff; --chart-hold: #7f6db8; }\nhtml[data-theme='dark'] { --color-accent: #2468a8; --color-accent-strong: #2468a8; --color-accent-soft: color-mix(in srgb, #2468a8 14%, transparent); --color-button-primary-bg: #2468a8; --color-button-primary-text: #ffffff; --chart-hold: #7f6db8; }",
    );
  });
});

describe('getBrandingCss', () => {
  it('omits all branding CSS when no colors are configured', () => {
    expect(getBrandingCss({
      name: 'Agile Tools',
      title: 'Agile Tools - Kanban Flow Forecasting',
      description: 'Kanban flow visibility and story-count Monte Carlo forecasting.',
    })).toBe('');
  });

  it('emits base colors before mode-specific overrides', () => {
    expect(getBrandingCss({
      name: 'Acme Flow',
      title: 'Acme Flow - Delivery Forecasts',
      description: 'Internal flow forecasting for Acme teams.',
      primaryColor: '#2468a8',
      primaryColorLight: '#123456',
      primaryColorDark: '#abcdef',
    })).toBe(
      ":root { --color-accent: #2468a8; --color-accent-strong: #2468a8; --color-accent-soft: color-mix(in srgb, #2468a8 14%, transparent); --color-button-primary-bg: #2468a8; --color-button-primary-text: #ffffff; }\nhtml[data-theme='light'] { --color-accent: #123456; --color-accent-strong: #123456; --color-accent-soft: color-mix(in srgb, #123456 14%, transparent); --color-button-primary-bg: #123456; --color-button-primary-text: #ffffff; }\nhtml[data-theme='dark'] { --color-accent: #abcdef; --color-accent-strong: #abcdef; --color-accent-soft: color-mix(in srgb, #abcdef 14%, transparent); --color-button-primary-bg: #abcdef; --color-button-primary-text: #111827; }",
    );
  });

  it('emits base colors into theme rules so globals.css cannot override them', () => {
    expect(getBrandingCss({
      name: 'Acme Flow',
      title: 'Acme Flow - Delivery Forecasts',
      description: 'Internal flow forecasting for Acme teams.',
      primaryColor: '#2468a8',
    })).toContain("html[data-theme='dark'] { --color-accent: #2468a8;");
  });
});
