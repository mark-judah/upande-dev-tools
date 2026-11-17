// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { safeRoute } from '../src/features/notifications/safe-route.ts';
import {
  applyRead,
  coalesce,
  countUnread,
  mergeInbox,
  nextCursor,
  parseListResponse,
  parseServerTime,
  sanitizeItem,
  shortAge,
  unreadBadge,
} from '../src/features/notifications/inbox-model.ts';
import { backoffDelay, classifyPushError, isBuildProblem, needsRegistration, pushMessage } from '../src/features/notifications/push-model.ts';

test('safeRoute allows known in-app paths only', () => {
  for (const ok of ['/', '/deployments', '/deployments?x=1', '/task/TASK-0001', '/request/REQ-1', '/backlog', '/notifications', '/project/P-1']) {
    assert.equal(safeRoute(ok), ok, ok);
  }
  for (const bad of [null, 5, '', 'deployments', '//evil.com', 'https://evil.com', '/task/', '/task/?x', '/../x', '/task/..', '/tasks', '/it/support/ISS-1', '/task/a b', '/task/a\\b', '/x'.repeat(200), '/deploymentsX']) {
    assert.equal(safeRoute(bad), null, String(bad));
  }
  assert.equal(safeRoute('  /backlog  '), '/backlog');
});

test('parseServerTime reads ISO and Frappe datetimes consistently', () => {
  assert.equal(parseServerTime('2026-11-18T10:00:00Z'), Date.UTC(2026, 10, 18, 10));
  assert.equal(parseServerTime('2026-11-18 10:00:00.123456'), Date.UTC(2026, 10, 18, 10, 0, 0, 123));
  assert.equal(parseServerTime('2026-11-18T13:00:00+03:00'), Date.UTC(2026, 10, 18, 10));
  assert.equal(parseServerTime('nonsense'), null);
  assert.equal(parseServerTime(undefined), null);
});

test('sanitizeItem drops rows without a name and defaults the rest', () => {
  assert.equal(sanitizeItem(null), null);
  assert.equal(sanitizeItem({ title: 'x' }), null);
  const it = sanitizeItem({ name: 'MN-1', read: 1, data: '{"a":1}', created: '2026-01-01 00:00:00' });
  assert.equal(it.title, 'Notification');
  assert.equal(it.read, true);
  assert.deepEqual(it.data, { a: 1 });
  assert.equal(sanitizeItem({ name: 'MN-2', data: '[1]' }).data, null);
  assert.equal(sanitizeItem({ name: 'MN-3', data: '{bad' }).data, null);
});

test('parseListResponse tolerates malformed answers and dedupes', () => {
  assert.equal(parseListResponse(null), null);
  const r = parseListResponse({ items: [{ name: 'a' }, { name: 'a' }, 7, { nope: 1 }], unread: -3, server_time: '2026-11-18 10:00:00' });
  assert.equal(r.items.length, 1);
  assert.equal(r.unread, null);
  assert.equal(r.serverTimeMs, Date.UTC(2026, 10, 18, 10));
  assert.deepEqual(parseListResponse({}).items, []);
});

const item = (name, min, read = false) => ({ name, title: name, body: '', route: null, kind: null, data: null, created: '', createdMs: min * 60000, read });

test('mergeInbox dedupes by name, newest first, server wins except pending reads', () => {
  const cur = [item('b', 2), item('a', 1)];
  const merged = mergeInbox(cur, [item('c', 3), item('b', 2, true)], { full: false });
  assert.deepEqual(merged.map((i) => i.name), ['c', 'b', 'a']);
  assert.equal(merged.find((i) => i.name === 'b').read, true);
  const pending = mergeInbox(cur, [item('a', 1, false)], { full: false, pendingRead: ['a'] });
  assert.equal(pending.find((i) => i.name === 'a').read, true, 'a local read mark survives a stale server copy');
});

