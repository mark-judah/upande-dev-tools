// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { applyRequest, focusIndex, formatRange, isValidDate, nextDutyFor, requestProblem, sanitizeSlot, slotProblem, slotWhen, sortSlots, weekday } from '../src/features/duty/duty-model.ts';

const P = (u) => ({ user: u, full_name: u.toUpperCase() });
const slot = (name, start, end, users, label = '') => ({ name, duty_type: 'Support', label, start_date: start, end_date: end, notes: '', assignees: users.map(P) });
const w47 = slot('s47', '2026-11-16', '2026-11-22', ['mark', 'teresiah'], 'Week 47');
const w48 = slot('s48', '2026-11-23', '2026-11-29', ['teddy', 'jennifer', 'otieno'], 'Week 48');
const d21 = slot('d21', '2026-12-21', '2026-12-21', ['brian', 'austin', 'mandi']);

test('dates', () => {
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-11-16'), true);
  assert.equal(formatRange('2026-11-16', '2026-11-22'), '16 – 22 Nov 2026');
  assert.equal(formatRange('2026-11-30', '2026-12-06'), '30 Nov – 6 Dec 2026');
  assert.equal(formatRange('2026-12-28', '2027-01-03'), '28 Dec 2026 – 3 Jan 2027');
  assert.equal(formatRange('2026-12-21', '2026-12-21'), '21 Dec 2026');
  assert.equal(weekday('2026-12-25'), 'Fri');
});

test('when, sorting, focus and next duty', () => {
  assert.equal(slotWhen(w47, '2026-11-18'), 'current');
  assert.equal(slotWhen(w47, '2026-11-23'), 'past');
  assert.equal(slotWhen(w48, '2026-11-18'), 'upcoming');
  const sorted = sortSlots([d21, w48, w47]);
  assert.deepEqual(sorted.map((s) => s.name), ['s47', 's48', 'd21']);
  assert.equal(focusIndex(sorted, '2026-11-24'), 1);
  assert.equal(focusIndex(sorted, '2027-02-01'), 2);
  assert.equal(nextDutyFor(sorted, 'mark', '2026-11-18').name, 's47');
  assert.equal(nextDutyFor(sorted, 'mark', '2026-11-23'), null);
});

test('sanitizeSlot drops bad rows and duplicate assignees', () => {
  assert.equal(sanitizeSlot({ name: 'x', start_date: 'bad', end_date: '2026-01-01' }), null);
  const s = sanitizeSlot({ name: 'x', start_date: '2026-01-01', end_date: '2026-01-02', assignees: [{ user: 'a' }, { user: 'a' }, null, { user: 5 }] });
  assert.equal(s.assignees.length, 1);
  assert.equal(s.assignees[0].full_name, 'a');
});

test('slotProblem', () => {
  const ok = { duty_type: 'Support', label: '', start_date: '2026-11-16', end_date: '2026-11-22', notes: '', assignees: ['a', 'b'] };
  assert.equal(slotProblem(ok), null);
  assert.match(slotProblem({ ...ok, end_date: '2026-11-01' }), /before/);
  assert.match(slotProblem({ ...ok, assignees: ['a', 'a'] }), /twice/);
  assert.match(slotProblem({ ...ok, start_date: '16/11/2026' }), /real date/);
});

test('requestProblem: swap and replace rules', () => {
  const base = { type: 'Swap', slot: w47, fromUser: 'mark', toUser: 'teddy', swapSlot: w48, reason: '' };
  assert.equal(requestProblem(base), null);
  assert.match(requestProblem({ ...base, fromUser: 'teddy' }), /not on this slot/);
  assert.match(requestProblem({ ...base, swapSlot: null }), /slot you take/);
  assert.match(requestProblem({ ...base, swapSlot: w47 }), /different slot/);
  assert.match(requestProblem({ ...base, toUser: 'brian' }), /not on that slot/);
  assert.match(requestProblem({ ...base, toUser: 'mark' }), /someone else/);
  const rep = { type: 'Replace', slot: w47, fromUser: 'mark', toUser: 'brian', swapSlot: null, reason: '' };
  assert.equal(requestProblem(rep), null);
  assert.match(requestProblem({ ...rep, toUser: 'teresiah' }), /already on this slot/);
  assert.match(requestProblem({ ...rep, toUser: '' }), /covers/);
});

test('applyRequest swaps and replaces', () => {
  const after = applyRequest([w47, w48], { request_type: 'Swap', slot: 's47', swap_slot: 's48', from_user: 'mark', to_user: 'teddy', from_user_name: 'MARK', to_user_name: 'TEDDY' });
  assert.deepEqual(after[0].assignees.map((a) => a.user), ['teddy', 'teresiah']);
  assert.deepEqual(after[1].assignees.map((a) => a.user), ['mark', 'jennifer', 'otieno']);
  const rep = applyRequest([w47, w48], { request_type: 'Replace', slot: 's47', swap_slot: null, from_user: 'mark', to_user: 'brian', from_user_name: 'MARK', to_user_name: 'BRIAN' });
  assert.deepEqual(rep[0].assignees.map((a) => a.user), ['brian', 'teresiah']);
  assert.equal(rep[1], w48);
});
