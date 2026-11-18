import { formatDistanceToNowStrict, isValid, format } from 'date-fns';

export type InboxRow = {
  id: string;
  app: string;
  subject: string;
  status: string;
  person: string;
  user: string;
  email: string;
  waiting: boolean;
  waiting_hours: number;
  last_activity: string;
  preview: string;
  messages: number;
  kind?: 'access';
  doctype?: string;
  ptypes?: string;
};
export type Inbox = { rows: InboxRow[]; waiting: number; statuses: string[] };

export type Msg = { id: string; from_staff: boolean; mine: boolean; by: string; text: string; sent_at: string; image?: string | null };
export type Convo = {
  id: string; app: string; subject: string; status: string; person: string; user: string; email: string;
  messages: Msg[]; statuses: string[]; device?: string; os?: string; app_version?: string;
};

export type { AccessDetail, Suggestion } from './access-model';

export const toDate = (v?: string | null) => {
  if (!v) return null;
  const d = new Date(v.replace(' ', 'T'));
  return isValid(d) ? d : null;
};

export const ago = (v?: string | null) => {
  const d = toDate(v);
  if (!d) return '';
  const t = formatDistanceToNowStrict(d, { addSuffix: true });
  return t.startsWith('0 seconds') ? 'just now' : t;
};

export const clock = (v: string) => {
  const d = toDate(v);
  return d ? format(d, 'd MMM, HH:mm') : '';
};

/** Waiting colouring: under a day green, under three days amber, longer red. */
export function waitTone(hours: number): { label: string; bg: string; fg: string } {
  const label = hours < 1 ? '<1h' : hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
  if (hours < 24) return { label, bg: '#F0FDF4', fg: '#166534' };
  if (hours < 72) return { label, bg: '#FFFBEB', fg: '#92400E' };
  return { label, bg: '#FEF2F2', fg: '#991B1B' };
}

export const apiId = (id: string) => encodeURIComponent(id);
