import { storage, StorageKeys } from '@/core/storage';
import { instanceKey } from './known-instances';
import type { SiteSession } from './site-sessions';

/**
 * One server at a time. Everything below belongs to the server it was written
 * on, so it goes when the server changes: a station, roles or saved labels of
 * one site mean nothing on another, and the password must never be replayed
 * (biometric sign-in) against a different server.
 */
export const SERVER_SCOPED_KEYS: readonly string[] = [
  StorageKeys.cookie,
  StorageKeys.instanceUrl,
  StorageKeys.fullName,
  StorageKeys.passwordBackup,
  StorageKeys.userRoles,
  StorageKeys.userStation,
  StorageKeys.versionLastReportedOn,
  StorageKeys.boxLabelsHistory,
  StorageKeys.dispatchLocation,
];

/** The server the app is on: signed in, or last signed in to. */
export async function currentServerUrl(): Promise<string | null> {
  const [url, backup] = await Promise.all([
    storage.get(StorageKeys.instanceUrl),
    storage.get(StorageKeys.instanceUrlBackup),
  ]);
  return url || backup || null;
}

/** True when `url` is another server than the one the app was on. */
export async function isOtherServer(url: string): Promise<boolean> {
  const current = instanceKey(await currentServerUrl());
  return !!current && current !== instanceKey(url);
}

export async function clearServerData(): Promise<void> {
  await Promise.all(SERVER_SCOPED_KEYS.map((k) => storage.remove(k)));
}

/**
 * Make `url` the live site: the plain keys the API client reads on every
 * request now point at it, with its session. Another site's station, labels
 * and the like go first. Nothing of the previous site's saved session is
 * touched, so it can be switched back to without signing in.
 */
export async function activateSite(url: string, session: SiteSession): Promise<void> {
  if (await isOtherServer(url)) await clearServerData();
  await Promise.all([
    storage.set(StorageKeys.cookie, session.cookie),
    storage.set(StorageKeys.instanceUrl, url),
    storage.set(StorageKeys.instanceUrlBackup, url),
    session.email ? storage.set(StorageKeys.emailBackup, session.email) : storage.remove(StorageKeys.emailBackup),
    session.fullName ? storage.set(StorageKeys.fullName, session.fullName) : storage.remove(StorageKeys.fullName),
    storage.set(StorageKeys.userRoles, JSON.stringify(session.roles ?? [])),
  ]);
}
