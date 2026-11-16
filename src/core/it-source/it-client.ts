import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { storage, StorageKeys } from '@/core/storage';
import { callMethod } from '@/core/api/call';
import { followDevHost } from '@/core/api/dev-host';
import { logError, logRequest, logResponse, attachStartTime, elapsed } from '@/core/api/log';
import { useItSource } from './it-source-store';

export type ItEndpoint = { baseUrl: string; cookie: string | null; /** True when it is the separately configured IT source. */ custom: boolean };

/** The site the IT tools read from: the IT source if one is set, otherwise the main site the app is signed in to. */
export async function getItEndpoint(): Promise<ItEndpoint | null> {
  const st = useItSource.getState();
  if (!st.hydrated) await st.hydrate();
  const { source, cookie } = useItSource.getState();
  if (source) return { baseUrl: source.url, cookie, custom: true };
  const [baseUrl, mainCookie] = await Promise.all([storage.get(StorageKeys.instanceUrl), storage.get(StorageKeys.cookie)]);
  return baseUrl ? { baseUrl, cookie: mainCookie, custom: false } : null;
}

let client: AxiosInstance | null = null;

function itClient(): AxiosInstance {
  if (client) return client;
  const instance = axios.create({ timeout: 30000 });
  instance.interceptors.request.use(async (config) => {
    const ep = await getItEndpoint();
    if (ep) config.baseURL = followDevHost(ep.baseUrl);
    config.headers = config.headers ?? {};
    if (ep?.cookie) (config.headers as Record<string, string>).Cookie = ep.cookie;
    if (!config.headers['Content-Type']) (config.headers as Record<string, string>)['Content-Type'] = 'application/json';
    attachStartTime(config);
    logRequest(config);
    return config;
  });
  instance.interceptors.response.use(
    (res) => {
      logResponse(res, elapsed(res.config));
      return res;
    },
    (error) => {
      if (isAxiosError(error)) {
        logError(error, elapsed(error.config));
        // The separate IT session ran out: flag it so the IT screens ask for a new sign-in.
        if (error.response?.status === 401 && useItSource.getState().source) useItSource.getState().markExpired();
      }
      return Promise.reject(error);
    },
  );
  client = instance;
  return instance;
}

/**
 * Calls a whitelisted method on the IT data source (see `useItSource`). With no separate source configured
 * this is the same as `callMethod`, so the IT tools keep working on the main site with zero setup.
 */
export async function callItMethod<T>(dotted: string, args: Record<string, unknown> = {}, get = false): Promise<T> {
  const ep = await getItEndpoint();
  if (!ep?.custom) return callMethod<T>(dotted, args, get);
  const encoded = Object.fromEntries(
    Object.entries(args)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]),
  );
  const res = await itClient().request<{ message: T }>(
    get ? { method: 'GET', url: `/api/method/${dotted}`, params: encoded } : { method: 'POST', url: `/api/method/${dotted}`, data: encoded },
  );
  return res.data.message;
}
