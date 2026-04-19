import type { CSSProperties } from 'react';

export const palette = {
  ink: '#0f172a',
  text: '#1e293b',
  muted: '#475569',
  soft: '#64748b',
  line: '#dbe4ee',
  panel: '#ffffff',
  panelAlt: '#f8fafc',
  warm: '#fff7ed',
  blueWash: '#eff6ff',
  cyanWash: '#ecfeff',
  mintWash: '#f0fdf4',
  amberWash: '#fffbeb',
  roseWash: '#fff1f2',
  accent: '#0f172a',
  accentStrong: '#1d4ed8',
  accentSoft: '#dbeafe',
  positive: '#166534',
  positiveSoft: '#dcfce7',
  warning: '#92400e',
  warningSoft: '#fde68a',
  danger: '#b91c1c',
  dangerSoft: '#fecaca',
};

export const appBodyStyle: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  background: [
    'radial-gradient(circle at top left, rgba(255,247,237,0.95), transparent 28%)',
    'radial-gradient(circle at top right, rgba(236,254,255,0.9), transparent 26%)',
    'linear-gradient(180deg, #f8fafc 0%, #eef2ff 48%, #f8fafc 100%)',
  ].join(','),
  color: palette.text,
  fontFamily: '"Segoe UI Variable Text", "Segoe UI", sans-serif',
};

export const pageShellStyle: CSSProperties = {
  padding: '3rem 1.5rem 4rem',
  maxWidth: '1120px',
  margin: '0 auto',
};

export const heroCardStyle: CSSProperties = {
  padding: '2rem',
  borderRadius: '28px',
  background: 'linear-gradient(140deg, #fff7ed 0%, #eff6ff 55%, #ecfeff 100%)',
  border: `1px solid ${palette.line}`,
  boxShadow: '0 24px 60px rgba(15, 23, 42, 0.08)',
};

export const heroTitleStyle: CSSProperties = {
  margin: '0.75rem 0 0',
  fontSize: 'clamp(2rem, 4vw, 2.85rem)',
  lineHeight: 1.05,
  color: palette.ink,
};

export const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.78rem',
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#9a3412',
  fontWeight: 700,
};

export const heroCopyStyle: CSSProperties = {
  margin: '0.9rem 0 0',
  maxWidth: '46rem',
  color: palette.muted,
  lineHeight: 1.7,
  fontSize: '0.98rem',
};

export const statGridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  marginTop: '1.5rem',
};

export const statCardStyle: CSSProperties = {
  padding: '1rem 1.1rem',
  borderRadius: '18px',
  border: `1px solid rgba(148, 163, 184, 0.24)`,
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(12px)',
};

export const statLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: '0.72rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: palette.soft,
  fontWeight: 700,
};

export const statValueStyle: CSSProperties = {
  margin: '0.45rem 0 0',
  fontSize: '1.2rem',
  fontWeight: 700,
  color: palette.ink,
};

export const sectionStackStyle: CSSProperties = {
  display: 'grid',
  gap: '1.25rem',
  marginTop: '1.5rem',
};

export const sectionCardStyle: CSSProperties = {
  padding: '1.35rem',
  borderRadius: '22px',
  border: `1px solid ${palette.line}`,
  background: 'rgba(255,255,255,0.92)',
  boxShadow: '0 18px 38px rgba(15, 23, 42, 0.06)',
};

export const sectionHeaderRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '1rem',
  alignItems: 'flex-end',
  flexWrap: 'wrap',
  marginBottom: '1rem',
};

export const sectionTitleStyle: CSSProperties = {
  margin: 0,
  color: palette.ink,
  fontSize: '1.2rem',
};

export const sectionCopyStyle: CSSProperties = {
  margin: '0.4rem 0 0',
  color: palette.muted,
  lineHeight: 1.6,
  fontSize: '0.92rem',
};

export const listStyle: CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'grid',
  gap: '0.85rem',
};

export const itemCardStyle: CSSProperties = {
  padding: '1rem 1.1rem',
  borderRadius: '18px',
  border: `1px solid ${palette.line}`,
  background: `linear-gradient(180deg, ${palette.panel} 0%, ${palette.panelAlt} 100%)`,
};

