// Run with: node --test tests/
// Node 22.18+/23.6+ strips TypeScript types natively, so the pure .ts modules load as-is.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY,
  activeInstance,
  instanceId,
  isSessionExpiredResponse,
  markInstanceExpired,
  migrateLegacy,
  parseInstances,
  removeInstance,
  renameInstance,
  serializeInstances,
  switchInstance,
  upsertInstance,
} from '../src/core/it-source/instances-model.ts';

const a = { url: 'https://a.example.com/', email: 'me@a', fullName: 'Me A' };
const b = { url: 'https://B.example.com', email: 'me@b', fullName: null };

test('instanceId normalises scheme, case and trailing slashes', () => {
  assert.equal(instanceId('https://Foo.com/'), 'foo.com');
  assert.equal(instanceId('http://foo.com:8000//'), 'foo.com:8000');
  assert.equal(instanceId(null), '');
});

test('upsert adds, makes active and dedupes by id', () => {
  let s = upsertInstance(EMPTY, a, 1);
  s = upsertInstance(s, b, 2);
  assert.equal(s.list.length, 2);
  assert.equal(s.activeId, 'b.example.com');
  s = upsertInstance(s, { ...a, url: 'a.example.com' }, 3);
  assert.equal(s.list.length, 2);
  assert.equal(s.activeId, 'a.example.com');
  assert.equal(s.list[0].id, 'a.example.com', 'most recently used first');
});

test('re-sign-in keeps nickname and clears expired', () => {
  let s = upsertInstance(EMPTY, a, 1);
  s = renameInstance(s, 'a.example.com', '  Prod  ');
  s = markInstanceExpired(s, 'a.example.com');
  assert.equal(activeInstance(s).status, 'expired');
  s = upsertInstance(s, a, 5);
  assert.equal(activeInstance(s).nickname, 'Prod');
  assert.equal(activeInstance(s).status, 'connected');
});

test('markExpired touches only that instance and is a no-op when already expired', () => {
  let s = upsertInstance(upsertInstance(EMPTY, a, 1), b, 2);
  const s2 = markInstanceExpired(s, 'a.example.com');
  assert.equal(s2.list.find((i) => i.id === 'a.example.com').status, 'expired');
  assert.equal(s2.list.find((i) => i.id === 'b.example.com').status, 'connected');
  assert.equal(markInstanceExpired(s2, 'a.example.com'), s2);
  assert.equal(markInstanceExpired(s, 'nope'), s);
});

test('switch to unknown id is ignored; switch updates lastUsedAt', () => {
  const s = upsertInstance(upsertInstance(EMPTY, a, 1), b, 2);
  assert.equal(switchInstance(s, 'zzz', 9), s);
  const s2 = switchInstance(s, 'a.example.com', 9);
  assert.equal(s2.activeId, 'a.example.com');
  assert.equal(s2.list[0].lastUsedAt, 9);
});

test('removing the active instance leaves none active (no silent fallback)', () => {
  const s = upsertInstance(upsertInstance(EMPTY, a, 1), b, 2);
  const s2 = removeInstance(s, 'b.example.com');
  assert.equal(s2.activeId, null);
  assert.equal(s2.list.length, 1);
  assert.equal(removeInstance(s, 'a.example.com').activeId, 'b.example.com');
});

test('parse round-trips and drops malformed rows', () => {
  const s = upsertInstance(upsertInstance(EMPTY, a, 1), b, 2);
  assert.deepEqual(parseInstances(serializeInstances(s)), s);
  assert.equal(parseInstances('not json'), null);
  assert.equal(parseInstances(null), null);
  const p = parseInstances(JSON.stringify({ list: [null, { url: 5 }, { url: 'x.com', status: 'weird' }, { url: 'X.com/' }], activeId: 'gone' }));
  assert.equal(p.list.length, 1);
  assert.equal(p.list[0].status, 'connected');
  assert.equal(p.activeId, null);
});

test('legacy single IT source migrates as the active instance', () => {
  const legacy = JSON.stringify({ url: 'https://it.example.com', email: 'x@y', fullName: 'X', connectedAt: 10 });
  const m = migrateLegacy(legacy, true, 99);
  assert.equal(m.activeId, 'it.example.com');
  assert.equal(m.list[0].status, 'connected');
  assert.equal(m.list[0].connectedAt, 10);
  assert.equal(migrateLegacy(legacy, false, 99).list[0].status, 'expired');
  assert.equal(migrateLegacy(null, true, 1), null);
  assert.equal(migrateLegacy('{bad', true, 1), null);
  assert.equal(migrateLegacy(JSON.stringify({ url: '' }), true, 1), null);
});

test('session expiry detection', () => {
  assert.equal(isSessionExpiredResponse(401, null), true);
  assert.equal(isSessionExpiredResponse(403, { session_expired: 1 }), true);
  assert.equal(isSessionExpiredResponse(403, { exc_type: 'PermissionError' }), false);
  assert.equal(isSessionExpiredResponse(417, { exc_type: 'SessionExpired' }), true);
  assert.equal(isSessionExpiredResponse(500, 'html'), false);
});
