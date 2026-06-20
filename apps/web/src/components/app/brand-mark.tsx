import type { CSSProperties } from 'react';
import type { AppBranding } from '@/server/branding';

interface BrandMarkProps {
  branding: AppBranding;
  heading?: boolean;
  style?: CSSProperties;
}

const shellStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.75rem',
  minWidth: 0,
};

const logoStyle: CSSProperties = {
  width: 'clamp(2.2rem, 5vw, 3rem)',
  height: 'clamp(2.2rem, 5vw, 3rem)',
  objectFit: 'contain',
  flex: '0 0 auto',
};

const logoStackStyle: CSSProperties = {
  ...logoStyle,
  position: 'relative',
};

const logoFallbackStyle: CSSProperties = {
  ...logoStyle,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '14px',
  background: 'var(--color-accent)',
  color: 'var(--color-button-primary-text)',
  fontFamily: 'var(--font-label)',
  fontSize: '1rem',
  fontWeight: 700,
};

const textStyle: CSSProperties = {
  minWidth: 0,
  color: 'var(--color-ink)',
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(2.2rem, 5vw, 3.35rem)',
  fontWeight: 700,
  lineHeight: 0.98,
  overflowWrap: 'anywhere',
};

export function BrandMark({ branding, heading = false, style }: BrandMarkProps) {
  const logoUrl = branding.logoLightUrl ?? branding.logoDarkUrl;
  const logo = branding.logoLightUrl && branding.logoDarkUrl ? (
    <span className="brand-mark-logo-stack" style={logoStackStyle}>
      <img
        className="brand-mark-logo brand-mark-logo-light"
        src={branding.logoLightUrl}
        alt=""
        aria-hidden="true"
        style={logoStyle}
      />
      <img
        className="brand-mark-logo brand-mark-logo-dark"
        src={branding.logoDarkUrl}
        alt=""
        aria-hidden="true"
        style={logoStyle}
      />
    </span>
  ) : logoUrl ? (
    <img src={logoUrl} alt="" aria-hidden="true" style={logoStyle} />
  ) : (
    <span aria-hidden="true" style={logoFallbackStyle}>
      {branding.name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
  const content = (
    <>
      {logo}
      <span style={textStyle}>{branding.name}</span>
    </>
  );

  if (heading) {
    return <h1 style={{ ...shellStyle, ...style }}>{content}</h1>;
  }

  return <span style={{ ...shellStyle, ...style }}>{content}</span>;
}
