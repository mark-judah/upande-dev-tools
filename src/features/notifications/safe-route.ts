/**
 * The only in-app paths a notification (push payload or inbox item) may open. Anything else is ignored, so a
 * malformed or hostile payload can never navigate somewhere unexpected. No imports: tested with `node --test`.
 */
export const ROUTE_ALLOWLIST: readonly string[] = [
  '/task/',
  '/request/',
  '/project/',
  '/deployments',
  '/backlog',
  '/requests',
  '/review-queue',
  '/pm-dashboard',
  '/notifications',
  '/duty',
];
// Deliberately no '/it/...' paths: notifications come from the main site, while the IT screens show whichever IT
// instance is active, so an IT link could open another site's record under the wrong instance.

const MAX_LEN = 300;

/** Returns the route when it is a plain in-app path on the allowlist, else null. */
export function safeRoute(route: unknown): string | null {
  if (typeof route !== 'string') return null;
  const r = route.trim();
  if (!r || r.length > MAX_LEN) return null;
  if (!r.startsWith('/') || r.startsWith('//') || r.includes('..') || r.includes('\\') || r.includes('://')) return null;
  // No whitespace or control characters anywhere in a path.
  if (/[\s\u0000-\u001f\u007f]/.test(r)) return null;
  if (r === '/') return r;
  return ROUTE_ALLOWLIST.some((p) => {
    if (p.endsWith('/')) {
      // '/task/' needs something after it: '/task/TASK-1', not '/task/'.
      return r.startsWith(p) && r.length > p.length && r[p.length] !== '?';
    }
    return r === p || r.startsWith(`${p}/`) || r.startsWith(`${p}?`);
  })
    ? r
    : null;
}
