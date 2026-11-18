/**
 * The access-request panel's data, normalised at the boundary. The server (`upande_core.it_dashboard.access.detail`)
 * sends `suggested` as `[{ role, gives: [ptype...], all: bool }]`, best first: manageable roles that already give some
 * of what was asked, `all` meaning the role covers everything needed (with dependencies). `grant(name, ptypes, role)`
 * refuses a role that does not cover everything, so only `all` roles can be chosen; otherwise a new role is made.
 * No imports: tested with `node --test`.
 */

export type Suggestion = { role: string; gives: string[]; all: boolean };

export type AccessDetail = {
  id: string; status: string; closed: boolean; person: string; user: string; enabled: boolean;
  doctype: string; doctype_exists: boolean; document: string; asked: string[]; lacking: string[];
  have: Record<string, boolean>; reason: string; roles_now: string[]; profiles_now: string[];
  suggested: Suggestion[]; new_role: string; new_role_exists: boolean; refusal: string | null;
};

const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** One suggestion, from the object the server sends (or a bare role name, as older servers did). */
export function toSuggestion(v: unknown): Suggestion | null {
  if (typeof v === 'string') return v ? { role: v, gives: [], all: true } : null;
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const role = str(o.role);
  if (!role) return null;
  return { role, gives: strs(o.gives), all: o.all === true || o.all === 1 };
}

export function normalizeAccessDetail(raw: unknown): AccessDetail {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const have: Record<string, boolean> = {};
  if (r.have && typeof r.have === 'object' && !Array.isArray(r.have)) {
    for (const [k, v] of Object.entries(r.have as Record<string, unknown>)) have[k] = !!v;
  }
  const seen = new Set<string>();
  const suggested: Suggestion[] = [];
  for (const x of Array.isArray(r.suggested) ? r.suggested : []) {
    const sg = toSuggestion(x);
    if (sg && !seen.has(sg.role)) {
      seen.add(sg.role);
      suggested.push(sg);
    }
  }
  return {
    id: str(r.id),
    status: str(r.status),
    closed: !!r.closed,
    person: str(r.person) || str(r.user),
    user: str(r.user),
    enabled: r.enabled !== false && r.enabled !== 0,
    doctype: str(r.doctype),
    doctype_exists: r.doctype_exists !== false,
    document: str(r.document),
    asked: strs(r.asked),
    lacking: strs(r.lacking),
    have,
    reason: str(r.reason),
    roles_now: strs(r.roles_now),
    profiles_now: strs(r.profiles_now),
    suggested,
    new_role: str(r.new_role),
    new_role_exists: !!r.new_role_exists,
    refusal: str(r.refusal) || null,
  };
}

/** The role picked by default: the best one that covers everything, else null (a new role is made). */
export function defaultRole(list: Suggestion[]): string | null {
  return list.find((s) => s.all)?.role ?? null;
}
