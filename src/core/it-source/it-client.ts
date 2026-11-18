import axios, { isAxiosError, type AxiosInstance } from 'axios';
import { followDevHost } from '@/core/api/dev-host';
import { logError, logRequest, logResponse, attachStartTime, elapsed } from '@/core/api/log';
import { getActiveEndpoint, useItInstances, type ActiveEndpoint } from './instances-store';
import { isSessionExpiredResponse } from './instances-model';

export type { ActiveEndpoint } from './instances-store';

/**
 * Thrown when an IT call is made with no active instance. The IT screens never get here in practice (ItGate shows
 * "Choose an instance" first), but nothing ever falls back to the app's main site.
 */
export class NoInstanceError extends Error {
  readonly code = 'no_instance';
  constructor() {
    super('Choose an IT instance first.');
  }
}

/**
 * Thrown in place of an answer that arrived after the developer switched instance (or signed in again): a late
 * response from instance A must never render under instance B. Screens that see it can ignore it; their subtree is
 * remounted by ItGate anyway.
 */
export class StaleInstanceError extends Error {
  readonly code = 'stale_instance';
  constructor() {
    super('The IT instance changed while this was loading.');
  }
}

export const isStaleInstanceError = (e: unknown): e is StaleInstanceError => e instanceof StaleInstanceError;

/** The active instance's endpoint, or null. Never the main site. */
export async function getItEndpoint(): Promise<ActiveEndpoint | null> {
  return getActiveEndpoint();
}

let client: AxiosInstance | null = null;

/** One axios instance for IT calls. Base URL and cookie are set per request from the endpoint captured at call time. */
function itClient(): AxiosInstance {
  if (client) return client;
  const instance = axios.create({ timeout: 30000 });
  instance.interceptors.request.use((config) => {
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
      if (isAxiosError(error)) logError(error, elapsed(error.config));
      return Promise.reject(error);
    },
  );
  client = instance;
  return instance;
}

function stillCurrent(ep: ActiveEndpoint): boolean {
  const st = useItInstances.getState();
  return st.activeId === ep.id && st.epoch === ep.epoch;
}

/**
 * Calls a whitelisted method on the ACTIVE IT instance and unwraps `{ message }`. Frappe takes list and object
 * arguments as JSON strings. A 401 (or Frappe's "session expired, carried on as Guest") marks only the instance the
 * request went to as expired. An answer that lands after a switch is discarded with `StaleInstanceError`.
 */
export async function callItMethod<T>(dotted: string, args: Record<string, unknown> = {}, get = false): Promise<T> {
  const ep = await getActiveEndpoint();
  if (!ep) throw new NoInstanceError();
  const encoded = Object.fromEntries(
    Object.entries(args)
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, typeof v === 'object' ? JSON.stringify(v) : v]),
  );
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (ep.cookie) headers.Cookie = ep.cookie;
  const baseURL = followDevHost(ep.baseUrl);
  const url = `/api/method/${dotted}`;
  try {
    const res = await itClient().request<{ message: T }>(
      get ? { method: 'GET', baseURL, url, params: encoded, headers } : { method: 'POST', baseURL, url, data: encoded, headers },
    );
    if (!stillCurrent(ep)) throw new StaleInstanceError();
    return res.data.message;
  } catch (e) {
    if (e instanceof StaleInstanceError) throw e;
    if (isAxiosError(e) && isSessionExpiredResponse(e.response?.status, e.response?.data)) {
      useItInstances.getState().markExpired(ep.id);
    }
    if (!stillCurrent(ep)) throw new StaleInstanceError();
    throw e;
  }
}
