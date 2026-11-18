// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultRole, normalizeAccessDetail, toSuggestion } from '../src/features/it/support/access-model.ts';
import { asText, asTextList } from '../src/core/text.ts';

// The shape `upande_core.it_dashboard.access.detail` returns (stock-entry request that crashed the conversation).
const payload = {
  id: 'ISS-2026-00412',
  status: 'Open',
  closed: false,
  person: 'Jane Store',
  user: 'jane@kaitet.com',
  enabled: true,
  doctype: 'Stock Entry',
  doctype_exists: true,
  document: 'new-stock-entry-abc',
  route: 'https://kaitet-group.upande.com/desk/stock-entry/new-stock-entry-abc',
  asked: ['read', 'write', 'create'],
  lacking: ['write', 'create'],
  have: { read: true, write: false, create: false },
  reason: 'Need to receive flowers',
  roles_now: ['Employee'],
  profiles_now: ['Store'],
  suggested: [
    { role: 'Stock User', gives: ['read', 'write', 'create'], all: true },
    { role: 'Stock Viewer', gives: ['read'], all: false },
  ],
  new_role: 'Access - Stock Entry',
  new_role_exists: false,
  refusal: null,
  applicable: ['read', 'write', 'create', 'submit'],
};

test('suggested objects become {role, gives, all} with role as the label', () => {
  const d = normalizeAccessDetail(payload);
  assert.deepEqual(d.suggested, payload.suggested);
  for (const s of d.suggested) assert.equal(typeof s.role, 'string');
  assert.equal(defaultRole(d.suggested), 'Stock User', 'the default is a role that covers everything');
});

test('only partial roles: no default, so a new role is made (the server refuses partial roles)', () => {
  const d = normalizeAccessDetail({ ...payload, suggested: [{ role: 'Stock Viewer', gives: ['read'], all: false }] });
  assert.equal(defaultRole(d.suggested), null);
});

test('malformed and legacy entries', () => {
  assert.deepEqual(toSuggestion('Stock User'), { role: 'Stock User', gives: [], all: true });
  assert.equal(toSuggestion({ gives: ['read'] }), null);
  assert.equal(toSuggestion(null), null);
  const d = normalizeAccessDetail({ suggested: [{ role: 'A', all: 1, gives: ['read', 5, { x: 1 }] }, { role: 'A', all: true }, 7], asked: ['read', { p: 1 }], have: 'nope', refusal: '' });
  assert.deepEqual(d.suggested, [{ role: 'A', gives: ['read', '5'], all: true }]);
  assert.deepEqual(d.asked, ['read']);
  assert.deepEqual(d.have, {});
  assert.equal(d.refusal, null);
  assert.equal(normalizeAccessDetail(null).suggested.length, 0);
});

test('asText never returns a non-string', () => {
  assert.equal(asText({ role: 'Stock User', gives: ['read'], all: true }), 'Stock User');
  assert.equal(asText({ foo: 1 }), '');
  assert.equal(asText(null, '-'), '-');
  assert.equal(asText(3), '3');
  assert.equal(asText(NaN), '');
  assert.equal(asText(['a']), '');
  assert.deepEqual(asTextList(['a', { name: 'b' }, null, 2]), ['a', 'b', '2']);
  assert.deepEqual(asTextList('x'), []);
});
