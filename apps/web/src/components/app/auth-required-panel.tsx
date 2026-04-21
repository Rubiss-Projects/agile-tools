import { getLocalDemoDefaultPath, isLocalDemoEnabled } from '@/server/dev-demo';
import { getLocalAdminDefaultPath, isLocalAdminBootstrapAvailable } from '@/server/local-bootstrap';
import { LocalBootstrapForm } from './demo-bootstrap-form';
import {
  buttonStyle,
  eyebrowStyle,
  heroCopyStyle,
  heroTitleStyle,
  pageShellStyle,
  sectionCardStyle,
} from './chrome';

interface AuthRequiredPanelProps {
  title?: string;
  description?: string;
  demoNextPath?: string;
  adminNextPath?: string;
  showDemoBootstrap?: boolean;
  showAdminBootstrap?: boolean;
}

export function AuthRequiredPanel({
  title = 'Authentication required',
  description = 'This page expects the workspace session cookie used by the app.',
  demoNextPath = getLocalDemoDefaultPath(),
  adminNextPath = getLocalAdminDefaultPath(),
  showDemoBootstrap = true,
  showAdminBootstrap = true,
}: AuthRequiredPanelProps) {
  const adminBootstrapEnabled = showAdminBootstrap && isLocalAdminBootstrapAvailable();
  const demoBootstrapEnabled = showDemoBootstrap && isLocalDemoEnabled();

  return (
    <main style={{ ...pageShellStyle, maxWidth: '760px' }}>
      <div style={sectionCardStyle}>
        <p style={{ ...eyebrowStyle, marginBottom: '0.5rem' }}>
          Agile Tools
        </p>
        <h1 style={{ ...heroTitleStyle, marginTop: 0, fontSize: 'clamp(2rem, 5vw, 2.6rem)' }}>{title}</h1>
        <p style={{ ...heroCopyStyle, marginTop: '0.75rem' }}>
          {description}
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '1.25rem' }}>
          {adminBootstrapEnabled && (
            <LocalBootstrapForm
              label="Create local admin session and continue →"
              nextPath={adminNextPath}
              mode="admin"
            />
          )}
          {demoBootstrapEnabled && (
            <LocalBootstrapForm
              label="Seed local demo workspace and continue →"
              nextPath={demoNextPath}
              mode="demo"
              variant={adminBootstrapEnabled ? 'secondary' : 'primary'}
            />
          )}
          <a
            href="/"
            style={{
              ...buttonStyle('secondary'),
              display: 'inline-flex',
              alignItems: 'center',
              textDecoration: 'none',
            }}
          >
            Open home
          </a>
        </div>
      </div>
    </main>
  );
}
