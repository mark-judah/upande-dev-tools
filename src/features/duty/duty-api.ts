import { isAxiosError } from 'axios';
import { callMethod } from '@/core/api/call';
import { applyRequest, sanitizeSlot, sortSlots, type ChangeRequest, type DutyType, type Person, type RequestType, type Rota, type Slot, type SlotDraft } from './duty-model';

/**
 * Duty rota endpoints on the MAIN site (`upande_dev_tools.api.duty`, see duty-roster-contract.md). Until the server
 * ships them they answer 404 / "method not found": `DutyUnavailable` lets the screen say so instead of erroring.
 * Development: EXPO_PUBLIC_MOCK_DUTY=1 (dev builds only) serves the owner's PDF rota from memory.
 */
const BASE = 'upande_dev_tools.api.duty';

export class DutyUnavailable extends Error {
  readonly code = 'duty_unavailable';
  constructor() {
    super('The duty rota is not available on this server yet.');
  }
}

function missing(e: unknown): boolean {
  if (!isAxiosError(e) || !e.response) return false;
  if (e.response.status === 404) return true;
  const text = JSON.stringify(e.response.data ?? '');
  return /Failed to get method|No module named|ModuleNotFoundError|has no attribute/.test(text) && /duty/.test(text);
}

async function guarded<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (missing(e)) throw new DutyUnavailable();
    throw e;
  }
}

const MOCK = __DEV__ && process.env.EXPO_PUBLIC_MOCK_DUTY === '1';
const get = <T>(m: string, args: Record<string, unknown> = {}) => guarded(() => callMethod<T>(`${BASE}.${m}`, args, true));
const post = <T>(m: string, args: Record<string, unknown> = {}) => guarded(() => callMethod<T>(`${BASE}.${m}`, args));

export const dutyApi = {
  types: (): Promise<DutyType[]> => (MOCK ? mock.types() : get<DutyType[]>('duty_types').then((r) => (Array.isArray(r) ? r : []))),
  rota: async (dutyType: string): Promise<Rota> => {
    const raw = MOCK ? await mock.rota(dutyType) : await get<Rota>('rota', { duty_type: dutyType });
    const slots = sortSlots((Array.isArray(raw?.slots) ? raw.slots : []).map(sanitizeSlot).filter((s): s is Slot => !!s));
    return { duty_type: dutyType, slots, me: typeof raw?.me === 'string' ? raw.me : '', can_manage: !!raw?.can_manage };
  },
  requests: (dutyType: string): Promise<ChangeRequest[]> =>
    MOCK ? mock.requests(dutyType) : get<ChangeRequest[]>('change_requests', { duty_type: dutyType }).then((r) => (Array.isArray(r) ? r : [])),
  people: (search?: string): Promise<Person[]> => (MOCK ? mock.people(search) : get<Person[]>('people', { search: search || undefined }).then((r) => (Array.isArray(r) ? r : []))),
  requestChange: (a: { slot: string; request_type: RequestType; to_user: string; from_user?: string; swap_slot?: string | null; reason?: string }) =>
    MOCK ? mock.requestChange(a) : post<ChangeRequest>('request_change', a),
  cancel: (name: string) => (MOCK ? mock.decide(name, 'Cancelled') : post<ChangeRequest>('cancel_request', { name })),
  decide: (name: string, approve: boolean, note?: string) =>
    MOCK ? mock.decide(name, approve ? 'Approved' : 'Rejected', note) : post<ChangeRequest>('decide', { name, approve: approve ? 1 : 0, note: note || undefined }),
  saveSlot: (d: SlotDraft) => (MOCK ? mock.saveSlot(d) : post<Slot>('save_slot', { slot: d })),
  deleteSlot: (name: string) => (MOCK ? mock.deleteSlot(name) : post<{ deleted: number }>('delete_slot', { name })),
};

