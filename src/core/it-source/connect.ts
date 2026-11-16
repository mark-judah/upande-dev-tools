import axios, { isAxiosError } from 'axios';
import { useItSource, type ItSource } from './it-source-store';

export type ConnectStep = 'checking' | 'signing_in' | 'verifying';

export type ConnectResult = { ok: true; source: ItSource } | { ok: false; error: string; step: ConnectStep };

const MOBILE_LOGIN = 'upande_dev_tools.api.mobile_auth.mobile_login';
const META = 'upande_core.it_dashboard.usermgmt.meta';

/** `host`, `host:port` or a full URL -> a base URL. Plain hosts get https; a local or IP address is probed and may fall back to http. */
export async function resolveBase(raw: string): Promise<string> {
  const t = raw.trim();
  if (/^https?:\/\//i.test(t)) return t.replace(/\/+$/, '');
  const host = t.replace(/\/.*$/, '');
  const local = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/.test(host) || /:\d+$/.test(host) || /^localhost(:\d+)?$/i.test(host) || /\.local$/i.test(host);
  if (!local) return `https://${t.replace(/\/+$/, '')}`;
  try {
    await axios.get(`https://${t}/api/method/ping`, { timeout: 4000 });
    return `https://${t.replace(/\/+$/, '')}`;
  } catch {
    return `http://${t.replace(/\/+$/, '')}`;
  }
}

function friendly(e: unknown): string {
  if (isAxiosError(e)) {
    if (!e.response) return 'Could not reach the site. Check the address, your network, and that it allows connections from this device.';
    const data = e.response.data as { _server_messages?: string; message?: string; exc_type?: string } | string | undefined;
    if (typeof data === 'string' && /<html/i.test(data)) return 'That address is not a Frappe site.';
    if (data && typeof data === 'object') {
      if (data._server_messages) {
        try {
          const first = JSON.parse(JSON.parse(data._server_messages)[0]) as { message?: string };
          if (first.message) return first.message.replace(/<[^>]+>/g, '').trim();
        } catch {
          // fall through
        }
      }
      if (data.message) return String(data.message);
      if (data.exc_type) return data.exc_type;
    }
    return `The site answered with an error (${e.response.status}).`;
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

/** Pulls `sid=...` out of a Set-Cookie header (RN exposes it on Android and iOS, not on web). */
function sidFromSetCookie(h: unknown): string | null {
  const joined = Array.isArray(h) ? h.join('; ') : typeof h === 'string' ? h : '';
  const m = /(?:^|[;,\s])sid=([^;,\s]+)/.exec(joined);
  return m && m[1] && m[1] !== 'Guest' ? `sid=${m[1]}` : null;
}

/**
 * Signs in to a site for the IT tools only (a second session, separate from the main one):
 * 1) reach the site, 2) log in (the dev tools mobile login when the site has it, otherwise the standard login),
 * 3) confirm this account is allowed to use the IT dashboard there. Nothing is saved unless all three pass.
 */
export async function connectItSource(
  rawUrl: string,
  email: string,
  password: string,
  onStep?: (s: ConnectStep) => void,
): Promise<ConnectResult> {
  let base: string;
  try {
    onStep?.('checking');
    base = await resolveBase(rawUrl);
    await axios.get(`${base}/api/method/ping`, { timeout: 10000 });
  } catch (e) {
    return { ok: false, step: 'checking', error: friendly(e) };
  }

  let cookie: string | null = null;
  let fullName: string | null = null;
  try {
    onStep?.('signing_in');
    const form = new URLSearchParams({ usr: email, pwd: password }).toString();
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    try {
      const res = await axios.post(`${base}/api/method/${MOBILE_LOGIN}`, form, { headers, timeout: 20000 });
      const msg = res.data?.message as { sid?: string; full_name?: string } | undefined;
      if (msg?.sid) {
        cookie = `sid=${msg.sid}`;
        fullName = msg.full_name ?? null;
      }
    } catch (e) {
      // 401/403 means the credentials were refused; anything else (e.g. 404/417 'not installed') means this
      // site lacks the dev tools login, so use the standard one.
      if (isAxiosError(e) && (e.response?.status === 401 || e.response?.status === 403)) throw e;
    }
    if (!cookie) {
      const res = await axios.post(`${base}/api/method/login`, form, { headers, timeout: 20000 });
      cookie = sidFromSetCookie(res.headers['set-cookie']);
      fullName = (res.data?.full_name as string | undefined) ?? null;
      if (!cookie) {
        return {
          ok: false,
          step: 'signing_in',
          error: 'Signed in, but the site did not hand back a session this app can use. Ask for the Upande Dev Tools app to be installed on it.',
        };
      }
    }
  } catch (e) {
    const status = isAxiosError(e) ? e.response?.status : 0;
    return { ok: false, step: 'signing_in', error: status === 401 || status === 403 ? 'Wrong email or password for that site.' : friendly(e) };
  }

  try {
    onStep?.('verifying');
    await axios.get(`${base}/api/method/${META}`, { headers: { Cookie: cookie }, timeout: 20000 });
  } catch (e) {
    const status = isAxiosError(e) ? e.response?.status : 0;
    if (status === 403) return { ok: false, step: 'verifying', error: 'Signed in, but that account is not on the IT Team on this site. Ask an administrator to add it.' };
    if (status === 404 || (isAxiosError(e) && /not installed|has no attribute|Failed to get method/i.test(JSON.stringify(e.response?.data ?? '')))) {
      return { ok: false, step: 'verifying', error: 'That site does not have the IT dashboard (upande_core) installed.' };
    }
    return { ok: false, step: 'verifying', error: friendly(e) };
  }

  const source: ItSource = { url: base, email, fullName, connectedAt: Date.now() };
  await useItSource.getState().connect(source, cookie);
  return { ok: true, source };
}
