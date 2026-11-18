const {test} = require('node:test');
const assert = require('node:assert/strict');
const HongguoPlayerClock = require('../core/cmd/hongguotv/ui/player-clock.js');
const {formatTime, formatLabel, mount} = HongguoPlayerClock;

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
