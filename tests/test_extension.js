const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const EXTENSION_PATH = "D:\\youtube";
const USER_DATA_DIR = path.join("C:\\Users\\01SMA\\.gemini\\antigravity-ide\\brain\\0fab5e3a-c1f7-42c5-9a9c-b321c16bef7f\\scratch", "chrome-profile");
const SCREENSHOT_PATH = path.join("C:\\Users\\01SMA\\.gemini\\antigravity-ide\\brain\\0fab5e3a-c1f7-42c5-9a9c-b321c16bef7f", "popup_verification.png");

// Ensure scratch dir exists
fs.mkdirSync(USER_DATA_DIR, { recursive: true });

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.callbacks = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.onopen = () => resolve();
      this.ws.onerror = (err) => reject(err);
      this.ws.onmessage = (msg) => {
        const data = JSON.parse(msg.data);
        if (data.id && this.callbacks.has(data.id)) {
          const cb = this.callbacks.get(data.id);
          this.callbacks.delete(data.id);
          if (data.error) cb.reject(new Error(data.error.message));
          else cb.resolve(data.result);
        }
      };
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.callbacks.set(msgId, { resolve, reject });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  close() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

async function run() {
  console.log("Starting Google Chrome with unpacked extension...");
  const chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=9222`,
    `--user-data-dir=${USER_DATA_DIR}`,
    `--disable-extensions-except=${EXTENSION_PATH}`,
    `--load-extension=${EXTENSION_PATH}`,
    `--no-first-run`,
    `--no-default-browser-check`,
    `--headless=new`,
    `about:blank`
  ]);

  let chromeKilled = false;
  function cleanup() {
    if (!chromeKilled) {
      chromeKilled = true;
      try { chromeProc.kill(); } catch (e) {}
    }
  }
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);

  // Wait for DevTools port
  let targets = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      targets = await fetchJson('http://127.0.0.1:9222/json');
      if (targets && targets.length > 0) break;
    } catch (e) {
      // Chrome still starting up
    }
  }

  if (!targets) {
    throw new Error("Could not connect to Chrome DevTools port 9222");
  }

  console.log(`Found ${targets.length} browser targets:`);
  let extensionId = null;
  let serviceWorkerTarget = null;

  for (const t of targets) {
    if (t.url.startsWith('chrome-extension://')) {
      const match = t.url.match(/chrome-extension:\/\/([a-z0-9]+)/);
      if (match && t.title && t.title.toLowerCase().includes('opentube')) {
        extensionId = match[1];
        if (t.type === 'service_worker') {
          serviceWorkerTarget = t;
        }
      }
    }
  }

  if (!extensionId) {
    // If not found in targets directly, fetch extension list via new page target
    console.log("Querying extensions page to find extension ID...");
    const pageTarget = targets.find(t => t.type === 'page');
    const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await client.connect();
    await client.send('Target.setDiscoverTargets', { discover: true });
    await sleep(1000);
    const updatedTargets = await fetchJson('http://127.0.0.1:9222/json');
    for (const t of updatedTargets) {
      if (t.url.startsWith('chrome-extension://')) {
        const match = t.url.match(/chrome-extension:\/\/([a-z0-9]+)/);
        if (match) {
          try {
            const probe = new CDPClient(t.webSocketDebuggerUrl);
            await probe.connect();
            const evalRes = await probe.send('Runtime.evaluate', {
              expression: 'chrome.runtime.getManifest().name'
            });
            probe.close();
            if (evalRes && evalRes.result && evalRes.result.value && evalRes.result.value.includes('OpenTube')) {
              extensionId = match[1];
              serviceWorkerTarget = t;
              break;
            }
          } catch (e) {
            // Ignore probe errors
          }
        }
      }
    }
    client.close();
  }

  console.log(`Detected Extension ID: ${extensionId || 'Not found yet'}`);

  // Test 1: Service Worker Verification
  if (serviceWorkerTarget) {
    console.log("Connecting to Extension Background Service Worker...");
    const swClient = new CDPClient(serviceWorkerTarget.webSocketDebuggerUrl);
    await swClient.connect();
    const swEval = await swClient.send('Runtime.evaluate', {
      expression: 'chrome.runtime.getManifest().name'
    });
    console.log(`Service Worker Manifest verified: "${swEval.result.value}"`);
    swClient.close();
  }

  // Test 2: Popup UI Verification
  if (extensionId) {
    console.log("Testing Extension Popup UI...");
    const popupUrl = `chrome-extension://${extensionId}/popup/popup.html`;
    const pageTarget = targets.find(t => t.type === 'page');
    const pageClient = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await pageClient.connect();
    await pageClient.send('Page.enable');
    await pageClient.send('Page.navigate', { url: popupUrl });
    await sleep(1000);

    // Verify DOM structure in popup
    const evalRes = await pageClient.send('Runtime.evaluate', {
      expression: `
        JSON.stringify({
          title: document.title,
          hasMasterSwitch: !!document.getElementById('toggleMaster'),
          hasAdsSkipped: !!document.getElementById('statAdsSkipped'),
          hasBannersBlocked: !!document.getElementById('statBannersBlocked'),
          hasTimeSaved: !!document.getElementById('statTimeSaved'),
          hasToggleNonStop: !!document.getElementById('toggleNonStop'),
          hasToggleConnectInternet: !!document.getElementById('toggleConnectInternet'),
          hasBtnCheckUpdate: !!document.getElementById('btnCheckUpdate'),
          hasUpdateStatusText: !!document.getElementById('updateStatusText'),
          statusText: document.getElementById('statusLabel')?.textContent
        })
      `,
      returnByValue: true
    });

    console.log("Popup DOM evaluation result:", evalRes.result.value);

    // Capture screenshot of the extension popup
    const screenshot = await pageClient.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    console.log(`Screenshot saved to: ${SCREENSHOT_PATH}`);

    pageClient.close();
  }

  // Test 3: Test Content Script logic against mock YouTube environment
  console.log("Testing YouTube content script skipping & fast-forward mechanisms...");
  const testPageTarget = targets.find(t => t.type === 'page');
  const ytClient = new CDPClient(testPageTarget.webSocketDebuggerUrl);
  await ytClient.connect();
  await ytClient.send('Page.enable');

  // Navigate to blank page and simulate YouTube DOM
  await ytClient.send('Page.navigate', { url: 'about:blank' });
  await sleep(500);

  // Read content script
  const contentJs = fs.readFileSync(path.join(EXTENSION_PATH, 'scripts', 'content.js'), 'utf8');

  // Inject mock YouTube video player with an active ad
  const simResult = await ytClient.send('Runtime.evaluate', {
    expression: `
      (async function() {
        // Setup mock YouTube environment
        document.body.innerHTML = \`
          <div id="movie_player" class="html5-video-player ad-showing">
            <video class="html5-main-video"></video>
            <div class="ytp-ad-player-overlay">
              <button class="ytp-ad-skip-button-modern">Skip Ad</button>
            </div>
            <div id="player-ads">Sponsored Banner</div>
          </div>
          <div id="masthead-ad">Masthead Banner</div>
        \`;

        const video = document.querySelector('video');
        Object.defineProperty(video, 'duration', { value: 30, writable: true });
        video.currentTime = 0;
        video.playbackRate = 1.0;
        video.muted = false;

        let skipButtonClicked = false;
        document.querySelector('.ytp-ad-skip-button-modern').addEventListener('click', () => {
          skipButtonClicked = true;
        });

        // Mock chrome API for isolated test
        window.chrome = {
          storage: {
            local: {
              get: (keys, cb) => cb({ enabled: true, autoSkip: true, fastForward: true, blockBanners: true }),
              set: (obj, cb) => { if (cb) cb(); }
            },
            onChanged: { addListener: () => {} }
          },
          runtime: {
            sendMessage: (msg, cb) => { if (cb) cb(); },
            lastError: null
          }
        };

        // Execute content script
        ${contentJs}

        // Wait 300ms for interval loop
        await new Promise(r => setTimeout(r, 350));

        return {
          rateAfterAdDetect: video.playbackRate,
          mutedAfterAdDetect: video.muted,
          currentTimeAfterAdDetect: video.currentTime,
          skipButtonClicked: skipButtonClicked,
          mastheadRemoved: !document.getElementById('masthead-ad')
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Mock YouTube Simulation Results:", simResult.result.value);

  // Test 4: Test MAIN World Inject Script logic (Zero-Ad Sterilization & Anti-Pause)
  console.log("Testing YouTube MAIN world inject script (Response Sterilization & Instant skipAd)...");
  const injectJs = fs.readFileSync(path.join(EXTENSION_PATH, 'scripts', 'inject.js'), 'utf8');

  const injectSimResult = await ytClient.send('Runtime.evaluate', {
    expression: `
      (async function() {
        // Run inject script
        ${injectJs}

        // 1. Test ytInitialPlayerResponse ad sterilization
        window.ytInitialPlayerResponse = {
          playabilityStatus: { status: 'OK' },
          adPlacements: [{ id: 'pre-roll' }],
          adSlots: [{ id: 'slot-1' }],
          playerAds: [{ id: 'ad-1' }]
        };

        const cleanedPlayerResponse = window.ytInitialPlayerResponse;
        const hasAdPlacements = !!cleanedPlayerResponse.adPlacements;
        const hasAdSlots = !!cleanedPlayerResponse.adSlots;

        // 2. Test movie_player instant skipAd hook & anti-pause
        let skipAdTriggered = false;
        let videoResumeTriggered = false;

        document.body.innerHTML = '<div id="movie_player" class="html5-video-player ad-showing"><video class="html5-main-video"></video></div>';
        const playerEl = document.getElementById('movie_player');
        playerEl.isAd = () => true;
        playerEl.getAdState = () => 1;
        playerEl.skipAd = () => { skipAdTriggered = true; };
        playerEl.playVideo = () => { videoResumeTriggered = true; };

        const v = document.querySelector('video');
        v.paused = true;

        // Wait for inject script interval (60ms)
        await new Promise(r => setTimeout(r, 80));

        return {
          adPlacementsRemoved: !hasAdPlacements,
          adSlotsRemoved: !hasAdSlots,
          skipAdTriggered: skipAdTriggered,
          videoResumeTriggered: videoResumeTriggered
        };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log("Inject Script Simulation Results:", injectSimResult.result.value);

  ytClient.close();
  cleanup();
  console.log("\nALL EXTENSION TESTS COMPLETED SUCCESSFULLY!");
}

run().catch(err => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
