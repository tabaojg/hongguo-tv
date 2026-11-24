const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const uiDir = path.resolve(__dirname, '../core/cmd/hongguotv/ui');
const repoDir = path.resolve(__dirname, '..');
const RELEASE = 'https://github.com/tabaojg/hongguo-tv/releases/tag/v0.2.174';

const qr = require('../core/cmd/hongguotv/ui/update-qr.js');

// ---- QR generator (bundled webOS algorithm) ----

test('toSVG returns a self-contained SVG data URI for a release URL', () => {
  const uri = qr.toSVG(RELEASE);
  assert.match(uri, /^data:image\/svg\+xml;base64,/);
  const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /viewBox="0 0 \d+ \d+"/);
  assert.match(svg, /shape-rendering="crispEdges"/);
  assert.match(svg, /fill="#fff"/);
  assert.match(svg, /fill="#000"/);
});

test('toSVG honours the requested pixel size and rejects empty input', () => {
  const uri = qr.toSVG(RELEASE, 200);
  const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
  assert.match(svg, /width="200" height="200"/);
  assert.equal(qr.toSVG(''), '');
  assert.equal(qr.toSVG(null), '');
});

test('bundled QR matrix matches the original webOS algorithm exactly', () => {
  const QRCode = require('../webos/service/qr-code/QRCode.js');
  const LEVEL = require('../webos/service/qr-code/QRErrorCorrectLevel.js');
  const native = new QRCode(0, LEVEL.M);
  native.addData(RELEASE);
  native.make();
  const count = native.getModuleCount();
  assert.equal(qr.moduleCount(RELEASE), count);

  const svg = Buffer.from(qr.toSVG(RELEASE).split(',')[1], 'base64').toString('utf8');
  const pathData = (svg.match(/fill="#000" d="([^"]*)"/) || [])[1] || '';
  const points = new Set();
  const re = /M(\d+) (\d+)h1v1h-1z/g;
  let m;
  while ((m = re.exec(pathData))) points.add(m[1] + ',' + m[2]);
  let mismatch = 0;
  let dots = 0;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      const dark = native.isDark(row, col);
      if (dark) dots++;
      if (dark !== points.has((col + 4) + ',' + (row + 4))) mismatch++;
    }
  }
  assert.equal(dots, points.size);
  assert.equal(mismatch, 0);
});

// ---- update flow: QR mode never downloads in place ----

const appUpdates = require('../core/cmd/hongguotv/ui/updates.js');

test('Android QR mode hands available releases to onRelease instead of install', () => {
  const calls = [];
  const status = { state: 'available', desktop: false, latest_version: '0.2.175', release_url: RELEASE };
  const update = appUpdates.create({
    bridge: {
      getStatus: () => JSON.stringify(status),
      setPromptAllowed: () => {},
      check: () => calls.push('check'),
      install: () => calls.push('install')
    },
    canPrompt: () => true,
    qrMode: () => true,
    onRelease: data => calls.push('release:' + data.latest_version),
    render: () => {}
  });
  update.activate();
  assert.deepEqual(calls, ['release:0.2.175']);
});

test('QR mode falls back to normal check when no release URL is known', () => {
  const calls = [];
  const status = { state: 'available', desktop: false, latest_version: '0.2.175' };
  const update = appUpdates.create({
    bridge: {
      getStatus: () => JSON.stringify(status),
      setPromptAllowed: () => {},
      check: () => calls.push('check'),
      install: () => calls.push('install')
    },
    canPrompt: () => true,
    qrMode: () => true,
    onRelease: () => calls.push('release'),
    render: () => {}
  });
  update.activate();
  assert.deepEqual(calls, ['check']);
});

test('desktop and webOS keep their original activate behaviour', () => {
  const calls = [];
  const update = appUpdates.create({
    bridge: {
      getStatus: () => JSON.stringify({ state: 'ready', desktop: false, manual_install: true }),
      setPromptAllowed: () => {},
      check: () => calls.push('check'),
      install: () => calls.push('install')
    },
    canPrompt: () => true,
    qrMode: () => false,
    onRelease: () => calls.push('release'),
    render: () => {}
  });
  update.activate();
  assert.deepEqual(calls, ['install']);
});

// ---- UI wiring (source-level regression guards) ----

const appJS = fs.readFileSync(path.join(uiDir, 'app.js'), 'utf8');
const indexHTML = fs.readFileSync(path.join(uiDir, 'index.html'), 'utf8');
const javaSrc = fs.readFileSync(path.resolve(repoDir, 'android/app/src/main/java/rocks/aston/hongguotv/AppUpdater.java'), 'utf8');

test('index.html loads update-qr.js and defines the QR modal', () => {
  assert.match(indexHTML, /<script src="\/update-qr\.js"><\/script>/);
  assert.match(indexHTML, /id="update-qr-modal"/);
  assert.match(indexHTML, /id="update-qr-image"/);
  assert.match(indexHTML, /id="update-qr-close"[^>]*update-qr-action/);
});

test('app.js wires QR mode, manual-check flag and modal open/close', () => {
  assert.match(appJS, /qrMode: androidUpdateQRMode/);
  assert.match(appJS, /onRelease: function \(data\) \{ maybeShowUpdateQR\(data\); \}/);
  assert.match(appJS, /function androidUpdateQRMode\(\) \{ return !desktopShell && !webosShell; \}/);
  assert.match(appJS, /if \(androidUpdateQRMode\(\)\) updateQRRequested = true;/);
  assert.match(appJS, /var generator = window\.HongguoUpdateQR;/);
  assert.match(appJS, /generator\.toSVG\(releaseUrl, 260\)/);
});

test('Android publish derives release_url tag page from download URL base + version', () => {
  assert.match(javaSrc, /value\.put\("release_url", releasePage\(latest == null \? "" : latest\.url, latest == null \? "" : latest\.name\)\)/);
  const helper = javaSrc.slice(javaSrc.indexOf('static String releasePage('), javaSrc.indexOf('private void publish()'));
  assert.ok(helper.includes('/releases/download/'));
  assert.ok(helper.includes('/releases/tag/'));
  assert.ok(helper.includes('tag.matches('));
  assert.ok(helper.includes('"/releases/tag/v" + tag'));
  assert.doesNotMatch(javaSrc, /RELEASE_PAGE_URL/);
});

test('all three locales carry the QR update copy', () => {
  const keys = ['ui.scanUpdate', 'ui.updateQRTitle', 'ui.updateQRVersion', 'ui.updateQRHint', 'ui.updateQRClose', 'ui.updateQRAlt'];
  for (const name of ['zh-CN', 'zh-TW', 'ja-JP']) {
    const text = fs.readFileSync(path.join(uiDir, 'locales', name + '.js'), 'utf8');
    for (const key of keys) assert.ok(text.includes(key), name + ' missing ' + key);
  }
});

test('go:embed asset list includes update-qr.js', () => {
  const mainTest = fs.readFileSync(path.resolve(repoDir, 'core/cmd/hongguotv/main_test.go'), 'utf8');
  assert.match(mainTest, /"\/update-qr\.js"/);
});
