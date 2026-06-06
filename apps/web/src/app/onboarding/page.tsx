import { CreateOrganization, OrganizationList } from '@clerk/nextjs';
import { redirect } from 'next/navigation';
import { getPrismaClient, getWorkspaceByClerkOrgId } from '@agile-tools/db';
import { getConfig, isHostedMode } from '@agile-tools/shared';

import { getHostedClerkIdentity } from '@/server/auth';
import {
  eyebrowStyle,
  heroCardStyle,
  heroCopyStyle,
  heroTitleStyle,
  pageShellStyle,
  sectionCardStyle,
  sectionCopyStyle,
  sectionTitleStyle,
} from '@/components/app/chrome';
import { WorkspaceOnboardingForm } from '@/components/hosted/workspace-onboarding-form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  if (!isHostedMode(getConfig())) {
    redirect('/');
  }

  const identity = await getHostedClerkIdentity();
  if (!identity) {
    redirect('/');
  }

  if (!identity.orgId) {
    return (
      <main style={{ ...pageShellStyle, maxWidth: '960px' }}>
        <section style={heroCardStyle}>
          <p style={eyebrowStyle}>Hosted Setup</p>
          <h1 style={heroTitleStyle}>Choose an organization</h1>
          <p style={heroCopyStyle}>Hosted Agile Tools requires an active Clerk organization before a workspace can be created.</p>
        </section>
        <section style={{ ...sectionCardStyle, marginTop: '1.5rem' }}>
          <h2 style={sectionTitleStyle}>Organizations</h2>
          <p style={sectionCopyStyle}>Create a new organization or switch into an existing one.</p>
          <div style={{ display: 'grid', gap: '1.5rem', marginTop: '1rem' }}>
            <OrganizationList hidePersonal />
            <CreateOrganization />
          </div>
        </section>
      </main>
    );
  }

  const workspace = await getWorkspaceByClerkOrgId(getPrismaClient(), identity.orgId);
  if (workspace) {
    redirect('/');
  }

  return (
    <main style={{ ...pageShellStyle, maxWidth: '840px' }}>
      <section style={heroCardStyle}>
        <p style={eyebrowStyle}>Hosted Setup</p>
        <h1 style={heroTitleStyle}>Create workspace</h1>
        <p style={heroCopyStyle}>This creates the Agile Tools workspace linked to the active Clerk organization.</p>
      </section>
      <section style={{ ...sectionCardStyle, marginTop: '1.5rem' }}>
        <WorkspaceOnboardingForm defaultName="Agile Tools Workspace" />
      </section>
    </main>
  );
}
