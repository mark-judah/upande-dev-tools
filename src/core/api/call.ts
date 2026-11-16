import { api } from './client';

const BASE = '/api/method/upande_dev_tools.api';

/** Calls a whitelisted upande_dev_tools method and unwraps Frappe's `{ message }` envelope. */
export async function call<T>(method: string, args: Record<string, unknown> = {}, get = false): Promise<T> {
  const res = await api<{ message: T }>(
    get ? { method: 'GET', url: `${BASE}.${method}`, params: args } : { method: 'POST', url: `${BASE}.${method}`, data: args },
  );
  return res.message;
}

/** Calls any whitelisted method by its full dotted path (e.g. `upande_core.it_dashboard.mobile.apps`) and unwraps `{ message }`. */
export async function callMethod<T>(dotted: string, args: Record<string, unknown> = {}, get = false): Promise<T> {
  // Frappe takes list and object arguments as JSON strings.
  const encoded = Object.fromEntries(
    Object.entries(args)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]),
  );
  const res = await api<{ message: T }>(
    get
      ? { method: 'GET', url: `/api/method/${dotted}`, params: encoded }
      : { method: 'POST', url: `/api/method/${dotted}`, data: encoded },
  );
  return res.message;
}
