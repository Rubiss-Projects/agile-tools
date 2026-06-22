import { describe, expect, it } from 'vitest';

import { getAppBranding, getBrandingCss, getBrandingCssProperties, getBrandingThemeCss } from './branding';

describe('getAppBranding', () => {
  const tinySvgDataUrl = 'data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%201%201%22%3E%3C/svg%3E';
  const tinySvgBase64DataUrl = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=';
  const tinyPngDataUrl = 'data:image/png;base64,iVBORw0KGgo=';
  const tinyXIconDataUrl = 'data:image/x-icon;base64,AAABAAE=';
  const tinyMicrosoftIconDataUrl = 'data:image/vnd.microsoft.icon;base64,AAABAAE=';

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

  it('accepts safe data image URLs for self-host branding assets', () => {
    const branding = getAppBranding({
      APP_BRAND_LOGO_LIGHT_URL: tinySvgDataUrl,
      APP_BRAND_LOGO_DARK_URL: tinySvgBase64DataUrl,
      APP_BRAND_FAVICON_URL: tinyPngDataUrl,
    });

    expect(branding.logoLightUrl).toBe(tinySvgDataUrl);
    expect(branding.logoDarkUrl).toBe(tinySvgBase64DataUrl);
    expect(branding.faviconUrl).toBe(tinyPngDataUrl);
  });

  it('accepts icon data URL MIME types for favicons', () => {
    expect(getAppBranding({
      APP_BRAND_FAVICON_URL: tinyXIconDataUrl,
    }).faviconUrl).toBe(tinyXIconDataUrl);

    expect(getAppBranding({
      APP_BRAND_FAVICON_URL: tinyMicrosoftIconDataUrl,
    }).faviconUrl).toBe(tinyMicrosoftIconDataUrl);
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

  it.each([
    ['HTML data URL', 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    ['unlisted image MIME type', 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='],
    ['missing MIME type', 'data:;base64,AAAA'],
    ['wrong charset', 'data:image/svg+xml;charset=utf-16,%3Csvg%3E%3C/svg%3E'],
    ['unexpected parameter', 'data:image/svg+xml;name=logo,%3Csvg%3E%3C/svg%3E'],
    ['duplicate base64 marker', 'data:image/png;base64;base64,iVBORw0KGgo='],
    ['invalid base64 payload', 'data:image/png;base64,not valid base64'],
    ['base64 before charset', 'data:image/svg+xml;base64;charset=utf-8,PHN2Zy8+'],
    ['missing comma separator', 'data:image/png;base64iVBORw0KGgo='],
    ['empty payload', 'data:image/png;base64,'],
  ])('rejects %s', (_label, value) => {
    expect(() => getAppBranding({
      APP_BRAND_LOGO_LIGHT_URL: value,
    })).toThrowError(/APP_BRAND_LOGO_LIGHT_URL/);
  });

  it('rejects branding asset URLs over 256 KiB', () => {
    const prefix = 'data:image/png;base64,';
    const maxLengthPayload = 'A'.repeat(256 * 1024 - prefix.length);
    const oversizedPayload = `${maxLengthPayload}A`;

    expect(getAppBranding({
      APP_BRAND_LOGO_LIGHT_URL: `${prefix}${maxLengthPayload}`,
    }).logoLightUrl).toHaveLength(256 * 1024);

    expect(() => getAppBranding({
      APP_BRAND_LOGO_LIGHT_URL: `${prefix}${oversizedPayload}`,
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
