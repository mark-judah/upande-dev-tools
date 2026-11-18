/**
 * The app store's data as pure functions. Server: `upande_mobile.api.store.apps()` -> `{ apps: [{ app, version,
 * released, platform, size_mb, file }] }` (no icon, description, publisher, release notes or categories yet).
 * No imports: tested with `node --test`.
 */

export type StoreApp = { app: string; version: string; released: string; platform: string; size_mb: number | null; file: string };
export type StoreList = { apps: StoreApp[] };

/** What the trailing button says. Only THIS app's installed version is knowable on the phone. */
export type AppAction = 'install' | 'update' | 'installed';

export function sanitizeApps(raw: unknown): StoreApp[] {
  const list = raw && typeof raw === 'object' ? (raw as { apps?: unknown }).apps : null;
  const seen = new Set<string>();
  const out: StoreApp[] = [];
  for (const r of Array.isArray(list) ? list : []) {
    if (!r || typeof r !== 'object') continue;
    const x = r as Record<string, unknown>;
    const app = typeof x.app === 'string' ? x.app.trim() : '';
    if (!app || seen.has(app)) continue;
    seen.add(app);
    out.push({
      app,
      version: typeof x.version === 'string' ? x.version : typeof x.version === 'number' ? String(x.version) : '',
      released: typeof x.released === 'string' ? x.released : '',
      platform: typeof x.platform === 'string' && x.platform ? x.platform : 'android',
      size_mb: typeof x.size_mb === 'number' && Number.isFinite(x.size_mb) ? x.size_mb : null,
      file: typeof x.file === 'string' ? x.file : '',
    });
  }
  return out;
}

/** "Upande Sales" -> "Sales": the company prefix adds nothing on a list of the company's own apps. */
export function shortName(app: string): string {
  return app.replace(/^Upande\s+/i, '').trim() || app;
}

/** One or two letters for the icon tile: "Sales" -> "S", "Dev Tools" -> "DT". */
export function initials(app: string): string {
  const words = shortName(app).split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? '?').slice(0, 1);
  return letters.toUpperCase();
}

/** Numeric dotted-version compare: 1 when a > b, -1 when a < b, 0 when equal or unparseable. */
export function compareVersion(a: string, b: string): number {
  const pa = String(a).split(/[.+-]/).map((n) => parseInt(n, 10));
  const pb = String(b).split(/[.+-]/).map((n) => parseInt(n, 10));
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

export function actionFor(a: StoreApp, self: { name: string; version: string }): AppAction {
  if (a.app.toLowerCase() !== self.name.toLowerCase()) return 'install';
  return compareVersion(a.version, self.version) > 0 ? 'update' : 'installed';
}

export function matchesQuery(a: StoreApp, q: string): boolean {
  const t = q.trim().toLowerCase();
  return !t || a.app.toLowerCase().includes(t) || a.platform.toLowerCase().includes(t);
}

/** Filter chips worth showing: platforms only when there is more than one, "Updates" only when there is one. */
export function chipsFor(apps: StoreApp[], self: { name: string; version: string }): { key: string; label: string }[] {
  const platforms = Array.from(new Set(apps.map((a) => a.platform))).sort();
  const updates = apps.filter((a) => actionFor(a, self) === 'update').length;
  const chips = [
    ...(updates ? [{ key: 'updates', label: `Updates ${updates}` }] : []),
    ...(platforms.length > 1 ? platforms.map((p) => ({ key: `platform:${p}`, label: p[0].toUpperCase() + p.slice(1) })) : []),
  ];
  return chips.length ? [{ key: '', label: 'All' }, ...chips] : [];
}

export function applyChip(apps: StoreApp[], chip: string, self: { name: string; version: string }): StoreApp[] {
  if (chip === 'updates') return apps.filter((a) => actionFor(a, self) === 'update');
  if (chip.startsWith('platform:')) return apps.filter((a) => a.platform === chip.slice('platform:'.length));
  return apps;
}

/** "v1.4.2 · 24.5 MB" with whatever is known. */
export function metaLine(a: StoreApp): string {
  return [a.version ? `v${a.version}` : '', a.size_mb != null ? `${a.size_mb} MB` : ''].filter(Boolean).join(' · ');
}
