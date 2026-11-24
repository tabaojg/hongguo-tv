'use strict';

var assert = require('assert');
var create = require('./announcements');
var normalize = create.normalize;

function manifest(items) { return { schema: 1, channel: 'stable', items: items }; }

async function run() {
  var now = Date.parse('2026-11-24T12:00:00Z');
  var normalized = normalize(manifest([
    { id: 'older', enabled: true, title: 'Older', published_at: '2026-11-20T10:00:00Z' },
    { id: 'newer', enabled: true, title: 'Newer', published_at: '2026-11-23T10:00:00Z', platforms: ['webos', 'android'], before_version: '0.2.181', action: { type: 'repair_playback', label: 'Repair', min_revision: 7 } },
    { id: 'newer', enabled: true, title: 'Duplicate' },
    { id: 'off', enabled: false, title: 'Disabled' },
    { id: 'future', enabled: true, title: 'Future', published_at: '2026-11-25T10:00:00Z' },
    { id: 'expired', enabled: true, title: 'Expired', expires_at: '2026-11-01T10:00:00Z' },
    { id: 'pending', enabled: true, title: 'Pending', expires_at: '2026-12-01T10:00:00Z', dismissible: false }
  ]), now);
  assert.deepStrictEqual(normalized.map(function (item) { return item.id; }), ['newer', 'older', 'pending']);
  assert.strictEqual(normalized[0].action.type, 'repair_playback');
  assert.strictEqual(normalized[0].action.min_revision, 7);
  assert.strictEqual(normalized[2].dismissible, false);
  assert.throws(function () { normalize({ schema: 2, channel: 'stable', items: [] }, now); }, /schema/);

  var attempted = [], clock = now;
  var service = create({
    now: function () { return clock; },
    read: function (target) {
      attempted.push(target);
      if (target.indexOf('https://ghfast.top/') === 0) return Promise.reject(new Error('primary down'));
      return Promise.resolve(manifest([
        { id: 'webos-only', enabled: true, title: 'webOS notice', platforms: ['webos'] },
        { id: 'android-only', enabled: true, title: 'Other platform', platforms: ['android'] },
        { id: 'next-version', enabled: true, title: 'Future version', before_version: '0.2.181' }
      ]));
    }
  });
  var items = await service.active('webos', '0.2.180');
  assert.strictEqual(attempted.length, 2, 'the fallback source is tried when the primary fails');
  assert.deepStrictEqual(items.map(function (item) { return item.id; }), ['webos-only', 'next-version']);
  await service.active('webos', '0.2.180');
  assert.strictEqual(attempted.length, 2, 'a successful fetch is cached for the TTL');
  assert.deepStrictEqual((await service.active('webos', '0.2.181')).map(function (item) { return item.id; }), ['webos-only'], 'before_version is honored');
  assert.deepStrictEqual((await service.active('android', '0.2.180')).map(function (item) { return item.id; }), ['android-only', 'next-version']);
  clock += 6 * 60 * 1000;
  await service.active('webos', '0.2.180');
  assert.strictEqual(attempted.length, 4, 'the cache expires after five minutes');

  var empty = create({ read: function () { return Promise.reject(new Error('offline')); } });
  assert.deepStrictEqual(await empty.active('webos', '0.2.180'), [], 'offline must yield an empty list, not an error');

  console.log('webOS announcements: PASS');
}

run().catch(function (error) { console.error(error.stack || error); process.exitCode = 1; });
