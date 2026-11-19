(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HongguoPlayerClock = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var DEFAULT_TICK_MS = 30000;

  // Two-digit zero padding keeps the clock width stable on the TV layout.
  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  // Returns [HH, MM] from a Date. The clock shows hours and minutes only, so
  // it needs no seconds and can refresh at a slow cadence.
  function parts(now) {
    return [now.getHours(), now.getMinutes()];
  }

  function formatTime(now) {
    var values = parts(now);
    return pad(values[0]) + ':' + pad(values[1]);
  }

  // Screen-reader text spells the time out; the visual form is colon
  // separated and would be read as a range by some TV talkback engines.
  function formatLabel(now, template) {
    var values = parts(now);
    return String(template || '{hour}时{minute}分')
      .replace('{hour}', String(values[0]))
      .replace('{minute}', pad(values[1]));
  }

  function isHidden(host) {
    if (!host || typeof host.getAttribute !== 'function') return false;
    return host.classList.contains('is-hidden') || host.getAttribute('aria-hidden') === 'true';
  }

  // The WebView's own Date already reads the device system clock (both come
  // from CLOCK_REALTIME), so no JavaScriptInterface bridge is needed. Reading
  // it never crosses into the Java main thread that renders video, which is
  // what used to stall playback on weaker TV/projector hardware.
  function localNow() {
    return new Date();
  }

  function mount(element, options) {
    options = options || {};
    var doc = element && element.ownerDocument;
    if (!element || !doc) return { update: function () {}, stop: function () {} };
    // In the CommonJS test path `root` is not in scope, so the timer scope is
    // resolved lazily and the host element itself is never dereferenced here.
    var scope = options.scope || (typeof root !== 'undefined' ? root : {});
    var now = options.now || localNow;
    var tickMs = options.tickMs > 0 ? options.tickMs : DEFAULT_TICK_MS;
    var label = options.label;
    var timer = 0;
    var lastText = '';
    var lastLabel = '';
    var started = false;

    function update() {
      var current = now();
      var text = formatTime(current);
      if (text !== lastText) {
        element.textContent = text;
        lastText = text;
      }
      var nextLabel = typeof label === 'function' ? label(current) : '';
      if (nextLabel && nextLabel !== lastLabel) {
        element.setAttribute('aria-label', nextLabel);
        lastLabel = nextLabel;
      }
    }

    function schedule() {
      if (!started) return;
      timer = scope.setTimeout(function () {
        // Hidden hosts keep their text but stop repainting; the next tick
        // after the player page returns refreshes the displayed time.
        if (!isHidden(element)) update();
        schedule();
      }, tickMs);
    }

    function start() {
      if (started) return;
      started = true;
      update();
      schedule();
    }

    function stop() {
      started = false;
      if (timer) scope.clearTimeout(timer);
      timer = 0;
    }

    return { update: update, start: start, stop: stop };
  }

  return {
    formatTime: formatTime,
    formatLabel: formatLabel,
    localNow: localNow,
    mount: mount
  };
}));
