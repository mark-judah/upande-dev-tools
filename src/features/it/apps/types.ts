export type AppRow = {
  app: string;
  version: string;
  released_days_ago: number | null;
  people: number;
  current: number;
  behind: number;
  away: number;
  adoption: number | null;
  problems: number;
  people_hurt: number;
  open_tickets: number;
};

export type Inline = { k: string; v?: string };
export type NoteBlock = { t: 'h' | 'p' | 'ul'; level?: number; inline?: Inline[]; items?: Inline[][] };

export type Release = {
  tag: string;
  version: string;
  name: string;
  published_at: string;
  kind: 'apk' | 'ota';
  apk_size: number | null;
  latest: boolean;
  notes: NoteBlock[];
};

export type Overview = {
  version: { latest_version: string; latest_apk_version: string; summary: string; published_at: string };
  github: { repo_set: boolean; releases: Release[]; error: string; checked_at: string; whats_new: string };
  refresh_cooldown: number;
};

export type Installer = { user: string; name: string; team: string; version: string; bucket: string; device: string; last_seen: string };
