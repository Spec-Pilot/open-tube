/**
 * OpenTube AdShield - Injected Script (MAIN World)
 * Direct access to YouTube player engine, window variables, fetch, and XHR.
 * Completely eliminates ad placements before YouTube's player can ever schedule or open them.
 */

(function () {
  'use strict';

  if (window.__OPENTUBE_INJECTED__) return;
  window.__OPENTUBE_INJECTED__ = true;

  // Runtime configuration state
  let config = {
    enabled: true,
    nonStop: true,
    bypassAntiAdblock: true,
    fastForward: true,
    autoSkip: true
  };

  // Safe sender for stat reporting
  function sendStat(statType, count = 1) {
    const targetOrigin =
      typeof window !== 'undefined' && window.location && typeof window.location.origin === 'string' && window.location.origin.startsWith('http')
        ? window.location.origin
        : '*';
    window.postMessage({ type: 'OPENTUBE_STAT', statType, count }, targetOrigin);
  }

  // Listen for config sync from content script with strict whitelist and type checking
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'OPENTUBE_CONFIG_UPDATE' && event.data.config && typeof event.data.config === 'object') {
      const allowedKeys = ['enabled', 'nonStop', 'bypassAntiAdblock', 'fastForward', 'autoSkip', 'blockBanners'];
      for (const key of allowedKeys) {
        if (typeof event.data.config[key] === 'boolean') {
          config[key] = event.data.config[key];
        }
      }
    }
  });

  // Track user actions and deliberate pause intentions vs YouTube script auto-pauses
  let lastUserActionTime = 0;
  let lastPauseTime = 0;
  let userIntentionallyPaused = false;

  function registerUserAction(e) {
    // Only real user gestures count (ignore synthetic events)
    if (e && (e.isTrusted || e.isTrusted === undefined)) {
      lastUserActionTime = Date.now();

      // Check if user interacted with player or typed to toggle play/pause
      const target = e.target;
      const isPlayerAction = target && (
        target.closest?.('#movie_player') ||
        target.closest?.('.html5-video-player') ||
        target.closest?.('.html5-main-video') ||
        target.closest?.('.ytp-play-button') ||
        target.closest?.('button[aria-label*="Play" i]') ||
        target.closest?.('button[aria-label*="Pause" i]') ||
        target.tagName === 'VIDEO'
      );
      const isPlayPauseKey = e.key === ' ' || e.key === 'k' || e.key === 'K' || e.code === 'Space' || e.key === 'MediaPlayPause';

      if (isPlayerAction || isPlayPauseKey) {
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        // If video is paused, interaction indicates deliberate intent to play/unpause
        // Guard against the trailing click/mouseup of the gesture that just paused it
        if (video && video.paused && (Date.now() - lastPauseTime > 300)) {
          userIntentionallyPaused = false;
        }
      }
    }
  }
  window.addEventListener('click', registerUserAction, true);
  window.addEventListener('keydown', registerUserAction, true);
  window.addEventListener('touchstart', registerUserAction, true);
  window.addEventListener('pointerdown', registerUserAction, true);
  window.addEventListener('mousedown', registerUserAction, true);

  // Clear deliberate pause flag when navigating to next video or when autoplay begins
  function onNavigationReset() {
    userIntentionallyPaused = false;
    lastUserActionTime = 0;
    lastPauseTime = 0;
  }
  window.addEventListener('yt-navigate-finish', onNavigationReset, true);
  window.addEventListener('yt-navigate-start', onNavigationReset, true);
  window.addEventListener('yt-page-data-updated', onNavigationReset, true);
  window.addEventListener('spfdone', onNavigationReset, true);

  // When a video starts playing:
  document.addEventListener('play', (e) => {
    if (e.target && e.target.tagName === 'VIDEO') {
      const timeSinceUser = Date.now() - lastUserActionTime;
      // Only reset deliberate pause if user initiated playback or video reached end
      if (timeSinceUser < 1000 || e.target.ended) {
        userIntentionallyPaused = false;
      }
    }
  }, true);

  // Keep YouTube active: prevent YouTube's inactivity auto-pause timer ("Video paused. Continue watching?")
  try {
    setInterval(() => {
      if (config.enabled && config.nonStop) {
        try {
          window._lact = Date.now();
        } catch (e) { }
      }
    }, 5000);
  } catch (e) { }

  // Prevent background tab throttling from pausing unattended music playback
  try {
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true
    });
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true
    });
    window.addEventListener(
      'visibilitychange',
      (e) => {
        if (config.enabled && config.nonStop) {
          e.stopImmediatePropagation();
        }
      },
      true
    );
  } catch (e) { }

  // Hook HTMLMediaElement.prototype.pause to suppress unwanted script-induced pauses
  // (e.g. YouTube anti-adblock test pauses or autoplay inactivity pauses)
  try {
    if (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype && HTMLMediaElement.prototype.pause) {
      const originalVideoPause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function () {
        if (config.enabled && config.nonStop && this.tagName === 'VIDEO') {
          const timeSinceUser = Date.now() - lastUserActionTime;
          const isRecentUserAction = timeSinceUser < 1000;

          // If the pause was NOT initiated by trusted user interaction, video has not ended,
          // and user didn't intentionally pause: suppress the pause!
          if (!isRecentUserAction && !this.ended && !userIntentionallyPaused) {
            return;
          }
        }
        return originalVideoPause.apply(this, arguments);
      };
    }
  } catch (e) { }

  /**
   * 1. PLAYER DATA STERILIZATION
   * Strips ad placements, ad slots, and ad break heartbeat parameters so YouTube player
   * initializes identical to YouTube Premium (zero ads scheduled).
   */
  function cleanPlayerResponse(response) {
    if (!response || typeof response !== 'object') return response;

    try {
      // Remove scheduled ad placements and slots
      if (response.adPlacements) delete response.adPlacements;
      if (response.adSlots) delete response.adSlots;
      if (response.playerAds) delete response.playerAds;
      if (response.adBreakHeartbeatParams) delete response.adBreakHeartbeatParams;
      if (response.adSignalsInfo) delete response.adSignalsInfo;
      if (response.paidContentOverlay) delete response.paidContentOverlay;

      // Handle nested player responses
      if (response.playerResponse && typeof response.playerResponse === 'object') {
        cleanPlayerResponse(response.playerResponse);
      }

      // Bypass anti-adblock enforcement modal if present in player response
      if (response.auxiliaryUi && response.auxiliaryUi.messageRenderers) {
        if (response.auxiliaryUi.messageRenderers.enforcementMessageViewModel) {
          delete response.auxiliaryUi;
        }
      }

      // Restore playability if YouTube flagged adblocker
      if (response.playabilityStatus) {
        const status = response.playabilityStatus.status;
        const reason = (response.playabilityStatus.reason || '').toLowerCase();
        const subreason = (response.playabilityStatus.messages?.[0] || '').toLowerCase();

        if (status === 'UNPLAYABLE' || reason.includes('ad blocker') || subreason.includes('ad blocker')) {
          response.playabilityStatus.status = 'OK';
          delete response.playabilityStatus.reason;
          delete response.playabilityStatus.messages;
          delete response.playabilityStatus.errorScreen;
        }
      }
    } catch (err) {
      // Guard against object freeze or mutation errors
    }

    return response;
  }

  /**
   * 2. INITIAL DATA STERILIZATION
   * Strips feed ads, mastheads, and sponsored items from ytInitialData / /next API.
   */
  function cleanInitialData(data) {
    if (!data || typeof data !== 'object') return data;

    try {
      const jsonStr = JSON.stringify(data);
      if (
        jsonStr.includes('adSlotRenderer') ||
        jsonStr.includes('inFeedAdLayoutRenderer') ||
        jsonStr.includes('masthead') ||
        jsonStr.includes('promotedSparklesWebRenderer')
      ) {
        // Fast recursive removal of ad renderers
        const removeAdKeys = (obj) => {
          if (!obj || typeof obj !== 'object') return;
          if (Array.isArray(obj)) {
            for (let i = obj.length - 1; i >= 0; i--) {
              const item = obj[i];
              if (
                item &&
                (item.adSlotRenderer ||
                  item.inFeedAdLayoutRenderer ||
                  item.promotedSparklesWebRenderer ||
                  item.compactPromotedVideoRenderer ||
                  item.statementBannerRenderer)
              ) {
                obj.splice(i, 1);
              } else {
                removeAdKeys(item);
              }
            }
          } else {
            for (const key of Object.keys(obj)) {
              if (
                key === 'adSlotRenderer' ||
                key === 'inFeedAdLayoutRenderer' ||
                key === 'promotedSparklesWebRenderer'
              ) {
                delete obj[key];
              } else {
                removeAdKeys(obj[key]);
              }
            }
          }
        };
        removeAdKeys(data);
      }
    } catch (err) { }

    return data;
  }

  /**
   * 3. WINDOW VARIABLE HOOKS
   * Intercepts ytInitialPlayerResponse and ytInitialData before any YouTube player script runs.
   */
  let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;
  if (_ytInitialPlayerResponse) {
    cleanPlayerResponse(_ytInitialPlayerResponse);
  }

  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    get() {
      return _ytInitialPlayerResponse;
    },
    set(val) {
      _ytInitialPlayerResponse = cleanPlayerResponse(val);
      sendStat('ad', 1);
    },
    configurable: true,
    enumerable: true
  });

  let _ytInitialData = window.ytInitialData;
  if (_ytInitialData) {
    cleanInitialData(_ytInitialData);
  }

  Object.defineProperty(window, 'ytInitialData', {
    get() {
      return _ytInitialData;
    },
    set(val) {
      _ytInitialData = cleanInitialData(val);
    },
    configurable: true,
    enumerable: true
  });

  // Hook ytplayer config args if set
  function sanitizePlayerArgs(args) {
    if (!args || typeof args !== 'object') return;
    try {
      if (args.raw_player_response) {
        if (typeof args.raw_player_response === 'string') {
          try {
            const parsed = JSON.parse(args.raw_player_response);
            cleanPlayerResponse(parsed);
            args.raw_player_response = JSON.stringify(parsed);
          } catch (e) { }
        } else if (typeof args.raw_player_response === 'object') {
          cleanPlayerResponse(args.raw_player_response);
        }
      }
      if (args.player_response) {
        if (typeof args.player_response === 'string') {
          try {
            const parsed = JSON.parse(args.player_response);
            cleanPlayerResponse(parsed);
            args.player_response = JSON.stringify(parsed);
          } catch (e) { }
        } else if (typeof args.player_response === 'object') {
          cleanPlayerResponse(args.player_response);
        }
      }
    } catch (e) { }
  }

  let _ytplayer = window.ytplayer;
  Object.defineProperty(window, 'ytplayer', {
    get() {
      return _ytplayer;
    },
    set(val) {
      _ytplayer = val;
      if (_ytplayer && _ytplayer.config && _ytplayer.config.args) {
        sanitizePlayerArgs(_ytplayer.config.args);
      }
    },
    configurable: true,
    enumerable: true
  });

  /**
   * 4. FETCH API INTERCEPTOR
   * Sanitizes all player and navigation requests on the fly and swallows ad tracking
   * without network errors (preventing anti-adblock detection).
   */
  const originalFetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url ? input.url : '');

    // Fake success for YouTube ad tracking and stats so YouTube never detects blocked requests
    if (
      url.includes('/api/stats/ads') ||
      url.includes('/pagead/') ||
      url.includes('/ptracking') ||
      url.includes('/api/stats/qoe?adformat=')
    ) {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Intercept YouTube player API call (/youtubei/v1/player)
    if (url.includes('/youtubei/v1/player')) {
      try {
        const response = await originalFetch.apply(this, arguments);
        const clone = response.clone();
        const data = await clone.json();
        cleanPlayerResponse(data);

        sendStat('ad', 1);

        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (err) {
        return originalFetch.apply(this, arguments);
      }
    }

    // Intercept YouTube navigation / next API call (/youtubei/v1/next)
    if (url.includes('/youtubei/v1/next')) {
      try {
        const response = await originalFetch.apply(this, arguments);
        const clone = response.clone();
        const data = await clone.json();
        cleanInitialData(data);

        return new Response(JSON.stringify(data), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers
        });
      } catch (err) {
        return originalFetch.apply(this, arguments);
      }
    }

    return originalFetch.apply(this, arguments);
  };

  /**
   * 5. XMLHTTPREQUEST INTERCEPTOR
   * Intercepts legacy XHR player and ad tracking requests.
   */
  const originalXHROpen = XMLHttpRequest.prototype.open;
  const originalXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._otUrl = typeof url === 'string' ? url : '';
    return originalXHROpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    // Return dummy 200 OK for tracking endpoints
    if (
      this._otUrl &&
      (this._otUrl.includes('/api/stats/ads') ||
        this._otUrl.includes('/pagead/') ||
        this._otUrl.includes('/ptracking'))
    ) {
      Object.defineProperty(this, 'readyState', { value: 4, writable: true });
      Object.defineProperty(this, 'status', { value: 200, writable: true });
      Object.defineProperty(this, 'statusText', { value: 'OK', writable: true });
      Object.defineProperty(this, 'responseText', { value: '{"status":"ok"}', writable: true });
      Object.defineProperty(this, 'response', { value: '{"status":"ok"}', writable: true });

      setTimeout(() => {
        this.dispatchEvent(new Event('readystatechange'));
        this.dispatchEvent(new Event('load'));
        this.dispatchEvent(new Event('loadend'));
      }, 0);
      return;
    }

    // Clean player response in XHR
    if (this._otUrl && this._otUrl.includes('/youtubei/v1/player')) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          try {
            const data = JSON.parse(this.responseText);
            cleanPlayerResponse(data);
            const cleanText = JSON.stringify(data);
            Object.defineProperty(this, 'responseText', { value: cleanText, writable: true });
            Object.defineProperty(this, 'response', { value: cleanText, writable: true });
            sendStat('ad', 1);
          } catch (e) { }
        }
      });
    }

    return originalXHRSend.apply(this, arguments);
  };

  /**
   * 6. PLAYER ENGINE CONTROL & NON-STOP ANTI-PAUSE SHIELD
   * Direct hook into #movie_player to instantly skip any active ad in 0ms,
   * dismiss confirmation dialogs, and resume playback for continuous music/autoplay.
   */
  let lastAdSkippedTime = 0;
  function neutralizePlayerAd() {
    const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');

    if (!player) return;

    // Check if player has entered ad state
    const isAdPlaying =
      (typeof player.isAd === 'function' && player.isAd()) ||
      (typeof player.getAdState === 'function' && player.getAdState() > 0) ||
      Boolean(player.classList?.contains?.('ad-showing')) ||
      Boolean(player.classList?.contains?.('ad-interrupting'));

    if (isAdPlaying) {
      // 1. Instantly trigger YouTube's native skipAd() method
      if (typeof player.skipAd === 'function') {
        try {
          player.skipAd();
        } catch (e) { }
      }

      // 2. Mute and jump to end to instantly clear unskippable ads
      if (video) {
        video.muted = true;
        if (isFinite(video.duration) && video.duration > 0) {
          video.currentTime = video.duration;
        }
        if (video.playbackRate !== 16.0) {
          video.playbackRate = 16.0;
        }
      }

      // 3. Immediately click any skip button in DOM
      const skipButtons = [
        '.ytp-ad-skip-button-modern',
        '.ytp-ad-skip-button',
        '.ytp-skip-ad-button',
        'button.ytp-ad-skip-button-text',
        '.ytp-ad-overlay-close-button'
      ];
      for (const sel of skipButtons) {
        const btn = document.querySelector(sel);
        if (btn) {
          btn.click();
          break;
        }
      }

      // Record stat throttled
      const now = Date.now();
      if (now - lastAdSkippedTime > 1500) {
        lastAdSkippedTime = now;
        sendStat('ad', 1);
      }

      // Force resume video if YouTube paused it
      if (typeof player.playVideo === 'function') {
        player.playVideo();
      } else if (video && video.paused) {
        video.play().catch(() => { });
      }
    }

    // Auto-resume video only if paused by YouTube's ad interruption or anti-adblock enforcement
    if (config.enabled && video && video.paused && !video.ended) {
      const wasRecentAd = Date.now() - lastAdSkippedTime < 3000;
      const isAdClass = Boolean(player.classList?.contains?.('ad-showing') || player.classList?.contains?.('ad-interrupting'));
      const hasEnforcement = !!document.querySelector(
        'ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)'
      );

      // Only auto-resume if an ad was active or anti-adblock enforcement was detected
      // Never auto-resume if video was intentionally paused by the user
      const shouldResume = (wasRecentAd || isAdClass || hasEnforcement) && !userIntentionallyPaused;

      if (shouldResume) {
        dismissAllConfirmationDialogs();
        if (typeof player.playVideo === 'function') {
          player.playVideo();
        } else {
          video.play().catch(() => { });
        }
      }
    }

    // Ensure state resets when video has ended
    if (video && video.ended) {
      userIntentionallyPaused = false;
    }
  }

  // Fast check loop (50ms)
  setInterval(() => {
    dismissAllConfirmationDialogs();
    neutralizePlayerAd();
  }, 50);

  // Hook HTMLMediaElement pause to prevent ad-related pauses and unwanted auto-pauses
  document.addEventListener(
    'pause',
    (e) => {
      if (e.target && e.target.tagName === 'VIDEO') {
        const video = e.target;
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (!config.enabled) return;

        lastPauseTime = Date.now();

        const isAdState =
          player && (
            player.classList.contains('ad-showing') ||
            player.classList.contains('ad-interrupting') ||
            (typeof player.isAd === 'function' && player.isAd())
          );

        if (isAdState) {
          neutralizePlayerAd();
          return;
        }

        if (config.nonStop) {
          const timeSinceUser = Date.now() - lastUserActionTime;
          const isRecentUserAction = timeSinceUser < 1000;

          // If paused by trusted user interaction, record intentional pause
          if (isRecentUserAction) {
            userIntentionallyPaused = true;
          } else if (!video.ended && !userIntentionallyPaused) {
            // Script-induced pause without user interaction: auto-resume
            dismissAllConfirmationDialogs();
            if (player && typeof player.playVideo === 'function') {
              player.playVideo();
            } else {
              video.play().catch(() => { });
            }
          }
        }
      }
    },
    true
  );

  /**
   * 7. ENFORCEMENT & INACTIVITY MODAL DISMISSAL
   * Dismisses both anti-adblock enforcement messages and "Video paused. Continue watching?" popups.
   */
  function dismissAllConfirmationDialogs() {
    // 1. Click "Yes" / "Continue" on YouTube's inactivity confirmation dialog
    const confirmButtons = [
      'ytd-enforcement-message-view-model #confirm-button button',
      'ytd-enforcement-message-view-model button',
      'tp-yt-paper-dialog[opened] yt-confirm-dialog-renderer #confirm-button button',
      'tp-yt-paper-dialog.opened yt-confirm-dialog-renderer #confirm-button button',
      'tp-yt-paper-dialog[opened] #confirm-button button',
      'tp-yt-paper-dialog.opened #confirm-button button',
      'yt-confirm-dialog-renderer #confirm-button button',
      'yt-confirm-dialog-renderer button#confirm-button',
      'tp-yt-paper-dialog:has(#confirm-button) #confirm-button button',
      'tp-yt-paper-dialog:has(#confirm-button) #confirm-button',
      'ytd-popup-container yt-confirm-dialog-renderer #confirm-button'
    ];

    let dismissed = false;
    for (const sel of confirmButtons) {
      const btn = document.querySelector(sel);
      if (btn) {
        try {
          btn.click();
          dismissed = true;
          break;
        } catch (e) { }
      }
    }

    // 2. Remove dialog elements from DOM
    const dialogSelectors = [
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)',
      'ytd-enforcement-message-view-model',
      'tp-yt-paper-dialog[opened]:has(yt-confirm-dialog-renderer)',
      'tp-yt-paper-dialog.opened:has(yt-confirm-dialog-renderer)',
      'yt-confirm-dialog-renderer'
    ];

    for (const sel of dialogSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        el.remove();
        dismissed = true;
      }
    }

    // 3. Remove opened backdrops
    const backdrops = document.querySelectorAll('tp-yt-iron-overlay-backdrop.opened');
    for (const backdrop of backdrops) {
      backdrop.remove();
      dismissed = true;
    }

    if (dismissed && !userIntentionallyPaused) {
      const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');

      if (typeof player?.playVideo === 'function') {
        player.playVideo();
      } else if (video && video.paused) {
        video.play().catch(() => { });
      }
      sendStat('dialog', 1);
    }
  }

  // Run on mutation
  const observer = new MutationObserver(() => {
    dismissAllConfirmationDialogs();
    neutralizePlayerAd();
  });

  if (document.documentElement) {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class']
    });
  }
})();
