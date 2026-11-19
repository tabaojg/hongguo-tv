const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const HongguoPlayerClock = require('../core/cmd/hongguotv/ui/player-clock.js');
const {formatTime, formatLabel, systemNow, mount} = HongguoPlayerClock;

function date(hour, minute, second) {
  return new Date(2026, 0, 1, hour, minute, second, 0);
}

// Minimal element with the bits mount() touches: document owner, class list,
// text content and attributes. Timers are injected so ticks are deterministic.
function element() {
  const classes = new Set();
  const attrs = {};
  return {
    ownerDocument: {},
    textContent: '',
    classList: {
      contains: name => classes.has(name),
      add: name => classes.add(name),
      remove: name => classes.delete(name)
    },
    getAttribute: name => Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null,
    setAttribute: (name, value) => { attrs[name] = value; },
    removeAttribute: name => { delete attrs[name]; },
    attrs
  };
}

function timerScope() {
  const jobs = new Map();
  let next = 1;
  return {
    setTimeout(fn, ms) { const id = next++; jobs.set(id, {fn, ms}); return id; },
    clearTimeout(id) { jobs.delete(id); },
    pending: () => jobs.size,
    lastDelay: () => [...jobs.values()].at(-1).ms,
    fire() {
      const snapshot = [...jobs.entries()];
      jobs.clear();
      snapshot.forEach(([, job]) => job.fn());
    }
  };
}

test('formatTime zero-pads each component into a stable HH:MM:SS width', () => {
  assert.equal(formatTime(date(9, 5, 3)), '09:05:03');
  assert.equal(formatTime(date(23, 59, 59)), '23:59:59');
  assert.equal(formatTime(date(0, 0, 0)), '00:00:00');
});

test('formatLabel spells the time out and honours a custom template', () => {
  assert.equal(formatLabel(date(9, 5, 3)), '9时05分');
  assert.equal(formatLabel(date(23, 7, 0)), '23时07分');
  assert.equal(formatLabel(date(9, 5, 3), '{hour}:{minute}'), '9:05');
});

test('mount with no element returns a safe no-op handle', () => {
  const handle = mount(null, {});
  assert.doesNotThrow(() => { handle.update(); handle.stop(); });
});

test('start paints immediately then keeps ticking; stop clears the timer', () => {
  const host = element();
  const scope = timerScope();
  let now = date(9, 5, 3);
  const handle = mount(host, {scope, now: () => now, tickMs: 1000});

  handle.start();
  assert.equal(host.textContent, '09:05:03');
  assert.equal(scope.pending(), 1);
  assert.equal(scope.lastDelay(), 1000);

  now = date(9, 5, 4);
  scope.fire();
  assert.equal(host.textContent, '09:05:04');
  assert.equal(scope.pending(), 1);

  handle.stop();
  assert.equal(scope.pending(), 0);
});

test('start is idempotent and a stopped clock can be restarted', () => {
  const host = element();
  const scope = timerScope();
  const handle = mount(host, {scope, now: () => date(1, 2, 3), tickMs: 1000});
  handle.start(); handle.start();
  assert.equal(scope.pending(), 1);
  handle.stop();
  handle.start();
  assert.equal(scope.pending(), 1);
  handle.stop();
});

test('label renders an aria-label only when a label function is supplied', () => {
  const host = element();
  const scope = timerScope();
  const now = () => date(9, 5, 3);
  const withLabel = mount(host, {scope, now, label: current => formatLabel(current)});
  withLabel.start();
  assert.equal(host.getAttribute('aria-label'), '9时05分');

  const plain = element();
  mount(plain, {scope, now}).start();
  assert.equal(plain.getAttribute('aria-label'), null);
});

test('a hidden host keeps its text but does not repaint on ticks', () => {
  const host = element();
  const scope = timerScope();
  let now = date(9, 5, 3);
  const handle = mount(host, {scope, now: () => now, tickMs: 1000});
  handle.start();
  assert.equal(host.textContent, '09:05:03');

  host.classList.add('is-hidden');
  now = date(9, 5, 4);
  scope.fire();
  assert.equal(host.textContent, '09:05:03');

  host.classList.remove('is-hidden');
  scope.fire();
  assert.equal(host.textContent, '09:05:04');
  handle.stop();
});

test('aria-hidden is treated the same as the is-hidden class', () => {
  const host = element();
  host.classList.remove('is-hidden');
  const scope = timerScope();
  let now = date(9, 5, 3);
  const handle = mount(host, {scope, now: () => now, tickMs: 1000});
  handle.start();
  host.setAttribute('aria-hidden', 'true');
  now = date(9, 5, 4);
  scope.fire();
  assert.equal(host.textContent, '09:05:03');
  handle.stop();
});

