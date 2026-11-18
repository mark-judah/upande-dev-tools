// Run with: node --test tests/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { actionFor, applyChip, chipsFor, compareVersion, initials, matchesQuery, metaLine, sanitizeApps, shortName } from '../src/features/it/store/store-model.ts';

const raw = { apps: [
  { app: 'Upande Dev Tools', version: '1.0.3', released: '2026-11-10 08:00:00', platform: 'android', size_mb: 48.2, file: 'Upande-Dev-Tools-1.0.3.apk' },
  { app: 'Upande Sales', version: '1.4.2', released: '', platform: 'android', size_mb: null, file: '' },
  { app: 'Upande Sales', version: '9', platform: 'android' },
  { version: '1' }, null,
] };
const self = { name: 'Upande Dev Tools', version: '1.0.2' };

test('sanitize keeps the server fields and drops junk', () => {
  const apps = sanitizeApps(raw);
  assert.equal(apps.length, 2);
  assert.equal(apps[1].size_mb, null);
  assert.deepEqual(sanitizeApps(null), []);
});

test('names, initials, meta', () => {
  assert.equal(shortName('Upande Sales'), 'Sales');
  assert.equal(initials('Upande Dev Tools'), 'DT');
  assert.equal(initials('Upande Sales'), 'S');
  assert.equal(metaLine(sanitizeApps(raw)[0]), 'v1.0.3 · 48.2 MB');
  assert.equal(metaLine(sanitizeApps(raw)[1]), 'v1.4.2');
});

test('only this app can be Update / Installed', () => {
  const [dev, sales] = sanitizeApps(raw);
  assert.equal(actionFor(dev, self), 'update');
  assert.equal(actionFor(dev, { ...self, version: '1.0.3' }), 'installed');
  assert.equal(actionFor(sales, self), 'install');
  assert.equal(compareVersion('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersion('1.0', '1.0.0'), 0);
});

test('chips appear only when the data has them', () => {
  const apps = sanitizeApps(raw);
  assert.deepEqual(chipsFor(apps, { ...self, version: '9.9.9' }), []);
  assert.deepEqual(chipsFor(apps, self).map((c) => c.key), ['', 'updates']);
  assert.equal(applyChip(apps, 'updates', self).length, 1);
  assert.equal(matchesQuery(apps[1], 'sal'), true);
  assert.equal(matchesQuery(apps[1], 'zzz'), false);
});
