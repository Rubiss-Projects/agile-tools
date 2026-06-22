import type { CSSProperties } from 'react';
import { z } from 'zod';

export interface AppBranding {
  name: string;
  title: string;
  description: string;
  logoLightUrl?: string;
  logoDarkUrl?: string;
  faviconUrl?: string;
  primaryColor?: string;
  secondaryColor?: string;
  primaryColorLight?: string;
  primaryColorDark?: string;
  secondaryColorLight?: string;
  secondaryColorDark?: string;
}

const DEFAULT_BRAND_NAME = 'Agile Tools';
const DEFAULT_TITLE_SUFFIX = 'Kanban Flow Forecasting';
const DEFAULT_DESCRIPTION = 'Kanban flow visibility and story-count Monte Carlo forecasting.';
const MAX_ASSET_URL_LENGTH = 256 * 1024;
const DATA_URL_PREFIX = 'data:';
const ALLOWED_DATA_IMAGE_MIME_TYPES = new Set([
  'image/svg+xml',
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Expected a 6-digit hex color such as #325796.');

const assetUrlSchema = z.string().max(
  MAX_ASSET_URL_LENGTH,
  'Expected branding asset URLs to be 256 KiB or smaller.',
).refine(
  (value) => {
    if (value.startsWith('/')) {
      return !value.startsWith('//');
    }

    if (isSafeDataImageUrl(value)) {
      return true;
    }

    try {
      const parsed = new URL(value);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  },
  'Expected an absolute https URL, an app-root-relative path such as /brand/logo.svg, or a safe data: image URL.',
);

const brandingEnvSchema = z.object({
  APP_BRAND_NAME: z.string().trim().min(1).max(80).optional(),
  APP_BRAND_TITLE_SUFFIX: z.string().trim().min(1).max(120).optional(),
  APP_BRAND_DESCRIPTION: z.string().trim().min(1).max(240).optional(),
  APP_BRAND_LOGO_LIGHT_URL: assetUrlSchema.optional(),
  APP_BRAND_LOGO_DARK_URL: assetUrlSchema.optional(),
  APP_BRAND_FAVICON_URL: assetUrlSchema.optional(),
  APP_BRAND_PRIMARY_COLOR: colorSchema.optional(),
  APP_BRAND_SECONDARY_COLOR: colorSchema.optional(),
  APP_BRAND_PRIMARY_COLOR_LIGHT: colorSchema.optional(),
  APP_BRAND_PRIMARY_COLOR_DARK: colorSchema.optional(),
  APP_BRAND_SECONDARY_COLOR_LIGHT: colorSchema.optional(),
  APP_BRAND_SECONDARY_COLOR_DARK: colorSchema.optional(),
});

export function getAppBranding(env: Record<string, string | undefined> = process.env): AppBranding {
  const result = brandingEnvSchema.safeParse(env);

  if (!result.success) {
    throw new Error(
      `Invalid branding configuration:\n${result.error.issues
        .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
        .join('\n')}`,
    );
  }

  const parsed = result.data;
  const name = parsed.APP_BRAND_NAME ?? DEFAULT_BRAND_NAME;
  const suffix = parsed.APP_BRAND_TITLE_SUFFIX ?? DEFAULT_TITLE_SUFFIX;

  const branding: AppBranding = {
    name,
    title: `${name} - ${suffix}`,
    description: parsed.APP_BRAND_DESCRIPTION ?? DEFAULT_DESCRIPTION,
  };

  if (parsed.APP_BRAND_LOGO_LIGHT_URL) branding.logoLightUrl = parsed.APP_BRAND_LOGO_LIGHT_URL;
  if (parsed.APP_BRAND_LOGO_DARK_URL) branding.logoDarkUrl = parsed.APP_BRAND_LOGO_DARK_URL;
  if (parsed.APP_BRAND_FAVICON_URL) branding.faviconUrl = parsed.APP_BRAND_FAVICON_URL;
  if (parsed.APP_BRAND_PRIMARY_COLOR) branding.primaryColor = parsed.APP_BRAND_PRIMARY_COLOR;
  if (parsed.APP_BRAND_SECONDARY_COLOR) branding.secondaryColor = parsed.APP_BRAND_SECONDARY_COLOR;
  if (parsed.APP_BRAND_PRIMARY_COLOR_LIGHT) branding.primaryColorLight = parsed.APP_BRAND_PRIMARY_COLOR_LIGHT;
  if (parsed.APP_BRAND_PRIMARY_COLOR_DARK) branding.primaryColorDark = parsed.APP_BRAND_PRIMARY_COLOR_DARK;
  if (parsed.APP_BRAND_SECONDARY_COLOR_LIGHT) branding.secondaryColorLight = parsed.APP_BRAND_SECONDARY_COLOR_LIGHT;
  if (parsed.APP_BRAND_SECONDARY_COLOR_DARK) branding.secondaryColorDark = parsed.APP_BRAND_SECONDARY_COLOR_DARK;

  return branding;
}

export function getBrandingCssProperties(branding: AppBranding): CSSProperties {
  return getBrandColorTokens({
    primaryColor: branding.primaryColor,
    secondaryColor: branding.secondaryColor,
  });
}

export function getBrandingCss(branding: AppBranding): string {
  const baseRule = buildCssRule(':root', getBrandingCssProperties(branding));
  const themeCss = getBrandingThemeCss(branding);

  return [baseRule, themeCss].filter(Boolean).join('\n');
}

export function getBrandingThemeCss(branding: AppBranding): string {
  const lightTokens = getBrandColorTokens({
    primaryColor: branding.primaryColorLight ?? branding.primaryColor,
    secondaryColor: branding.secondaryColorLight ?? branding.secondaryColor,
  });
  const darkTokens = getBrandColorTokens({
    primaryColor: branding.primaryColorDark ?? branding.primaryColor,
    secondaryColor: branding.secondaryColorDark ?? branding.secondaryColor,
  });

  return [
    buildCssRule("html[data-theme='light']", lightTokens),
    buildCssRule("html[data-theme='dark']", darkTokens),
  ].filter(Boolean).join('\n');
}

function getBrandColorTokens(colors: { primaryColor: string | undefined; secondaryColor: string | undefined }): CSSProperties {
  const customProperties: Record<string, string> = {};

  if (colors.primaryColor) {
    customProperties['--color-accent'] = colors.primaryColor;
    customProperties['--color-accent-strong'] = colors.primaryColor;
    customProperties['--color-accent-soft'] = `color-mix(in srgb, ${colors.primaryColor} 14%, transparent)`;
    customProperties['--color-button-primary-bg'] = colors.primaryColor;
    customProperties['--color-button-primary-text'] = getReadableTextColor(colors.primaryColor);
  }

  if (colors.secondaryColor) {
    customProperties['--chart-hold'] = colors.secondaryColor;
  }

  return customProperties;
}

function buildCssRule(selector: string, tokens: CSSProperties): string {
  const declarations = Object.entries(tokens)
    .map(([property, value]) => `${property}: ${value};`)
    .join(' ');

  return declarations ? `${selector} { ${declarations} }` : '';
}

function getReadableTextColor(hexColor: string): '#111827' | '#ffffff' {
  const red = Number.parseInt(hexColor.slice(1, 3), 16);
  const green = Number.parseInt(hexColor.slice(3, 5), 16);
  const blue = Number.parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;

  return luminance > 0.58 ? '#111827' : '#ffffff';
}

function isSafeDataImageUrl(value: string): boolean {
  if (!value.toLowerCase().startsWith(DATA_URL_PREFIX)) {
    return false;
  }

  const commaIndex = value.indexOf(',');
  if (commaIndex <= DATA_URL_PREFIX.length || commaIndex === value.length - 1) {
    return false;
  }

  const payload = value.slice(commaIndex + 1);
  const metadata = value.slice(DATA_URL_PREFIX.length, commaIndex);
  const metadataParts = metadata.split(';');
  const mimeType = metadataParts[0]?.toLowerCase();

  if (!mimeType || !ALLOWED_DATA_IMAGE_MIME_TYPES.has(mimeType)) {
    return false;
  }

  let sawCharset = false;
  let sawBase64 = false;

  for (const parameter of metadataParts.slice(1)) {
    const normalized = parameter.toLowerCase();

    if (normalized === 'charset=utf-8') {
      if (sawCharset || sawBase64) {
        return false;
      }

      sawCharset = true;
      continue;
    }

    if (normalized === 'base64') {
      if (sawBase64) {
        return false;
      }

      sawBase64 = true;
      continue;
    }

    return false;
  }

  return sawBase64 ? isValidBase64Payload(payload) : true;
}

function isValidBase64Payload(payload: string): boolean {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(payload) && payload.length % 4 !== 1;
}
