import { getLocalDemoDefaultPath, isLocalDemoEnabled } from '@/server/dev-demo';
import { DemoBootstrapForm } from './demo-bootstrap-form';

interface AuthRequiredPanelProps {
  title?: string;
  description?: string;
  nextPath?: string;
}

export function AuthRequiredPanel({
  title = 'Authentication required',
  description = 'This page expects the workspace session cookie used by the app.',
  nextPath = getLocalDemoDefaultPath(),
}: AuthRequiredPanelProps) {
  return (
    <main
      style={{
        padding: '3rem 1.5rem',
        maxWidth: '720px',
        margin: '0 auto',
        fontFamily: 'sans-serif',
      }}
    >
      <div
        style={{
          border: '1px solid #e5e7eb',
          borderRadius: '16px',
          padding: '1.5rem',
          background: 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
        }}
      >
        <p style={{ margin: '0 0 0.5rem', fontSize: '0.75rem', letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>
          Agile Tools
        </p>
        <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{title}</h1>
        <p style={{ margin: '0.75rem 0 0', color: '#475569', lineHeight: 1.6 }}>
          {description}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          {isLocalDemoEnabled() && (
            <DemoBootstrapForm
              label="Seed local demo workspace and continue →"
              nextPath={nextPath}
            />
          )}
          <a
            href="/"
            style={{
              padding: '0.7rem 1rem',
              borderRadius: '9999px',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              textDecoration: 'none',
              fontWeight: 600,
            }}
          >
            Open home
          </a>
        </div>
      </div>
    </main>
  );
}