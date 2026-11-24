const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../core/cmd/hongguotv/ui/app.js'), 'utf8');
// warmNextEpisodeCover, prewarmEpisodeCover, episodeCoverTargetCurrent and
// reusePrewarmedEpisodeCover live contiguously before setEpisodeCover.
const slice = source.slice(source.indexOf('  function warmNextEpisodeCover('), source.indexOf('  function setEpisodeCover('));

function harness() {
  const prewarmCalls = [];
  const state = {
    accountEpoch: 2,
    feedGeneration: 7,
    activePlayback: null,
    prewarmedEpisodeCover: null,
    applicationInBackground: false,
    applicationHidden: () => false,
    engagement: {
      prewarm(target) {
        prewarmCalls.push(target);
        return Promise.resolve({ series_id: target.series_id, vid: target.vid, episode_cover: 'https://img.example/next.jpg' });
      }
    },
    // No prefetch entry: the next-episode cover must warm anyway.
    episodePrefetch: { peek: () => null },
    Image: function () {
      var self = this;
      Object.defineProperty(this, 'src', {
        set(value) { self._src = value; setImmediate(function () { if (self.onload) self.onload(); }); },
        get() { return self._src; }
      });
    },
    Promise, Object, Number, String, Date,
    setTimeout, clearTimeout, setImmediate
  };
  const context = vm.createContext(state);
  vm.runInContext(slice, context);
  return {context, state, prewarmCalls};
}

function activePlayback(overrides) {
  return Object.assign({
    item: {series_id: '9001', vid_list: ['111', '222', '333']},
    episode: 1,
    vid: '111',
    generation: 7,
    owner: 2,
    episodeCoverAllowed: true
  }, overrides || {});
}

test('attaching a source warms the next episode cover using the next VID without a media prefetch', async () => {
  const h = harness();
  const playback = activePlayback();
  h.state.activePlayback = playback;
  h.context.warmNextEpisodeCover(playback);
  for (let i=0;i<5;i++) await new Promise(r => setImmediate(r));
  assert.equal(h.prewarmCalls.length, 1);
  assert.equal(h.prewarmCalls[0].series_id, '9001');
  assert.equal(h.prewarmCalls[0].vid, '222');
  assert.equal(h.prewarmCalls[0].episode, 2);
  // The decoded cover becomes ready even though episodePrefetch.peek() is null.
  assert.ok(h.state.prewarmedEpisodeCover, 'the next-episode cover is cached');
  assert.equal(h.state.prewarmedEpisodeCover.ready, true);
  assert.equal(h.state.prewarmedEpisodeCover.vid, '222');
});

test('a cover for a non-next VID is rejected so stale artwork never flashes', async () => {
  const h = harness();
  const playback = activePlayback();
  h.state.activePlayback = playback;
  // Ask the cover warmer directly for an arbitrary VID that is not the next
  // entry; isStillRelevant must refuse it.
  h.context.prewarmEpisodeCover({series_id: '9001', vid: '999', episode: 2},
    {episode_cover: 'https://img.example/wrong.jpg'}, playback);
  // Drive the fake Image onload.
  const record = h.state.prewarmedEpisodeCover;
  assert.ok(record);
  record.image.onload();
  await new Promise(r => setImmediate(r));
  assert.equal(record.ready, false, 'a VID that is not the next episode must not be accepted');
});

test('a switched-away playback session cannot land a late cover warm', async () => {
  const h = harness();
  const playback = activePlayback();
  const other = activePlayback({generation: 8});
  h.state.activePlayback = playback;
  h.context.warmNextEpisodeCover(playback);
  // The viewer switches again before the prewarm resolves.
  h.state.activePlayback = other;
  await new Promise(r => setImmediate(r));
  assert.equal(h.state.prewarmedEpisodeCover, null, 'a stale session must not cache a cover');
});

test('first or final episode with no next VID does not prewarm', async () => {
  const h = harness();
  const playback = activePlayback({item: {series_id: '9001', vid_list: ['111']}, episode: 1});
  h.state.activePlayback = playback;
  h.context.warmNextEpisodeCover(playback);
  await new Promise(r => setImmediate(r));
  assert.equal(h.prewarmCalls.length, 0);
});