test('update is a no-op when nothing changed and safe after stop', () => {
  const host = element();
  const scope = timerScope();
  let writes = 0;
  const handle = mount(host, {scope, now: () => date(9, 5, 3), tickMs: 1000});
  Object.defineProperty(host, 'textContent', {
    configurable: true,
    get() { return this._text || ''; },
    set(value) { this._text = value; writes++; }
  });
  handle.start();
  assert.equal(writes, 1);
  handle.update();
  assert.equal(writes, 1);
  handle.stop();
  handle.update();
  assert.equal(writes, 1);
});

function fakeScope(bridge) {
  return bridge ? {HongguoTVClock: bridge} : {};
}

test('systemNow reads epoch millis from the Android system-clock bridge', () => {
  const epoch = date(14, 30, 12).getTime();
  const scope = fakeScope({currentTimeMillis: () => epoch});
  const now = systemNow(scope);
  assert.ok(now instanceof Date);
  assert.equal(now.getTime(), epoch);
  assert.equal(formatTime(now), '14:30:12');
});

test('systemNow falls back to the web clock when the bridge is absent', () => {
  const before = Date.now();
  const now = systemNow(fakeScope(null));
  const after = Date.now();
  assert.ok(now instanceof Date);
  assert.ok(now.getTime() >= before && now.getTime() <= after);
});

test('systemNow falls back when the bridge has no currentTimeMillis method', () => {
  const before = Date.now();
  const now = systemNow(fakeScope({}));
  assert.ok(now.getTime() >= before && now.getTime() <= Date.now());
});

test('systemNow falls back when the bridge throws or returns an invalid value', () => {
  const throwing = systemNow(fakeScope({currentTimeMillis: () => { throw new Error('torn down'); }}));
  assert.ok(throwing.getTime() >= Date.now() - 1000);
  for (const bad of [0, -1, NaN, Infinity, '123', null]) {
    const now = systemNow(fakeScope({currentTimeMillis: () => bad}));
    assert.ok(now instanceof Date, `expected a Date for ${String(bad)}`);
    assert.ok(now.getTime() > 0);
  }
});

test('Android bridge exposing currentTimeMillis is registered on the WebView', () => {
  const activity = fs.readFileSync(require.resolve('../android/app/src/main/java/rocks/aston/hongguotv/MainActivity.java'), 'utf8');
  assert.match(activity, /addJavascriptInterface\(new Object\(\) \{[\s\S]*?@JavascriptInterface public long currentTimeMillis\(\) \{\s*return System\.currentTimeMillis\(\);\s*\}\s*\}, "HongguoTVClock"\)/);
});

test('app.js mounts the clock with the system time source and one-second ticks', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  assert.match(source, /HongguoPlayerClock\.mount\(playerClockNode, \{[\s\S]*?now: HongguoPlayerClock\.systemNow,[\s\S]*?tickMs: 1000,/);
});

test('clock node lives in the top bar beside core-status, not in hero-top-right', () => {
  const html = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/index.html'), 'utf8');
  const statusTag = html.match(/<button[^>]*id="core-status"[^>]*>/);
  const hudTag = html.match(/<div id="player-hud"[^>]*>/);
  const clockTag = html.match(/<span id="player-clock"[^>]*>/);
  assert.ok(statusTag, 'core-status button exists');
  assert.ok(hudTag, 'player-hud node exists');
  assert.ok(clockTag, 'player-clock node exists');
  // The HUD (clock + episode badge) directly follows the core-status chip.
  assert.ok(html.indexOf(hudTag[0]) > html.indexOf(statusTag[0]));
  assert.match(html.slice(html.indexOf(statusTag[0]), html.indexOf(hudTag[0]) + hudTag[0].length), /id="core-status"[\s\S]*?<\/button>\s*<div id="player-hud"/);
  assert.match(html.slice(html.indexOf(hudTag[0]), html.indexOf(clockTag[0]) + clockTag[0].length), /id="player-hud"[\s\S]*?<span id="player-clock"/);
  const heroTopRight = html.match(/<div class="hero-top-right">[\s\S]*?<\/div>/);
  assert.ok(heroTopRight, 'hero-top-right still exists');
  assert.doesNotMatch(heroTopRight[0], /player-clock/);
});

test('the HUD stacks a clickable current/total episode badge under the clock', () => {
  const html = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/index.html'), 'utf8');
  const hud = html.match(/<div id="player-hud"[\s\S]*?<\/div>\s*(?=<\/div>)/);
  assert.ok(hud, 'player-hud block exists');
  assert.match(hud[0], /id="player-clock"/);
  assert.match(hud[0], /<span id="player-clock"[^>]*><\/span>/, 'clock is an empty text target for mount()');
  assert.match(hud[0], /<button[^>]*id="player-episode-jump"[^>]*data-action="episode-jump"/);
  assert.match(hud[0], /<span id="player-episode-jump-label">[^<]*<\/span>/);
  // The badge sits after the clock so it renders underneath it.
  assert.ok(hud[0].indexOf('id="player-episode-jump"') > hud[0].indexOf('id="player-clock"'));
});

test('CSS stacks the HUD vertically and reuses the core-status slot', () => {
  const css = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.css'), 'utf8');
  assert.match(css, /\.player-hud \{[^}]*flex-direction: column[^}]*\}/);
  assert.match(css, /\.player-hud \{[^}]*align-items: flex-end[^}]*\}/);
  assert.match(css, /\.app-shell\.is-controls-hidden #player-hud \{ visibility: visible; \}/);
  assert.match(css, /\.account-keypad-modal\.is-episode-jump \.account-number-scan \{ display: none; \}/);
});

