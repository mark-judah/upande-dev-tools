/**
 * Work that must run while the live session still exists, just before it ends: a feature that registered something
 * on the server for this person (a push token) undoes it here, because once the cookie is gone it cannot. The auth
 * store awaits these (bounded by a timeout, so a slow network never holds up signing out). Registered by features,
 * so core/auth never imports a feature.
 */
export type SignOutReason = 'sign-out' | 'forget-device';
type Hook = (reason: SignOutReason) => Promise<void> | void;

const hooks = new Set<Hook>();

export function onBeforeSignOut(hook: Hook): () => void {
  hooks.add(hook);
  return () => {
    hooks.delete(hook);
  };
}

/** Runs every hook in parallel; errors are swallowed and the whole run gives up after `timeoutMs`. */
export async function runBeforeSignOut(reason: SignOutReason, timeoutMs = 3000): Promise<void> {
  if (!hooks.size) return;
  const all = Promise.all(
    [...hooks].map(async (h) => {
      try {
        await h(reason);
      } catch {
        // best effort
      }
    }),
  );
  await Promise.race([all, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
