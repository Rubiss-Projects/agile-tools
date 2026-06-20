'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FlowScopeOwner, WorkspaceUserSummary } from '@agile-tools/shared/contracts/api';
import { buttonStyle, fieldLabelStyle, noticeStyle, palette, selectStyle, tonePillStyle } from '@/components/app/chrome';

interface Props {
  scopeId: string;
  owners: FlowScopeOwner[];
  workspaceUsers: WorkspaceUserSummary[];
}

export function FlowScopeOwnerForm({ scopeId, owners, workspaceUsers }: Props) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const assignableUsers = useMemo(() => {
    const ownerIds = new Set(owners.map((owner) => owner.id));
    return workspaceUsers.filter((user) => !ownerIds.has(user.id));
  }, [owners, workspaceUsers]);

  async function assignOwner() {
    if (!selectedUserId) return;
    setBusyUserId(selectedUserId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/scopes/${scopeId}/owners`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceUserId: selectedUserId }),
      });
      const data = await res.json().catch(() => null) as { message?: string } | null;
      if (!res.ok) {
        setError(data?.message ?? 'Failed to assign owner.');
        return;
      }
      setSelectedUserId('');
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeOwner(workspaceUserId: string) {
    setBusyUserId(workspaceUserId);
    setError(null);
    try {
      const res = await fetch(`/api/v1/admin/scopes/${scopeId}/owners`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceUserId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { message?: string } | null;
        setError(data?.message ?? 'Failed to remove owner.');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <div style={{ display: 'grid', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {owners.length === 0 ? (
          <span style={{ color: palette.soft, fontSize: '0.88rem' }}>No owners assigned</span>
        ) : (
          owners.map((owner) => (
            <span key={owner.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
              <span style={tonePillStyle('info')}>{formatUserLabel(owner)}</span>
              <button
                type="button"
                onClick={() => { void removeOwner(owner.id); }}
                disabled={busyUserId !== null}
                style={buttonStyle('secondary', busyUserId !== null)}
              >
                Remove
              </button>
            </span>
          ))
        )}
      </div>

      {assignableUsers.length > 0 ? (
        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label style={{ minWidth: '18rem', maxWidth: '28rem', flex: '1 1 18rem' }}>
            <span style={fieldLabelStyle}>Assign owner</span>
            <select
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              disabled={busyUserId !== null}
              style={selectStyle}
            >
              <option value="">Select a workspace user</option>
              {assignableUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {formatUserLabel(user)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => { void assignOwner(); }}
            disabled={!selectedUserId || busyUserId !== null}
            style={buttonStyle('secondary', !selectedUserId || busyUserId !== null)}
          >
            Assign
          </button>
        </div>
      ) : (
        <span style={{ color: palette.soft, fontSize: '0.88rem' }}>
          No additional OIDC workspace users available
        </span>
      )}

      {error && (
        <div style={noticeStyle('danger')}>
          <p style={{ margin: 0 }}>{error}</p>
        </div>
      )}
    </div>
  );
}

function formatUserLabel(user: Pick<WorkspaceUserSummary, 'displayName' | 'email' | 'role'>): string {
  const label = user.displayName ?? user.email ?? 'Unnamed user';
  return user.role === 'admin' ? `${label} (admin)` : label;
}