test('CSS hides core-status while the clock shows and keeps the HUD visible with controls hidden', () => {
  const css = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.css'), 'utf8');
  assert.match(css, /\.app-shell\.is-clock-shown #core-status \{ display: none; \}/);
});

test('showPlayerClock/hidePlayerClock toggle the HUD and the is-clock-shown mutual-exclusion class', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  const show = source.slice(source.indexOf('function showPlayerClock()'), source.indexOf('function hidePlayerClock()'));
  const hide = source.slice(source.indexOf('function hidePlayerClock()'), source.indexOf('// Open the shared numeric keypad'));
  assert.match(show, /playerHudNode\.classList\.remove\('is-hidden'\)/);
  assert.match(show, /shell\.classList\.add\('is-clock-shown'\)/);
  assert.match(show, /updatePlayerEpisodeBadge\(activePlayback\)/);
  assert.match(hide, /playerHudNode\.classList\.add\('is-hidden'\)/);
  assert.match(hide, /shell\.classList\.remove\('is-clock-shown'\)/);
});

test('updatePlayerEpisodeBadge renders current/total and tolerates unknown values', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  const fn = source.slice(source.indexOf('function updatePlayerEpisodeBadge'), source.indexOf('function showPlayerClock()'));
  assert.match(fn, /var current = playback && Number\(playback\.episode\)/);
  assert.match(fn, /var total = Number\(item && item\.episode_count\) \|\| 0/);
  assert.match(fn, /var shown = current > 0 \? current : 1/);
  assert.match(fn, /shown \+ '\/' \+ \(total > 0 \? total : '--'\)/);
});

test('openEpisodeJump opens the shared keypad in episode mode with a bounded width', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  const fn = source.slice(source.indexOf('function openEpisodeJump'), source.indexOf('function jumpToEpisode'));
  assert.match(fn, /accountKeypadOpen\(\)/);
  assert.match(fn, /episodeJumpMode = true/);
  assert.match(fn, /numericKeypad\.open\('episode'/, 'opens the shared numeric keypad');
  assert.match(fn, /maxLength: Math\.max\(1, width\)/);
  assert.match(fn, /modal\.classList\.remove\('is-episode-jump'\)/);
});

test('jumpToEpisode guards range and jumps through playFeedItem', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  const fn = source.slice(source.indexOf('function jumpToEpisode'), source.indexOf('var endRecommendations'));
  assert.match(fn, /target < 1 \|\| Math\.floor\(target\) !== target/);
  assert.match(fn, /total > 0 && target > total/);
  assert.match(fn, /playFeedItem\(index, target, 0\)/);
  assert.match(fn, /goFocus\(document\.getElementById\('hero-feed-focus'\)\)/);
});

test('a remote digit key on playback opens the episode jump, and the keypad modal exposes the badge action', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  assert.match(source, /isPlaybackPage\(\)[\s\S]*?openEpisodeJump\(key\)/);
  assert.match(source, /item\.dataset\.action === 'episode-jump'/);
  assert.match(source, /state\.kind === 'episode'[\s\S]*?ui\.jumpEpisodeTitle/);
  assert.match(source, /if \(kind === 'episode'\) return;[\s\S]*?account-phone/);
  assert.match(source, /if \(episodeJumpMode\) \{[\s\S]*?jumpToEpisode\(parseInt\(result\.value, 10\), jumpOrigin\)/);
});

test('all three locales ship the episode-jump copy so locale completeness holds', () => {
  for (const name of ['zh-CN', 'zh-TW', 'ja-JP']) {
    const locale = fs.readFileSync(require.resolve(`../core/cmd/hongguotv/ui/locales/${name}.js`), 'utf8');
    for (const key of ['ui.jumpEpisodeTitle', 'ui.jumpEpisodeHint', 'ui.jumpEpisodeHintNoTotal', 'ui.jumpEpisodeAria',
      'ui.episodeJumpUnavailable', 'content.episodeJumpInvalid', 'content.episodeJumpOutOfRange',
      'content.episodeJumpSame', 'content.episodeJumpMax']) {
      assert.ok(locale.includes(key), `${name} is missing ${key}`);
    }
  }
});