test('full refresh replaces its window but keeps older cached rows', () => {
  const cur = [item('gone', 9), item('kept-old', 1), item('x', 5)];
  const merged = mergeInbox(cur, [item('new', 10), item('x', 5)], { full: true });
  assert.deepEqual(merged.map((i) => i.name), ['new', 'x', 'kept-old']);
  assert.deepEqual(mergeInbox(cur, [], { full: true }).map((i) => i.name), [], 'an empty first page means nothing is left');
});

test('unread badge, applyRead', () => {
  const items = [item('a', 1), item('b', 2, true), item('c', 3)];
  assert.equal(countUnread(items), 2);
  assert.equal(unreadBadge(null, items, 0), 2);
  assert.equal(unreadBadge(10, items, 3), 7);
  assert.equal(unreadBadge(1, items, 5), 2, 'never below the unread rows on screen');
  const r = applyRead(items, ['a']);
  assert.equal(countUnread(r), 1);
  assert.equal(applyRead(r, ['a']), r, 'unchanged returns the same array');
  assert.equal(countUnread(applyRead(items, 'all')), 0);
});

test('cursor comes from the server clock with an overlap; ages ignore the phone clock', () => {
  const res = { items: [item('a', 1)], unread: 0, serverTime: 'x', serverTimeMs: 10 * 60000 };
  assert.equal(nextCursor(res, null), new Date(9 * 60000).toISOString());
  assert.equal(nextCursor({ items: [], unread: 0, serverTime: null, serverTimeMs: null }, 'prev'), 'prev');
  assert.equal(shortAge(0, 1), '');
  assert.equal(shortAge(1000, 1000 + 5 * 60000), '5m');
  assert.equal(shortAge(1000 + 5 * 60000, 1000), 'now', 'a future timestamp (skew) never shows negative');
});

test('coalesce runs once and then exactly once more for calls made mid-run', async () => {
  const runs = [];
  let release;
  const gate = new Promise((r) => (release = r));
  const trigger = coalesce(async (full) => {
    runs.push(full);
    if (runs.length === 1) await gate;
  }, (a, b) => a || b);
  const p1 = trigger(false);
  const p2 = trigger(false);
  const p3 = trigger(true);
  assert.equal(p1, p2);
  assert.equal(p2, p3);
  release();
  await p1;
  assert.deepEqual(runs, [false, true]);
  await trigger(false);
  assert.deepEqual(runs, [false, true, false]);
});

test('push errors map to short reasons, never raw text', () => {
  assert.equal(classifyPushError(new Error('Default FirebaseApp is not initialized in this process com.upande.devtools')), 'no-firebase');
  assert.equal(classifyPushError(new Error('No "projectId" found. If "projectId" can not be inferred automatically...')), 'no-project-id');
  assert.equal(classifyPushError(new Error('Network request failed')), 'offline');
  assert.equal(classifyPushError({ code: 'SERVICE_NOT_AVAILABLE' }), 'no-firebase');
  assert.equal(classifyPushError('weird'), 'unknown');
  assert.equal(isBuildProblem('no-firebase'), true);
  assert.equal(isBuildProblem('offline'), false);
  assert.match(pushMessage('no-firebase'), /not set up in this build/);
});

test('backoff grows, is capped and jittered', () => {
  const lo = () => 0;
  const hi = () => 1;
  assert.equal(backoffDelay(0, { rand: hi }), 2000);
  assert.equal(backoffDelay(0, { rand: lo }), 1000);
  assert.equal(backoffDelay(3, { rand: hi }), 16000);
  assert.equal(backoffDelay(50, { rand: hi }), 300000);
});

test('needsRegistration skips an unchanged, fresh registration', () => {
  const last = { token: 't', owner: 'o', at: 0 };
  assert.equal(needsRegistration(null, { token: 't', owner: 'o' }, 1), true);
  assert.equal(needsRegistration(last, { token: 't', owner: 'o' }, 1000), false);
  assert.equal(needsRegistration(last, { token: 't2', owner: 'o' }, 1000), true);
  assert.equal(needsRegistration(last, { token: 't', owner: 'o2' }, 1000), true);
  assert.equal(needsRegistration(last, { token: 't', owner: 'o' }, 13 * 3600 * 1000), true);
});
