import { formatDistanceToNowStrict, isValid } from 'date-fns';

export type Health = 'low_battery' | 'low_storage' | 'offline' | 'outdated_os' | 'outdated_app';
export type DeviceState = 'Active' | 'Lost' | 'Retired';

export type DeviceUser = { user: string; name: string; first_seen: string; last_seen: string; version: string; logins: number; app: string };

export type DeviceRow = {
  id: string;
  app: string;
  owner: string;
  owner_name: string;
  device: string;
  platform: string;
  os_version: string;
  app_version: string;
  status: string;
  flags: string[];
  state: DeviceState;
  notes: string;
  last_seen: string;
  battery: number | null;
  storage_free_gb: number | null;
  network: string;
  serial_number: string;
  android_id: string;
  mac_address: string;
  local_ip: string;
  build_number: string;
  ip_seen?: string;
  users: DeviceUser[];
  test_build?: boolean;
};

export type FleetSummary = Record<Health | 'devices', number>;
export type Fleet = { rows: DeviceRow[]; total: number; summary: FleetSummary };

/** A physical device from devicelink.device_tree: the merged installs, people and links. */
export type Person = { user: string; name: string; first_seen: string; last_seen: string; logins: number; uses: { app: string; version: string }[] };
export type DeviceFull = Omit<DeviceRow, 'users'> & {
  install_ids: string[];
  apps: string[];
  installs: number;
  people: Person[];
  ids: { key: string; id: string; apps: string[]; install_ids: string[]; last_seen: string }[];
  merged: boolean;
  asset: { name: string; asset_name: string; location: string } | null;
  custodian: { id: string; name: string; via: string } | null;
  group: string;
  device_id: string;
};
export type Tree = { models: { name: string; devices: DeviceFull[] }[]; links_ready: boolean };

export const HEALTH: { key: Health; label: string; icon: string }[] = [
  { key: 'low_battery', label: 'Low battery', icon: 'battery-dead-outline' },
  { key: 'low_storage', label: 'Low storage', icon: 'save-outline' },
  { key: 'offline', label: 'Offline', icon: 'cloud-offline-outline' },
  { key: 'outdated_os', label: 'Old OS', icon: 'logo-android' },
  { key: 'outdated_app', label: 'Old app', icon: 'arrow-up-circle-outline' },
];

export const flagLabel = (f: string) => HEALTH.find((h) => h.key === f)?.label ?? f.replace(/_/g, ' ');

export const STATUS: Record<string, { label: string; tone: 'success' | 'info' | 'warn' | 'danger' | 'neutral' }> = {
  current: { label: 'Up to date', tone: 'success' },
  ahead: { label: 'Ahead', tone: 'info' },
  behind_ota: { label: 'Update ready', tone: 'warn' },
  needs_apk: { label: 'Needs new APK', tone: 'danger' },
  dormant: { label: 'Dormant', tone: 'neutral' },
  unknown: { label: 'Unknown', tone: 'neutral' },
};

export const parseDate = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(v.replace(' ', 'T'));
  return isValid(d) ? d : null;
};

/** "3 hours ago" from a Frappe datetime. */
export function ago(v?: string | null): string {
  const d = parseDate(v);
  if (!d) return 'never';
  const out = formatDistanceToNowStrict(d, { addSuffix: true });
  return out.startsWith('0 seconds') ? 'just now' : out;
}

export const batteryColor = (b: number) => (b <= 15 ? '#EF4444' : b <= 35 ? '#F59E0B' : '#22C55E');

export function matches(d: DeviceRow, q: string): boolean {
  const t = q.trim().toLowerCase();
  if (!t) return true;
  return [d.device, d.owner, d.owner_name, d.serial_number, d.android_id, d.mac_address, d.local_ip, d.id, d.app]
    .some((x) => (x || '').toLowerCase().includes(t));
}
