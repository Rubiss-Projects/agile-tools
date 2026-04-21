import type { CSSProperties } from 'react';

export const palette = {
  canvas: 'var(--color-canvas)',
  panel: 'var(--color-panel)',
  panelAlt: 'var(--color-panel-alt)',
  panelStrong: 'var(--color-panel-strong)',
  ink: 'var(--color-ink)',
  text: 'var(--color-text)',
  muted: 'var(--color-text-muted)',
  soft: 'var(--color-text-soft)',
  line: 'var(--color-line)',
  lineStrong: 'var(--color-line-strong)',
  accent: 'var(--color-accent)',
  accentStrong: 'var(--color-accent-strong)',
  accentSoft: 'var(--color-accent-soft)',
  positive: 'var(--color-positive)',
  positiveSoft: 'var(--color-positive-soft)',
  warning: 'var(--color-warning)',
  warningSoft: 'var(--color-warning-soft)',
  danger: 'var(--color-danger)',
  dangerSoft: 'var(--color-danger-soft)',
  overlay: 'var(--color-overlay)',
  buttonPrimary: 'var(--color-button-primary-bg)',
  buttonPrimaryText: 'var(--color-button-primary-text)',
  buttonSecondary: 'var(--color-button-secondary-bg)',
  buttonSecondaryText: 'var(--color-button-secondary-text)',
  buttonDisabled: 'var(--color-button-disabled-bg)',
  buttonDisabledText: 'var(--color-button-disabled-text)',
  chartNeutral: 'var(--chart-neutral)',
  chartPositive: 'var(--chart-positive)',
  chartWarning: 'var(--chart-warning)',
  chartDanger: 'var(--chart-danger)',
  chartHold: 'var(--chart-hold)',
  shadowSoft: 'var(--shadow-soft)',
  shadowCard: 'var(--shadow-card)',
};

const transition =
  'background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease';

export const appBodyStyle: CSSProperties = {
  margin: 0,
  minHeight: '100vh',
  backgroundColor: palette.canvas,
  color: palette.text,
  fontFamily: 'var(--font-body)',
  transition,
};

export const pageShellStyle: CSSProperties = {
  padding: '4.5rem 1.5rem 4rem',
  maxWidth: '1180px',
  margin: '0 auto',
  position: 'relative',
};

export const heroCardStyle: CSSProperties = {
  padding: 'clamp(1.75rem, 3vw, 2.5rem)',
  borderRadius: '32px',
  background: palette.panel,
  border: `1px solid ${palette.lineStrong}`,
  borderTop: `4px solid ${palette.accent}`,
  boxShadow: palette.shadowCard,
  backdropFilter: 'blur(18px)',
  transition,
};

export const heroTitleStyle: CSSProperties = {
  margin: '0.9rem 0 0',
  fontFamily: 'var(--font-display)',
  fontSize: 'clamp(2.2rem, 5vw, 3.35rem)',
  fontWeight: 700,
  letterSpacing: '-0.045em',
  lineHeight: 0.98,
  color: palette.ink,
};

export const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: '0.74rem',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: palette.accentStrong,
  fontWeight: 700,
};

export const heroCopyStyle: CSSProperties = {
  margin: '1rem 0 0',
  maxWidth: '44rem',
  color: palette.muted,
  lineHeight: 1.75,
  fontSize: '1rem',
};

export const statGridStyle: CSSProperties = {
  display: 'grid',
  gap: '1rem',
  gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
  marginTop: '1.65rem',
};

export const statCardStyle: CSSProperties = {
  padding: '1rem 1.1rem 1.05rem',
  borderRadius: '20px',
  border: `1px solid ${palette.line}`,
  background: palette.panelAlt,
  backdropFilter: 'blur(12px)',
  transition,
};

export const statLabelStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-label)',
  fontSize: '0.72rem',
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  color: palette.soft,
  fontWeight: 700,
};

export const statValueStyle: CSSProperties = {
  margin: '0.45rem 0 0',
  fontFamily: 'var(--font-display)',
  fontSize: '1.45rem',
  fontWeight: 700,
  color: palette.ink,
  letterSpacing: '-0.03em',
};

export const sectionStackStyle: CSSProperties = {
  display: 'grid',
  gap: '1.3rem',
  marginTop: '1.65rem',
};

