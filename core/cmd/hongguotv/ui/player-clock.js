(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HongguoPlayerClock = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var DEFAULT_TICK_MS = 5000;

  // Two-digit zero padding keeps the clock width stable on the TV layout.
  function pad(value) {
    return value < 10 ? '0' + value : String(value);
  }

  // Returns [HH, MM, SS] from a Date. Kept separate from formatTime so the
  // hourly refresh boundary can be computed without re-parsing the string.
  function parts(now) {
    return [now.getHours(), now.getMinutes(), now.getSeconds()];
  }

  function formatTime(now) {
    var values = parts(now);
    return pad(values[0]) + ':' + pad(values[1]) + ':' + pad(values[2]);
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

  // Wall-clock source: prefer the Android system clock exposed through the
  // HongguoTVClock JavaScriptInterface (epoch millis in the device timezone),
  // and fall back to the web clock everywhere else (desktop/webOS/tests).
  // `host` is injectable so this stays testable without a real window.
  function systemNow(host) {
    var scope = host || (typeof window !== 'undefined' ? window : null);
    var bridge = scope && scope.HongguoTVClock;
    if (bridge && typeof bridge.currentTimeMillis === 'function') {
      try {
        var millis = bridge.currentTimeMillis();
        if (typeof millis === 'number' && isFinite(millis) && millis > 0) {
          return new Date(millis);
        }
      } catch (e) {
        // Bridge may be torn down during navigation; fall through to web time.
      }
    }
    return new Date();
  }

  // The Android system-clock bridge runs on the WebView main thread, the same
  // thread that renders video. Polling it every second contends with playback
  // on weaker TV/projector hardware and can stall the picture. Read the
  // authoritative system time once, advance with a monotonic local clock in
  // between, and re-sync only occasionally (or on the next resumed playback).
  function createSyncedNow(options) {
    options = options || {};
    var syncMs = options.syncMs > 0 ? options.syncMs : 60000;
    var scope = options.scope || (typeof window !== 'undefined' ? window : null);
    var source = typeof options.source === 'function' ? options.source : systemNow;
    var monotonic = typeof options.monotonic === 'function' ? options.monotonic : function () {
      return typeof performance !== 'undefined' && performance && typeof performance.now === 'function'
        ? performance.now() : Date.now();
    };
    var anchorWall = 0;
    var anchorMono = 0;
    var synced = function () {
      var mono = monotonic();
      if (!anchorWall || mono - anchorMono >= syncMs) {
        anchorWall = source(scope).getTime();
        anchorMono = mono;
        return new Date(anchorWall);
      }
      return new Date(anchorWall + (mono - anchorMono));
    };
    // Force the next read to consult the authoritative source again, e.g. when
    // a new playback session starts. Still just one bridge call per session.
    synced.resync = function () { anchorWall = 0; anchorMono = 0; };
    return synced;
  }

  function mount(element, options) {
    options = options || {};
    var doc = element && element.ownerDocument;
    if (!element || !doc) return { update: function () {}, stop: function () {} };
    // In the CommonJS test path `root` is not in scope, so the timer scope is
    // resolved lazily and the host element itself is never dereferenced here.
    var scope = options.scope || (typeof root !== 'undefined' ? root : {});
    var now = options.now || function () { return new Date(); };
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
    systemNow: systemNow,
    createSyncedNow: createSyncedNow,
    mount: mount
  };
}));
