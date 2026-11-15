import { api } from './client';

const BASE = '/api/method/upande_dev_tools.api';

/** Calls a whitelisted upande_dev_tools method and unwraps Frappe's `{ message }` envelope. */
export async function call<T>(method: string, args: Record<string, unknown> = {}, get = false): Promise<T> {
  const res = await api<{ message: T }>(
    get ? { method: 'GET', url: `${BASE}.${method}`, params: args } : { method: 'POST', url: `${BASE}.${method}`, data: args },
  );
  return res.message;
}
