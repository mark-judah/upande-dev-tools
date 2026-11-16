import { useEffect, useState } from 'react';
import { formatDistanceToNow, isValid } from 'date-fns';
import { itUsers, type ItMeta } from '../shared/it-api';

export type PersonRow = {
  name: string;
  full_name: string;
  enabled: number;
  user_type: string;
  profiles: string[];
  last_active: string;
  last_login: string;
  created: string;
  locked: string | null;
};

export type PersonDetail = PersonRow & {
  roles: string[];
  is_me: boolean;
  history: { text: string; by: string; at: string }[];
};

export type UsersResponse = {
  rows: PersonRow[];
  total: number;
  summary: { active: number; disabled: number; no_profile: number };
};

export type Profile = ItMeta['profiles'][number];

export function initials(name: string): string {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  const a = parts[0]?.[0] ?? '?';
  const b = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (a + b).toUpperCase();
}

/** "3 hours ago" from a Frappe datetime, or the fallback when there is none. */
export function ago(value?: string | null, fallback = 'Never'): string {
  if (!value) return fallback;
  const d = new Date(value.replace(' ', 'T'));
  return isValid(d) ? formatDistanceToNow(d, { addSuffix: true }) : fallback;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Joins names as "a, b and c". */
export function list(names: string[], max = 6): string {
  if (names.length === 0) return 'nothing';
  const shown = names.slice(0, max);
  const extra = names.length - shown.length;
  const head = extra > 0 ? [...shown, `${extra} more`] : shown;
  if (head.length === 1) return head[0];
  return `${head.slice(0, -1).join(', ')} and ${head[head.length - 1]}`;
}

/** Roles a person would gain by adding `profile`, given the profiles they already hold. */
export function rolesGained(profiles: Profile[], held: string[], add: string): string[] {
  const have = new Set(profiles.filter((p) => held.includes(p.name)).flatMap((p) => p.roles));
  return (profiles.find((p) => p.name === add)?.roles ?? []).filter((r) => !have.has(r));
}

/** Roles a person would lose by dropping `drop` while keeping the rest. */
export function rolesLost(profiles: Profile[], held: string[], drop: string): string[] {
  const keep = new Set(profiles.filter((p) => held.includes(p.name) && p.name !== drop).flatMap((p) => p.roles));
  return (profiles.find((p) => p.name === drop)?.roles ?? []).filter((r) => !keep.has(r));
}

const POOLS = ['abcdefghjkmnpqrstuvwxyz', 'ABCDEFGHJKLMNPQRSTUVWXYZ', '23456789', '!@#$%^&*-_=+'];

function randomInts(n: number): number[] {
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint32Array) => Uint32Array } }).crypto;
  const buf = new Uint32Array(n);
  if (c?.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < n; i++) buf[i] = Math.floor(Math.random() * 4294967296);
  return Array.from(buf);
}

/** A 16 character password with every character class, from the platform's secure random source. */
export function generatePassword(length = 16): string {
  const all = POOLS.join('');
  const r = randomInts(length * 2);
  const chars = POOLS.map((p, i) => p[r[i] % p.length]);
  for (let i = chars.length; i < length; i++) chars.push(all[r[i] % all.length]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = r[length + i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw) || !/\d/.test(pw)) return 'Mix upper case, lower case and a number.';
  return null;
}

let meCache: string | null = null;
/** The signed-in user's id, from `usermgmt.meta`, so the UI can hide what the server refuses on yourself. */
export function useMe(): string | null {
  const [me, setMe] = useState<string | null>(meCache);
  useEffect(() => {
    if (meCache) return;
    itUsers<ItMeta>('meta').then((m) => {
      meCache = m.me;
      setMe(m.me);
    }).catch(() => {});
  }, []);
  return me;
}

/** Why the server will refuse a change to this person, in words, or null when it will not. */
export function whyReadOnly(u: { locked: string | null; name: string }, me: string | null): string | null {
  if (u.locked) return u.locked;
  if (me && u.name === me) return 'This is your own account. You cannot disable it, delete it or change its role profiles.';
  return null;
}