export const sectionCardStyle: CSSProperties = {
  padding: '1.4rem',
  borderRadius: '28px',
  border: `1px solid ${palette.lineStrong}`,
  background: palette.panel,
  boxShadow: palette.shadowSoft,
  backdropFilter: 'blur(18px)',
  transition,
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
  fontFamily: 'var(--font-display)',
  fontSize: '1.6rem',
  letterSpacing: '-0.03em',
};

export const sectionCopyStyle: CSSProperties = {
  margin: '0.4rem 0 0',
  color: palette.muted,
  lineHeight: 1.7,
  fontSize: '0.95rem',
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
  borderRadius: '22px',
  border: `1px solid ${palette.line}`,
  background: palette.panelAlt,
  transition,
};

export const insetPanelStyle: CSSProperties = {
  padding: '1rem',
  borderRadius: '20px',
  border: `1px solid ${palette.line}`,
  background: palette.panelAlt,
  transition,
};

export const fieldLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '0.4rem',
  fontFamily: 'var(--font-label)',
  fontSize: '0.74rem',
  letterSpacing: '0.15em',
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
  border: `1px solid ${palette.lineStrong}`,
  background: palette.panelStrong,
  color: palette.ink,
  padding: '0.85rem 0.95rem',
  fontSize: '0.95rem',
  outline: 'none',
  transition,
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
  padding: '0.18rem 0.48rem',
  borderRadius: '9999px',
  border: `1px solid ${palette.line}`,
  background: palette.panelAlt,
  color: palette.ink,
  fontFamily: 'var(--font-label)',
  fontSize: '0.76rem',
};

export const linkStyle: CSSProperties = {
  color: palette.accentStrong,
  textDecoration: 'none',
  fontWeight: 700,
};

export const selectionControlStyle: CSSProperties = {
  accentColor: palette.accentStrong,
};

export function buttonStyle(variant: 'primary' | 'secondary' = 'primary', disabled = false): CSSProperties {
  const isPrimary = variant === 'primary';
  return {
    borderRadius: '9999px',
    border: isPrimary ? '1px solid transparent' : `1px solid ${palette.lineStrong}`,
    background: disabled
      ? palette.buttonDisabled
      : isPrimary
        ? palette.buttonPrimary
        : palette.buttonSecondary,
    color: disabled
      ? palette.buttonDisabledText
      : isPrimary
        ? palette.buttonPrimaryText
        : palette.buttonSecondaryText,
    padding: '0.78rem 1.08rem',
    fontFamily: 'var(--font-label)',
    fontSize: '0.84rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: disabled ? 'not-allowed' : 'pointer',
    boxShadow: isPrimary && !disabled ? palette.shadowSoft : 'none',
    transition,
  };
}

export function tonePillStyle(tone: 'neutral' | 'info' | 'positive' | 'warning' | 'danger'): CSSProperties {
  const tones = {
    neutral: { color: palette.muted, background: palette.panelAlt, border: palette.line },
    info: { color: palette.accentStrong, background: palette.accentSoft, border: 'transparent' },
    positive: { color: palette.positive, background: palette.positiveSoft, border: 'transparent' },
    warning: { color: palette.warning, background: palette.warningSoft, border: 'transparent' },
    danger: { color: palette.danger, background: palette.dangerSoft, border: 'transparent' },
  } as const;

  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.35rem',
    padding: '0.42rem 0.75rem',
    borderRadius: '9999px',
    border: `1px solid ${tones[tone].border}`,
    color: tones[tone].color,
    background: tones[tone].background,
    fontFamily: 'var(--font-label)',
    fontSize: '0.74rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };
}

export function noticeStyle(tone: 'warning' | 'success' | 'danger' | 'info'): CSSProperties {
  const tones = {
    warning: { background: palette.warningSoft, border: palette.warning, color: palette.warning },
    success: { background: palette.positiveSoft, border: palette.positive, color: palette.positive },
    danger: { background: palette.dangerSoft, border: palette.danger, color: palette.danger },
    info: { background: palette.accentSoft, border: palette.accentStrong, color: palette.accentStrong },
  } as const;

  return {
    padding: '0.9rem 1rem',
    borderRadius: '18px',
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
    border: `1px solid ${active ? palette.accentStrong : palette.lineStrong}`,
    background: active ? palette.accentSoft : palette.panelStrong,
    cursor: 'pointer',
    color: active ? palette.accentStrong : palette.text,
    fontSize: '0.88rem',
    fontWeight: active ? 700 : 500,
    transition,
  };
}
