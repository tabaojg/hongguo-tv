const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const HongguoPlayerClock = require('../core/cmd/hongguotv/ui/player-clock.js');
const {formatTime, formatLabel, localNow, mount} = HongguoPlayerClock;

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

test('formatTime zero-pads hours and minutes into a stable HH:MM width', () => {
  assert.equal(formatTime(date(9, 5, 3)), '09:05');
  assert.equal(formatTime(date(23, 59, 59)), '23:59');
  assert.equal(formatTime(date(0, 0, 0)), '00:00');
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

test('start paints immediately then keeps ticking at the slow cadence; stop clears the timer', () => {
  const host = element();
  const scope = timerScope();
  let now = date(9, 5, 3);
  const handle = mount(host, {scope, now: () => now, tickMs: 30000});

  handle.start();
  assert.equal(host.textContent, '09:05');
  assert.equal(scope.pending(), 1);
  assert.equal(scope.lastDelay(), 30000);

  now = date(9, 6, 0);
  scope.fire();
  assert.equal(host.textContent, '09:06');
  assert.equal(scope.pending(), 1);

  handle.stop();
  assert.equal(scope.pending(), 0);
});

test('start is idempotent and a stopped clock can be restarted', () => {
  const host = element();
  const scope = timerScope();
  const handle = mount(host, {scope, now: () => date(1, 2, 3), tickMs: 30000});
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
  const handle = mount(host, {scope, now: () => now, tickMs: 30000});
  handle.start();
  assert.equal(host.textContent, '09:05');

  host.classList.add('is-hidden');
  now = date(9, 6, 0);
  scope.fire();
  assert.equal(host.textContent, '09:05');

  host.classList.remove('is-hidden');
  scope.fire();
  assert.equal(host.textContent, '09:06');
  handle.stop();
});

test('aria-hidden is treated the same as the is-hidden class', () => {
  const host = element();
  host.classList.remove('is-hidden');
  const scope = timerScope();
  let now = date(9, 5, 3);
  const handle = mount(host, {scope, now: () => now, tickMs: 30000});
  handle.start();
  host.setAttribute('aria-hidden', 'true');
  now = date(9, 6, 0);
  scope.fire();
  assert.equal(host.textContent, '09:05');
  handle.stop();
});

test('update is a no-op when nothing changed and safe after stop', () => {
  const host = element();
  const scope = timerScope();
  let writes = 0;
  const handle = mount(host, {scope, now: () => date(9, 5, 3), tickMs: 30000});
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

test('localNow returns the WebView system clock without any bridge', () => {
  const before = Date.now();
  const now = localNow();
  const after = Date.now();
  assert.ok(now instanceof Date);
  assert.ok(now.getTime() >= before && now.getTime() <= after);
});

test('no HongguoTVClock JavaScriptInterface bridge is registered', () => {
  const activity = fs.readFileSync(require.resolve('../android/app/src/main/java/rocks/aston/hongguotv/MainActivity.java'), 'utf8');
  assert.doesNotMatch(activity, /HongguoTVClock/);
  assert.doesNotMatch(activity, /@JavascriptInterface public long currentTimeMillis/);
});

test('app.js mounts the clock with the local clock source and 30-second ticks', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  assert.match(source, /HongguoPlayerClock\.mount\(playerClockNode, \{[\s\S]*?now: HongguoPlayerClock\.localNow,[\s\S]*?tickMs: 30000,/);
  assert.doesNotMatch(source, /createSyncedNow/);
});

test('clock node lives in the top bar beside core-status, not in hero-top-right', () => {
  const html = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/index.html'), 'utf8');
  const statusTag = html.match(/<button[^>]*id="core-status"[^>]*>/);
  const clockTag = html.match(/<span id="player-clock"[^>]*>/);
  assert.ok(statusTag, 'core-status button exists');
  assert.ok(clockTag, 'player-clock node exists');
  // The clock directly follows the core-status chip inside the same top bar.
  assert.ok(html.indexOf(clockTag[0]) > html.indexOf(statusTag[0]));
  assert.match(html.slice(html.indexOf(statusTag[0]), html.indexOf(clockTag[0]) + clockTag[0].length), /id="core-status"[\s\S]*?<\/button>\s*<span id="player-clock"/);
  const heroTopRight = html.match(/<div class="hero-top-right">[\s\S]*?<\/div>/);
  assert.ok(heroTopRight, 'hero-top-right still exists');
  assert.doesNotMatch(heroTopRight[0], /player-clock/);
});

test('CSS hides core-status while the clock shows and keeps the clock visible with controls hidden', () => {
  const css = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.css'), 'utf8');
  assert.match(css, /\.app-shell\.is-clock-shown #core-status \{ display: none; \}/);
  assert.match(css, /\.app-shell\.is-controls-hidden #player-clock \{ visibility: visible; \}/);
});

test('showPlayerClock/hidePlayerClock toggle the clock node and the is-clock-shown mutual-exclusion class', () => {
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  const show = source.slice(source.indexOf('function showPlayerClock()'), source.indexOf('function hidePlayerClock()'));
  const hide = source.slice(source.indexOf('function hidePlayerClock()'), source.indexOf('var endRecommendations'));
  assert.match(show, /playerClockNode\.classList\.remove\('is-hidden'\)/);
  assert.match(show, /shell\.classList\.add\('is-clock-shown'\)/);
  assert.match(hide, /playerClockNode\.classList\.add\('is-hidden'\)/);
  assert.match(hide, /shell\.classList\.remove\('is-clock-shown'\)/);
});

test('no episode badge or jump-to-episode wiring remains in the player UI', () => {
  const html = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/index.html'), 'utf8');
  const css = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.css'), 'utf8');
  const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
  const keypad = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/numeric-keypad.js'), 'utf8');
  assert.doesNotMatch(html, /player-hud|player-episode-jump|episode-jump/);
  assert.doesNotMatch(css, /player-hud|player-episode-jump|is-episode-jump/);
  assert.doesNotMatch(source, /episodeJumpMode|openEpisodeJump|jumpToEpisode|updatePlayerEpisodeBadge|playerHudNode|dataset\.action === 'episode-jump'/);
  assert.doesNotMatch(keypad, /episode/);
});
