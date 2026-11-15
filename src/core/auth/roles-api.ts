import { api } from '@/core/api/client';

type SessionContext = { email?: string; full_name?: string; roles?: string[] };

export async function fetchSessionContext(): Promise<SessionContext> {
  const res = await api<{ message?: SessionContext }>({
    method: 'POST',
    url: '/api/method/upande_dev_tools.api.mobile_auth.get_session_context',
  });
  return res.message ?? {};
}

export async function fetchCurrentUserRoles(): Promise<string[]> {
  const ctx = await fetchSessionContext();
  return Array.isArray(ctx.roles) ? ctx.roles : [];
}

/** A person's name as the app shows it: each word capitalised ("james tinega",
 *  "JAMES TINEGA" -> "James Tinega"); a word already in mixed case ("McDonald")
 *  is left alone. */
export function capitalizeName(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((w) => {
      const plain = w === w.toLowerCase() || w === w.toUpperCase() ? w.toLowerCase() : w;
      return plain.replace(/(^|[-'])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase());
    })
    .join(' ');
}

/** `capitalizeName` for anything that is a name; an email or blank passes as is.
 *  A comma-separated list of names is capitalised name by name. */
export function displayName<T extends string | null | undefined>(value: T): T {
  if (!value || value.includes('@')) return value;
  return value
    .split(',')
    .map((n) => capitalizeName(n))
    .join(', ') as T;
}

/** A stored "full name" that is really an email (or blank) needs replacing. */
export function needsRealName(fullName: string | null | undefined): boolean {
  return !fullName || fullName.includes('@');
}