/** In-memory server shaped like the contract, seeded with the owner's PDF (dev only). */
const mock = (() => {
  const wait = () => new Promise((r) => setTimeout(r, 300));
  const ME = 'mark@upande.com';
  const names = ['Mark Judah', 'Teresiah', 'Teddy', 'Jennifer', 'Otieno', 'Wilfred', 'Wycliffe', 'Rose', 'James', 'Bavin', 'Ivy', 'Stephene', 'Esperance', 'Shadrack', 'Brian', 'Austin', 'Mandi', 'Steve Kinyanjui'];
  const email = (n: string) => (n === 'Mark Judah' ? ME : `${n.split(' ')[0].toLowerCase()}@upande.com`);
  const person = (n: string) => ({ user: email(n), full_name: n });
  let seq = 0;
  let slots: Slot[] = [];
  const add = (label: string, start: string, end: string, who: string[]) =>
    slots.push({ name: `DUTY-SLOT-${String(++seq).padStart(5, '0')}`, duty_type: 'Support', label, start_date: start, end_date: end, notes: '', assignees: who.map(person) });
  add('Week 47', '2026-11-16', '2026-11-22', ['Mark Judah', 'Teresiah']);
  add('Week 48', '2026-11-23', '2026-11-29', ['Teddy', 'Jennifer', 'Otieno']);
  add('Week 49', '2026-11-30', '2026-12-06', ['Wilfred', 'Wycliffe', 'Rose']);
  add('Week 50', '2026-12-07', '2026-12-13', ['James', 'Bavin', 'Ivy']);
  add('Week 51', '2026-12-14', '2026-12-20', ['Stephene', 'Esperance', 'Shadrack']);
  const daily: [string, string[]][] = [
    ['2026-12-21', ['Brian', 'Austin', 'Mandi']], ['2026-12-22', ['Teddy', 'Teresiah', 'Steve Kinyanjui']], ['2026-12-23', ['Mark Judah', 'Jennifer', 'Otieno']],
    ['2026-12-24', ['Wilfred', 'Wycliffe', 'Rose']], ['2026-12-25', ['Wilfred', 'Bavin', 'Ivy']], ['2026-12-26', ['Stephene', 'Esperance', 'Shadrack']],
    ['2026-12-27', ['Brian', 'Austin', 'Mandi']], ['2026-12-28', ['Teddy', 'Teresiah', 'Steve Kinyanjui']], ['2026-12-29', ['Mark Judah', 'Jennifer', 'Otieno']],
    ['2026-12-30', ['James', 'Wycliffe', 'Rose']], ['2026-12-31', ['James', 'Bavin', 'Ivy']], ['2027-01-01', ['Stephene', 'Esperance', 'Shadrack']],
    ['2027-01-02', ['Brian', 'Austin', 'Mandi']], ['2027-01-03', ['Teddy', 'Teresiah', 'Steve Kinyanjui']],
  ];
  daily.forEach(([d, who]) => add('', d, d, who));
  let reqs: ChangeRequest[] = [];
  const find = (n: string) => slots.find((s) => s.name === n);
  return {
    async types(): Promise<DutyType[]> {
      await wait();
      return [
        { name: 'Support', duty_name: 'Support', description: 'First line for user support and incidents', default_cadence: 'Weekly', people_per_slot: 3 },
        { name: 'Release watch', duty_name: 'Release watch', description: 'Watches deployments after hours', default_cadence: 'Weekly', people_per_slot: 1 },
      ];
    },
    async rota(dutyType: string) {
      await wait();
      return { duty_type: dutyType, slots: slots.filter((s) => s.duty_type === dutyType), me: ME, can_manage: true };
    },
    async requests(dutyType: string) {
      await wait();
      return reqs.filter((r) => r.duty_type === dutyType);
    },
    async people(search?: string) {
      await wait();
      const q = (search ?? '').toLowerCase();
      return names.map(person).filter((p) => !q || p.full_name.toLowerCase().includes(q));
    },
    async requestChange(a: { slot: string; request_type: RequestType; to_user: string; from_user?: string; swap_slot?: string | null; reason?: string }) {
      await wait();
      const s = find(a.slot);
      if (!s) throw new Error('Slot not found');
      const sw = a.swap_slot ? find(a.swap_slot) : undefined;
      const nameOf = (u: string) => names.map(person).find((p) => p.user === u)?.full_name ?? u;
      const from = a.from_user ?? ME;
      const r: ChangeRequest = {
        name: `DUTY-REQ-${String(reqs.length + 1).padStart(5, '0')}`, duty_type: s.duty_type, slot: s.name, slot_label: s.label, slot_start: s.start_date, slot_end: s.end_date,
        request_type: a.request_type, from_user: from, from_user_name: nameOf(from), to_user: a.to_user, to_user_name: nameOf(a.to_user),
        swap_slot: sw?.name ?? null, swap_slot_label: sw?.label ?? null, swap_slot_start: sw?.start_date ?? null, swap_slot_end: sw?.end_date ?? null,
        reason: a.reason ?? '', status: 'Pending', requested_by: ME, requested_by_name: 'Mark Judah', decided_by: null, decided_by_name: null, decision_note: null, creation: new Date().toISOString(),
      };
      reqs = [r, ...reqs];
      return r;
    },
    async decide(name: string, status: 'Approved' | 'Rejected' | 'Cancelled', note?: string) {
      await wait();
      const r = reqs.find((x) => x.name === name);
      if (!r || r.status !== 'Pending') throw new Error('This request is no longer pending.');
      if (status === 'Approved') slots = applyRequest(slots, r);
      const next = { ...r, status, decided_by: ME, decided_by_name: 'Mark Judah', decision_note: note ?? null };
      reqs = reqs.map((x) => (x.name === name ? next : x));
      return next;
    },
    async saveSlot(d: SlotDraft) {
      await wait();
      const assignees = d.assignees.map((u) => names.map(person).find((p) => p.user === u) ?? { user: u, full_name: u });
      const slot: Slot = { name: d.name ?? `DUTY-SLOT-${String(++seq).padStart(5, '0')}`, duty_type: d.duty_type, label: d.label, start_date: d.start_date, end_date: d.end_date, notes: d.notes, assignees };
      slots = d.name ? slots.map((s) => (s.name === d.name ? slot : s)) : [...slots, slot];
      return slot;
    },
    async deleteSlot(name: string) {
      await wait();
      if (reqs.some((r) => r.status === 'Pending' && (r.slot === name || r.swap_slot === name))) throw new Error('A pending request points at this slot. Decide it first.');
      slots = slots.filter((s) => s.name !== name);
      return { deleted: 1 };
    },
  };
})();
