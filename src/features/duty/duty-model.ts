/**
 * Duty rota as plain data: slots, change requests, dates and the checks the app makes before asking the server.
 * Works for any duty type (support first). No imports: tested with `node --test`.
 * Contract: scratchpad duty-roster-contract.md (server `upande_dev_tools.api.duty`).
 */

export type DutyType = { name: string; duty_name: string; description: string; default_cadence: string; people_per_slot: number };
export type Assignee = { user: string; full_name: string };
export type Slot = { name: string; duty_type: string; label: string; start_date: string; end_date: string; notes: string; assignees: Assignee[] };
export type Rota = { duty_type: string; slots: Slot[]; me: string; can_manage: boolean };
export type RequestType = 'Swap' | 'Replace';
export type RequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
export type ChangeRequest = {
  name: string;
  duty_type: string;
  slot: string;
  slot_label: string;
  slot_start: string;
  slot_end: string;
  request_type: RequestType;
  from_user: string;
  from_user_name: string;
  to_user: string;
  to_user_name: string;
  swap_slot: string | null;
  swap_slot_label: string | null;
  swap_slot_start: string | null;
  swap_slot_end: string | null;
  reason: string;
  status: RequestStatus;
  requested_by: string;
  requested_by_name: string;
  decided_by: string | null;
  decided_by_name: string | null;
  decision_note: string | null;
  creation: string;
};
export type Person = { user: string; full_name: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A real calendar date in YYYY-MM-DD (rejects 2026-02-30). */
export function isValidDate(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s.trim());
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** The phone's local calendar day as YYYY-MM-DD (a duty day is a local day, not a UTC one). */
export function localDay(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function parts(s: string): [number, number, number] {
  const m = DATE_RE.exec(s)!;
  return [+m[1], +m[2], +m[3]];
}

/** "16 – 22 Nov 2026", "30 Nov – 6 Dec 2026", "28 Dec 2026 – 3 Jan 2027", or one day "21 Dec 2026". */
export function formatRange(start: string, end: string): string {
  if (!isValidDate(start)) return '';
  const [y1, m1, d1] = parts(start);
  if (!isValidDate(end) || end === start) return `${d1} ${MONTHS[m1 - 1]} ${y1}`;
  const [y2, m2, d2] = parts(end);
  if (y1 !== y2) return `${d1} ${MONTHS[m1 - 1]} ${y1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  if (m1 !== m2) return `${d1} ${MONTHS[m1 - 1]} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
  return `${d1} – ${d2} ${MONTHS[m2 - 1]} ${y2}`;
}

/** Weekday for a one-day slot ("Mon"), from the date alone (no time zone involved). */
export function weekday(day: string): string {
  if (!isValidDate(day)) return '';
  const [y, m, d] = parts(day);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** What a slot is called on screen: its label, else its dates. */
export function slotTitle(s: Pick<Slot, 'label' | 'start_date' | 'end_date'>): string {
  return s.label?.trim() || formatRange(s.start_date, s.end_date);
}

export type SlotWhen = 'past' | 'current' | 'upcoming';

export function slotWhen(s: Pick<Slot, 'start_date' | 'end_date'>, today: string): SlotWhen {
  if (s.end_date < today) return 'past';
  if (s.start_date > today) return 'upcoming';
  return 'current';
}

export function sortSlots(slots: Slot[]): Slot[] {
  return [...slots].sort((a, b) => a.start_date.localeCompare(b.start_date) || a.end_date.localeCompare(b.end_date) || a.name.localeCompare(b.name));
}

/** Index of the first slot that is current or upcoming (where the list should open), or the last slot. */
export function focusIndex(slots: Slot[], today: string): number {
  const i = slots.findIndex((s) => s.end_date >= today);
  return i === -1 ? Math.max(0, slots.length - 1) : i;
}

export function isOn(s: Slot, user: string): boolean {
  return s.assignees.some((a) => a.user === user);
}

/** The current or next slot this person is on. */
export function nextDutyFor(slots: Slot[], user: string, today: string): Slot | null {
  return sortSlots(slots).find((s) => s.end_date >= today && isOn(s, user)) ?? null;
}

/** Defensive parse of a slot from the server. */
export function sanitizeSlot(raw: unknown): Slot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !isValidDate(r.start_date) || !isValidDate(r.end_date)) return null;
  const seen = new Set<string>();
  const assignees: Assignee[] = [];
  for (const a of Array.isArray(r.assignees) ? r.assignees : []) {
    const x = a as Record<string, unknown> | null;
    if (!x || typeof x.user !== 'string' || seen.has(x.user)) continue;
    seen.add(x.user);
    assignees.push({ user: x.user, full_name: typeof x.full_name === 'string' && x.full_name ? x.full_name : x.user });
  }
  return {
    name: r.name,
    duty_type: typeof r.duty_type === 'string' ? r.duty_type : '',
    label: typeof r.label === 'string' ? r.label : '',
    start_date: r.start_date as string,
    end_date: r.end_date as string,
    notes: typeof r.notes === 'string' ? r.notes : '',
    assignees,
  };
}

export type SlotDraft = { name?: string; duty_type: string; label: string; start_date: string; end_date: string; notes: string; assignees: string[] };

/** Why a slot cannot be saved, or null. */
export function slotProblem(d: SlotDraft): string | null {
  if (!d.duty_type) return 'Pick a duty type.';
  if (!isValidDate(d.start_date)) return 'Start date must be a real date, like 2026-11-16.';
  if (!isValidDate(d.end_date)) return 'End date must be a real date, like 2026-11-22.';
  if (d.end_date < d.start_date) return 'The end date is before the start date.';
  if (new Set(d.assignees).size !== d.assignees.length) return 'Someone is listed twice.';
  return null;
}

export type RequestDraft = { type: RequestType; slot: Slot | null; fromUser: string; toUser: string; swapSlot: Slot | null; reason: string };

/** Why a change request cannot be sent, or null. Mirrors the server's checks so mistakes show before sending. */
export function requestProblem(d: RequestDraft): string | null {
  if (!d.slot) return 'Pick the slot to change.';
  if (!isOn(d.slot, d.fromUser)) return 'That person is not on this slot.';
  if (!d.toUser) return d.type === 'Swap' ? 'Pick who to swap with.' : 'Pick who covers.';
  if (d.toUser === d.fromUser) return 'Pick someone else.';
  if (d.type === 'Replace' && isOn(d.slot, d.toUser)) return 'They are already on this slot.';
  if (d.type === 'Swap') {
    if (!d.swapSlot) return 'Pick the slot you take in return.';
    if (d.swapSlot.name === d.slot.name) return 'Pick a different slot to swap with.';
    if (!isOn(d.swapSlot, d.toUser)) return 'They are not on that slot.';
    if (isOn(d.swapSlot, d.fromUser)) return 'You are already on that slot.';
    if (isOn(d.slot, d.toUser)) return 'They are already on your slot.';
  }
  return null;
}

/** The slot list as it would look once a request is approved (for previews and the dev mock). */
export function applyRequest(slots: Slot[], r: Pick<ChangeRequest, 'request_type' | 'slot' | 'swap_slot' | 'from_user' | 'to_user' | 'to_user_name' | 'from_user_name'>): Slot[] {
  const to: Assignee = { user: r.to_user, full_name: r.to_user_name || r.to_user };
  const from: Assignee = { user: r.from_user, full_name: r.from_user_name || r.from_user };
  return slots.map((s) => {
    if (s.name === r.slot) return { ...s, assignees: s.assignees.map((a) => (a.user === r.from_user ? to : a)) };
    if (r.request_type === 'Swap' && s.name === r.swap_slot) return { ...s, assignees: s.assignees.map((a) => (a.user === r.to_user ? from : a)) };
    return s;
  });
}

/** One-line summary of a request: "Teddy ⇄ Mark Judah · Week 48 for Week 47". */
export function requestSummary(r: ChangeRequest): string {
  const slot = r.slot_label || formatRange(r.slot_start, r.slot_end);
  if (r.request_type === 'Swap') {
    const other = r.swap_slot_label || (r.swap_slot_start ? formatRange(r.swap_slot_start, r.swap_slot_end ?? r.swap_slot_start) : '');
    return `${r.from_user_name} swaps ${slot} with ${r.to_user_name}${other ? ` (${other})` : ''}`;
  }
  return `${r.to_user_name} covers ${r.from_user_name} on ${slot}`;
}
