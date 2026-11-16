import { callItMethod as callMethod } from '@/core/it-source/it-client';

/**
 * The IT dashboard backend (`upande_core.it_dashboard.*`). Gate: the "IT Team" role profile
 * (Administrator always passes). Calls go to the IT data source: a separately signed-in site if the developer set one
 * (see src/core/it-source), otherwise the main site. Errors arrive as standard Frappe 403/417 responses; use
 * `mapAxiosError` from '@/core/api/client' to get the message.
 */
const BASE = 'upande_core.it_dashboard';

export const itMobile = <T>(method: string, args: Record<string, unknown> = {}, get = true) =>
  callMethod<T>(`${BASE}.mobile.${method}`, args, get);
export const itDevices = <T>(method: string, args: Record<string, unknown> = {}, get = true) =>
  callMethod<T>(`${BASE}.devicelink.${method}`, args, get);
export const itUsers = <T>(method: string, args: Record<string, unknown> = {}, get = true) =>
  callMethod<T>(`${BASE}.usermgmt.${method}`, args, get);
export const itRoles = <T>(method: string, args: Record<string, unknown> = {}, get = true) =>
  callMethod<T>(`${BASE}.rolemgmt.${method}`, args, get);
export const itPerms = <T>(method: string, args: Record<string, unknown> = {}, get = true) =>
  callMethod<T>(`${BASE}.permmgmt.${method}`, args, get);
export const itAccess = <T>(method: string, args: Record<string, unknown> = {}, get = true) =>
  callMethod<T>(`${BASE}.access.${method}`, args, get);

/** The older developer API (`upande_mobile.api.*`), System Manager only. Use it only for what the IT API lacks. */
export const mobileApi = <T>(path: string, args: Record<string, unknown> = {}, get = true) =>
  callMethod<T>(`upande_mobile.api.${path}`, args, get);

/** Writes are POST. Spelled out so a call site reads as a write. */
export const post = { mobile: <T>(m: string, a: Record<string, unknown> = {}) => itMobile<T>(m, a, false), devices: <T>(m: string, a: Record<string, unknown> = {}) => itDevices<T>(m, a, false), users: <T>(m: string, a: Record<string, unknown> = {}) => itUsers<T>(m, a, false), roles: <T>(m: string, a: Record<string, unknown> = {}) => itRoles<T>(m, a, false), perms: <T>(m: string, a: Record<string, unknown> = {}) => itPerms<T>(m, a, false), access: <T>(m: string, a: Record<string, unknown> = {}) => itAccess<T>(m, a, false), mobileApi: <T>(p: string, a: Record<string, unknown> = {}) => mobileApi<T>(p, a, false) };

export type ItMeta = {
  profiles: { name: string; roles: string[]; users: number; assignable: boolean }[];
  me: string;
  is_system_manager: boolean;
};
