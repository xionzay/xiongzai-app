// In-memory notification only: no credentials, user data or persistent storage.
const listeners = new Set<() => void>();
let refreshRevision = 0;
let refreshInFlight: Promise<boolean> | null = null;

export function userSessionRefreshRevision() { return refreshRevision; }

// Refresh cookies rotate server-side. Parallel protected reads must not each
// rotate the same cookie; a late 401 can reuse a refresh completed since it began.
export async function refreshUserSession(observedRevision: number, refresh: () => Promise<boolean>) {
  if (observedRevision !== refreshRevision) return true;
  if (refreshInFlight) return refreshInFlight;
  const pending = Promise.resolve().then(refresh).then(ok => {
    if (ok) refreshRevision++;
    return ok;
  });
  refreshInFlight = pending;
  try { return await pending; }
  finally { if (refreshInFlight === pending) refreshInFlight = null; }
}

export function subscribeUserSessionExpiry(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function emitUserSessionExpiry() {
  for (const listener of listeners) listener();
}