export const insetPanelStyle: CSSProperties = {
  padding: '1rem',
  borderRadius: '18px',
  border: `1px solid ${palette.line}`,
  background: `linear-gradient(180deg, ${palette.panelAlt} 0%, ${palette.panel} 100%)`,
};

export const fieldLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontSize: '0.78rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: palette.soft,
  fontWeight: 700,
};

export const helperTextStyle: CSSProperties = {
  margin: '0.35rem 0 0',
  color: palette.soft,
  fontSize: '0.82rem',
  lineHeight: 1.5,
};

export const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  borderRadius: '14px',
  border: `1px solid #cbd5e1`,
  background: 'rgba(255,255,255,0.95)',
  color: palette.ink,
  padding: '0.85rem 0.95rem',
  fontSize: '0.95rem',
  outline: 'none',
};

export const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: 'none',
};

export const textareaStyle: CSSProperties = {
  ...inputStyle,
  minHeight: '7rem',
  resize: 'vertical',
};

export const subtleRuleStyle: CSSProperties = {
  borderTop: `1px solid ${palette.line}`,
  paddingTop: '1rem',
};

export const codeStyle: CSSProperties = {
  display: 'inline-block',
  padding: '0.18rem 0.42rem',
  borderRadius: '9999px',
  background: 'rgba(15,23,42,0.08)',
  color: palette.ink,
  fontSize: '0.78rem',
};

export const linkStyle: CSSProperties = {
  color: palette.accentStrong,
  textDecoration: 'none',
  fontWeight: 600,
};

export function buttonStyle(variant: 'primary' | 'secondary' = 'primary', disabled = false): CSSProperties {
  const isPrimary = variant === 'primary';
  return {
    borderRadius: '9999px',
    border: isPrimary ? 'none' : `1px solid ${palette.line}`,
    background: disabled
      ? '#cbd5e1'
      : isPrimary
        ? 'linear-gradient(135deg, #0f172a 0%, #1d4ed8 100%)'
        : 'rgba(255,255,255,0.94)',
    color: disabled ? '#475569' : isPrimary ? '#ffffff' : palette.ink,
    padding: '0.78rem 1.05rem',
    fontSize: '0.9rem',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: isPrimary && !disabled ? '0 14px 30px rgba(29, 78, 216, 0.22)' : 'none',
  };
}

export function tonePillStyle(tone: 'neutral' | 'info' | 'positive' | 'warning' | 'danger'): CSSProperties {
  const tones = {
    neutral: { color: palette.muted, background: 'rgba(148, 163, 184, 0.12)' },
    info: { color: palette.accentStrong, background: palette.accentSoft },
    positive: { color: palette.positive, background: palette.positiveSoft },
    warning: { color: palette.warning, background: palette.amberWash },
    danger: { color: palette.danger, background: palette.roseWash },
  } as const;

  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.38rem 0.7rem',
    borderRadius: '9999px',
    color: tones[tone].color,
    background: tones[tone].background,
    fontSize: '0.78rem',
    fontWeight: 700,
    whiteSpace: 'nowrap',
  };
}

export function noticeStyle(tone: 'warning' | 'success' | 'danger' | 'info'): CSSProperties {
  const tones = {
    warning: { background: palette.amberWash, border: palette.warningSoft, color: palette.warning },
    success: { background: palette.mintWash, border: '#bbf7d0', color: palette.positive },
    danger: { background: '#fef2f2', border: palette.dangerSoft, color: palette.danger },
    info: { background: palette.blueWash, border: '#bfdbfe', color: palette.accentStrong },
  } as const;

  return {
    padding: '0.8rem 0.95rem',
    borderRadius: '16px',
    background: tones[tone].background,
    border: `1px solid ${tones[tone].border}`,
    color: tones[tone].color,
  };
}

export function checkboxChipStyle(active: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.45rem',
    padding: '0.6rem 0.8rem',
    borderRadius: '9999px',
    border: `1px solid ${active ? '#93c5fd' : palette.line}`,
    background: active ? '#eff6ff' : 'rgba(255,255,255,0.9)',
    cursor: 'pointer',
    color: active ? palette.accentStrong : palette.text,
    fontSize: '0.88rem',
    fontWeight: active ? 700 : 500,
  };
}