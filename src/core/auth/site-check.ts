import axios, { isAxiosError } from 'axios';
import { probeBaseUrl } from './api';
import { instanceLabel } from './known-instances';

const CONTEXT_METHOD = '/api/method/upande_dev_tools.api.mobile_auth.get_session_context';

/** `host`, `host:port` or `https://host[/anything]` as a bare address (scheme kept only when typed). */
export function cleanSiteInput(raw: string): string {
  let v = String(raw ?? '').trim();
  v = v.replace(/\s+/g, '');
  const m = /^(https?:\/\/)?([^/?#]*)/i.exec(v);
  if (!m) return '';
  return `${(m[1] ?? '').toLowerCase()}${m[2]}`.replace(/\/+$/, '');
}

const isLocalHost = (host: string) =>
  /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || /^localhost$/i.test(host) || /\.local$/i.test(host);

export type SiteCheck =
  | { ok: true; baseUrl: string; host: string }
  | { ok: false; message: string };

/**
 * Is there a Frappe site with Upande Dev Tools at this address? Two quiet,
 * read-only calls: `ping`, then the session-context method as a guest. A
 * guest is refused (403) by a site that has the method and told it does not
 * exist (417/404) by one that does not, which tells the two apart without
 * signing in.
 */
export async function checkSite(raw: string): Promise<SiteCheck> {
  const typed = cleanSiteInput(raw);
  if (!typed || /^https?:\/\/$/i.test(typed)) {
    return { ok: false, message: 'Type the address of your site, like your-site.upande.com.' };
  }
  const hostOnly = typed.replace(/^https?:\/\//i, '');
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/i.test(hostOnly)) {
    return { ok: false, message: "That doesn't look like a site address. Use a host such as your-site.upande.com or 192.168.1.5:8000." };
  }
  const bare = hostOnly.replace(/:\d+$/, '');
  const label = instanceLabel(typed);

  let base: string;
  try {
    base = await probeBaseUrl(typed);
  } catch {
    return { ok: false, message: `Couldn't reach ${label}.` };
  }

  let ping;
  try {
    ping = await axios.get(`${base}/api/method/ping`, {
      timeout: 10000,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: (d) => d,
    });
  } catch (e) {
    const timedOut = isAxiosError(e) && e.code === 'ECONNABORTED';
    if (/^http:\/\//i.test(base) && !isLocalHost(bare)) {
      return { ok: false, message: `${label} requires https. Public sites are not reachable over plain http, so use https://${hostOnly}.` };
    }
    return {
      ok: false,
      message: timedOut
        ? `${label} took too long to answer. Check the address and your connection.`
        : `Couldn't reach ${label}. Check the address (and port), and that you are online or on the same network.`,
    };
  }

  const body = String(ping.data ?? '');
  if (ping.status === 503 || /SessionStopped/.test(body)) {
    return { ok: false, message: `${label} is being updated right now. Try again in a few minutes.` };
  }
  const isPong = ping.status === 200 && /"message"\s*:\s*"pong"/.test(body);
  if (!isPong) {
    return {
      ok: false,
      message: `${label} answered, but it isn't a Frappe site. Check the address and use the Frappe web port.`,
    };
  }

  try {
    const ctx = await axios.post(`${base}${CONTEXT_METHOD}`, null, {
      timeout: 10000,
      validateStatus: () => true,
      responseType: 'text',
      transformResponse: (d) => d,
    });
    const text = String(ctx.data ?? '');
    const missing =
      ctx.status === 404 ||
      ctx.status === 417 ||
      /Failed to get method|AttributeError|ModuleNotFoundError/.test(text);
    if (missing) {
      return { ok: false, message: `Upande Dev Tools is not installed on ${label}. Ask an administrator to install it, then check again.` };
    }
  } catch {
    // Ping worked a moment ago; a blip here should not block adding the site.
  }
  return { ok: true, baseUrl: base, host: instanceLabel(base) };
}

export type SessionCheck =
  | { state: 'valid'; roles: string[]; fullName: string | null; email: string | null }
  | { state: 'expired' }
  | { state: 'unreachable' };

/** Is this saved cookie still a live session? Does not touch the active site. */
export async function verifySession(url: string, cookie: string): Promise<SessionCheck> {
  try {
    const res = await axios.post(`${url.replace(/\/+$/, '')}${CONTEXT_METHOD}`, null, {
      timeout: 12000,
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      validateStatus: () => true,
    });
    if (res.status === 401 || res.status === 403) return { state: 'expired' };
    if (res.status >= 500 || res.status === 404 || res.status === 417) return { state: 'unreachable' };
    const m = (res.data?.message ?? {}) as { email?: string; full_name?: string; roles?: string[] };
    if (m.email === 'Guest') return { state: 'expired' };
    return {
      state: 'valid',
      roles: Array.isArray(m.roles) ? m.roles : [],
      fullName: m.full_name || null,
      email: m.email || null,
    };
  } catch {
    return { state: 'unreachable' };
  }
}
