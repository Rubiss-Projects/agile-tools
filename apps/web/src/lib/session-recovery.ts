export const SESSION_RECOVERY_HEADER = 'x-agile-tools-session-recovery';
export const OIDC_SESSION_RECOVERY = 'oidc';
const OIDC_LOGIN_PATH = '/api/oidc/login';

interface RecoveryLocation {
  pathname: string;
  search: string;
  hash: string;
  assign(url: string): void;
}

export function buildSessionRecoveryUrl(currentPath: string): string {
  return `${OIDC_LOGIN_PATH}?next=${encodeURIComponent(currentPath)}`;
}

export async function fetchWithSessionRecovery(
  input: RequestInfo | URL,
  init?: RequestInit,
  recoveryLocation: RecoveryLocation | null =
    typeof window === 'undefined' ? null : window.location,
): Promise<Response> {
  const response = init === undefined ? await fetch(input) : await fetch(input, init);
  if (response.status !== 401 || recoveryLocation === null) return response;

  if (response.headers.get(SESSION_RECOVERY_HEADER) === OIDC_SESSION_RECOVERY) {
    const currentPath = `${recoveryLocation.pathname}${recoveryLocation.search}${recoveryLocation.hash}`;
    recoveryLocation.assign(buildSessionRecoveryUrl(currentPath));
  }

  return response;
}
