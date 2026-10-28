/**
 * Test Suite for scripts/inject.js
 * Verifies player response sterilization, network mocking, and player API ad skipping.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Create mock browser DOM environment
function createMockEnvironment() {
  const listeners = {};
  const postMessages = [];

  const mockWindow = {
    addEventListener: (type, handler) => {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(handler);
    },
    removeEventListener: (type, handler) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(h => h !== handler);
    },
    dispatchEvent: (event) => {
      if (listeners[event.type]) {
        for (const h of listeners[event.type]) h(event);
      }
    },
    postMessage: (msg, target) => {
      postMessages.push(msg);
    },
    Date: Date,
    JSON: JSON,
    Response: class MockResponse {
      constructor(body, init = {}) {
        this._body = body;
        this.status = init.status || 200;
        this.statusText = init.statusText || 'OK';
        this.headers = init.headers || {};
      }
      async json() {
        return JSON.parse(this._body);
      }
      async text() {
        return this._body;
      }
      clone() {
        return new MockResponse(this._body, {
          status: this.status,
          statusText: this.statusText,
          headers: this.headers
        });
      }
    },
    Event: class MockEvent {
      constructor(type) {
        this.type = type;
      }
    }
  };

  const mockDocument = {
    documentElement: {
      addEventListener: mockWindow.addEventListener
    },
    body: {
      innerHTML: ''
    },
    getElementById: (id) => null,
    querySelector: (sel) => null,
    querySelectorAll: (sel) => [],
    addEventListener: mockWindow.addEventListener
  };

  class MockXHR {
    constructor() {
      this._listeners = {};
    }
    open(method, url) {
      this.method = method;
      this.url = url;
    }
    send(body) {
      this.body = body;
    }
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    }
    dispatchEvent(e) {
      if (this._listeners[e.type]) {
        for (const fn of this._listeners[e.type]) fn(e);
      }
    }
  }

  class MockMutationObserver {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {}
    disconnect() {}
  }

  class MockHTMLMediaElement {
    pause() {
      this.paused = true;
    }
    play() {
      this.paused = false;
    }
  }

  return {
    window: mockWindow,
    document: mockDocument,
    XMLHttpRequest: MockXHR,
    MutationObserver: MockMutationObserver,
    HTMLMediaElement: MockHTMLMediaElement,
    postMessages
  };
}

async function runTests() {
  console.log("=== RUNNING INJECT.JS AD-BLOCKING TESTS ===");

  const injectCode = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'inject.js'), 'utf8');

  // Test 1: Window Variable Sterilization (ytInitialPlayerResponse)
  console.log("\n[Test 1] Testing ytInitialPlayerResponse ad placement sterilization...");
  const env1 = createMockEnvironment();
  
  // Set up mock window and run inject.js in that context
  const runInEnv = (env) => {
    const fn = new Function(
      'window',
      'document',
      'XMLHttpRequest',
      'MutationObserver',
      'Response',
      'Event',
      'setInterval',
      'HTMLMediaElement',
      injectCode
    );
    fn(
      env.window,
      env.document,
      env.XMLHttpRequest,
      env.MutationObserver,
      env.window.Response,
      env.window.Event,
      (cb, ms) => { env._intervalCb = cb; return 1; },
      env.HTMLMediaElement
    );
  };

  runInEnv(env1);

  // Simulate YouTube setting ytInitialPlayerResponse
  env1.window.ytInitialPlayerResponse = {
    playabilityStatus: { status: 'OK' },
    streamingData: { formats: [] },
    adPlacements: [
      { adPlacementRenderer: { id: 'pre-roll-1' } }
    ],
    adSlots: [
      { slotId: 'slot-1' }
    ],
    playerAds: [
      { adId: 'ad-123' }
    ],
    adBreakHeartbeatParams: { token: 'abc' }
  };

  const cleanResp = env1.window.ytInitialPlayerResponse;
  assert.strictEqual(cleanResp.adPlacements, undefined, "adPlacements should be deleted");
  assert.strictEqual(cleanResp.adSlots, undefined, "adSlots should be deleted");
  assert.strictEqual(cleanResp.playerAds, undefined, "playerAds should be deleted");
  assert.strictEqual(cleanResp.adBreakHeartbeatParams, undefined, "adBreakHeartbeatParams should be deleted");
  assert.strictEqual(cleanResp.playabilityStatus.status, 'OK', "playabilityStatus should remain OK");
  console.log("PASSED: ytInitialPlayerResponse sterilized cleanly, zero ads scheduled.");

  // Test 2: Fetch Interception on /youtubei/v1/player
  console.log("\n[Test 2] Testing fetch(/youtubei/v1/player) interception...");
  const env2 = createMockEnvironment();
  
  // Mock original fetch
  env2.window.fetch = async function(url, options) {
    return new env2.window.Response(JSON.stringify({
      playabilityStatus: { status: 'OK' },
      adPlacements: [{ id: 'midroll-1' }],
      adSlots: [{ id: 'slot-mid' }]
    }));
  };

  runInEnv(env2);

  const fetchRes = await env2.window.fetch('https://www.youtube.com/youtubei/v1/player?key=123');
  const fetchJson = await fetchRes.json();
  assert.strictEqual(fetchJson.adPlacements, undefined, "Fetched response must not contain adPlacements");
  assert.strictEqual(fetchJson.adSlots, undefined, "Fetched response must not contain adSlots");
  assert.strictEqual(fetchJson.playabilityStatus.status, 'OK');
  console.log("PASSED: /youtubei/v1/player fetch intercepted & sterilized without ads.");

  // Test 3: Tracking / Ad endpoints return 200 OK without errors
  console.log("\n[Test 3] Testing /api/stats/ads & /pagead/ stealth response...");
  const statsRes = await env2.window.fetch('https://www.youtube.com/api/stats/ads?v=xyz');
  assert.strictEqual(statsRes.status, 200, "Stats ads endpoint must return status 200");
  const statsJson = await statsRes.json();
  assert.strictEqual(statsJson.status, 'ok');

  const pageadRes = await env2.window.fetch('https://www.youtube.com/pagead/adview?ai=xyz');
  assert.strictEqual(pageadRes.status, 200, "Pagead endpoint must return status 200");
  console.log("PASSED: Ad stats and pagead endpoints faked 200 OK cleanly.");

  // Test 4: Player Engine Hooking (movie_player.skipAd())
  console.log("\n[Test 4] Testing player engine instant skipAd() hook...");
  const env3 = createMockEnvironment();
  let skipAdCalled = false;
  let videoPlayed = false;

  const mockVideo = {
    muted: false,
    duration: 15,
    currentTime: 0,
    playbackRate: 1.0,
    paused: true,
    ended: false,
    play: async () => { videoPlayed = true; mockVideo.paused = false; }
  };

  const mockPlayer = {
    classList: {
      contains: (cls) => cls === 'ad-showing'
    },
    isAd: () => true,
    getAdState: () => 1,
    skipAd: () => { skipAdCalled = true; },
    playVideo: () => { videoPlayed = true; mockVideo.paused = false; },
    querySelector: (sel) => null
  };

  env3.document.getElementById = (id) => id === 'movie_player' ? mockPlayer : null;
  env3.document.querySelector = (sel) => {
    if (sel.includes('video')) return mockVideo;
    if (sel.includes('movie_player')) return mockPlayer;
    return null;
  };

  runInEnv(env3);

  // Trigger neutralization loop
  env3._intervalCb();

  assert.strictEqual(skipAdCalled, true, "player.skipAd() must be invoked immediately");
  assert.strictEqual(mockVideo.muted, true, "Video must be muted during ad");
  assert.strictEqual(mockVideo.currentTime, 15, "Video currentTime must jump to duration");
  assert.strictEqual(mockVideo.playbackRate, 16.0, "PlaybackRate must be set to 16.0");
  assert.strictEqual(videoPlayed, true, "Video must automatically resume playback");
  console.log("PASSED: Player engine instant skipAd() triggered and video resumed seamlessly.");

  // Test 6: Inactivity Confirmation Dialog Auto-Dismissal ("Video paused. Continue watching?")
  console.log("\n[Test 6] Testing Inactivity Confirmation Dialog Auto-Dismissal...");
  const env4 = createMockEnvironment();
  let confirmBtnClicked = false;
  let dialogRemoved = false;
  let backdropRemoved = false;

  const mockConfirmBtn = {
    click: () => { confirmBtnClicked = true; }
  };
  const mockDialog = {
    remove: () => { dialogRemoved = true; }
  };
  const mockBackdrop = {
    remove: () => { backdropRemoved = true; }
  };

  env4.document.querySelector = (sel) => {
    if (sel.includes('confirm-button')) return mockConfirmBtn;
    if (sel.includes('video')) return { paused: false, ended: false };
    if (sel.includes('movie_player') || sel.includes('html5-video-player')) {
      return { classList: { contains: () => false }, playVideo: () => {} };
    }
    return null;
  };
  env4.document.querySelectorAll = (sel) => {
    if (sel.includes('confirm-dialog') || sel.includes('paper-dialog')) return [mockDialog];
    if (sel.includes('backdrop')) return [mockBackdrop];
    return [];
  };

  runInEnv(env4);

  // Trigger interval check
  env4._intervalCb();
  assert.strictEqual(confirmBtnClicked, true, "Inactivity dialog confirm button must be auto-clicked");
  assert.strictEqual(dialogRemoved, true, "Inactivity dialog must be removed from DOM");
  assert.strictEqual(backdropRemoved, true, "Modal backdrop must be removed from DOM");
  console.log("PASSED: Inactivity confirmation dialog auto-clicked and dismissed.");

  // Test 7: Programmatic Pause Suppression (e.g. anti-adblock test pause after a few seconds)
  console.log("\n[Test 7] Testing Programmatic HTMLMediaElement pause suppression...");
  const env5 = createMockEnvironment();
  runInEnv(env5);

  const testVideo = new env5.HTMLMediaElement();
  testVideo.tagName = 'VIDEO';
  testVideo.paused = false;
  testVideo.ended = false;

  // Simulate YouTube script calling video.pause() with no recent user click
  testVideo.pause();
  assert.strictEqual(testVideo.paused, false, "Programmatic pause without trusted user interaction must be suppressed");
  console.log("PASSED: Unwanted programmatic auto-pause was intercepted and suppressed.");

  // Test 8: Respecting intentional user pause
  console.log("\n[Test 8] Testing Intentional User Pause...");
  // Simulate trusted user click on player/pause button
  env5.window.dispatchEvent({
    type: 'click',
    isTrusted: true,
    target: {
      closest: (sel) => sel.includes('ytp-play-button') ? true : null
    }
  });

  // Now video.pause() is called as part of user gesture
  testVideo.pause();
  assert.strictEqual(testVideo.paused, true, "User intentional pause must be respected");
  console.log("PASSED: Intentional user pause was honored.");

  // Test 9: Navigation / Autoplay to Next Video resets user pause
  console.log("\n[Test 9] Testing Autoplay Navigation Reset...");
  // Simulate YouTube navigating to next video
  env5.window.dispatchEvent({ type: 'yt-navigate-finish' });
  testVideo.paused = false;

  // Now YouTube script tries to auto-pause again without user interaction
  testVideo.pause();
  assert.strictEqual(testVideo.paused, false, "Autoplay to next video must reset intentional pause and block auto-pauses");
  console.log("PASSED: Autoplay navigation reset verified, continuous playback ensured.");

  console.log("\n>>> ALL INJECT.JS TESTS PASSED SUCCESSFULLY! <<<\n");
}

runTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});
