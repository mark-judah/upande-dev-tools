import { format, isValid } from 'date-fns';

/**
 * Frappe sends naive server-local strings ("2026-11-16 09:30:00.123456"). They are read as device-local
 * time, never through `toISOString` (which is UTC), so a record made now never looks hours old or new.
 */
export function parseFrappe(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value.slice(0, 19).replace(' ', 'T'));
  return isValid(d) ? d : null;
}

/** A Frappe-style local timestamp for "now", for optimistic rows. */
export const localStamp = (d: Date = new Date()) => format(d, 'yyyy-MM-dd HH:mm:ss');

/** "just now", "5m ago", "3h ago", "2d ago", "3w ago", else "12 Oct" / "12 Oct 2025". */
export function ago(value?: string | null, now: number = Date.now()): string {
  const d = parseFrappe(value);
  if (!d) return value ?? '';
  const mins = Math.max(0, Math.floor((now - d.getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 10080) return `${Math.floor(mins / 1440)}d ago`;
  if (mins < 43200) return `${Math.floor(mins / 10080)}w ago`;
  return format(d, d.getFullYear() === new Date(now).getFullYear() ? 'd MMM' : 'd MMM yyyy');
}

/** "16 Nov 2026, 09:30" */
export function fullDate(value?: string | null): string {
  const d = parseFrappe(value);
  return d ? format(d, 'd MMM yyyy, HH:mm') : '';
}

export const initials = (name: string): string => {
  const parts = name.replace(/@.*$/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

/** Shortens a long subject for the header bar. */
export const shorten = (text: string, max = 34) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}...` : text);
