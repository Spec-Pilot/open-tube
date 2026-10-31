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
      const prevEnabled = config.enabled;
      for (const key of allowedKeys) {
        if (typeof event.data.config[key] === 'boolean') {
          config[key] = event.data.config[key];
        }
      }

      // If toggled off while video was fast-forwarding, restore playback rate immediately
      if (prevEnabled && !config.enabled) {
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (video && video.playbackRate === 16.0) {
          video.playbackRate = 1.0;
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

  // Track navigation state to allow YouTube media pipeline teardown during playlist transitions
  let isNavigating = false;

  function onNavigationStart() {
    isNavigating = true;
    userIntentionallyPaused = false;
    lastUserActionTime = 0;
    lastPauseTime = 0;
  }

  function onNavigationEnd() {
    isNavigating = false;
    userIntentionallyPaused = false;
    lastUserActionTime = 0;
    lastPauseTime = 0;
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    if (video && video.playbackRate === 16.0) {
      video.playbackRate = 1.0;
    }
  }

  window.addEventListener('yt-navigate-start', onNavigationStart, true);
  window.addEventListener('yt-navigate-finish', onNavigationEnd, true);
  window.addEventListener('yt-page-data-updated', onNavigationEnd, true);
  window.addEventListener('spfdone', onNavigationEnd, true);

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
    const originalHidden = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden')?.get;
    const originalVisState = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')?.get;

    Object.defineProperty(document, 'hidden', {
      get: () => {
        if (config.enabled && config.nonStop) return false;
        return originalHidden ? originalHidden.call(document) : false;
      },
      configurable: true
    });
    Object.defineProperty(document, 'visibilityState', {
      get: () => {
        if (config.enabled && config.nonStop) return 'visible';
        return originalVisState ? originalVisState.call(document) : 'visible';
      },
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
          // Never block pause if switching tracks in a playlist, at video start, or during initial buffering
          if (isNavigating || this.currentTime === 0 || (this.readyState !== undefined && this.readyState < 2)) {
            return originalVideoPause.apply(this, arguments);
          }

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
   * Strips ad placements, ad slots, and ad break parameters so YouTube player
   * initializes identical to YouTube Premium (zero ads scheduled).
   * Returns true if ad placements/slots were detected and sterilized.
   */
  function cleanPlayerResponse(response) {
    if (!config.enabled || !response || typeof response !== 'object') return false;

    let hasAds = false;
    try {
      // Remove scheduled ad placements and slots
      if (response.adPlacements) {
        if (!Array.isArray(response.adPlacements) || response.adPlacements.length > 0) hasAds = true;
        delete response.adPlacements;
      }
      if (response.adSlots) {
        if (!Array.isArray(response.adSlots) || response.adSlots.length > 0) hasAds = true;
        delete response.adSlots;
      }
      if (response.playerAds) {
        if (!Array.isArray(response.playerAds) || response.playerAds.length > 0) hasAds = true;
        delete response.playerAds;
      }
      if (response.adBreakHeartbeatParams) {
        hasAds = true;
        delete response.adBreakHeartbeatParams;
      }
      if (response.paidContentOverlay) {
        hasAds = true;
        delete response.paidContentOverlay;
      }

      // Handle nested player responses
      if (response.playerResponse && typeof response.playerResponse === 'object') {
        if (cleanPlayerResponse(response.playerResponse)) {
          hasAds = true;
        }
      }

      // Bypass anti-adblock enforcement modal if present in player response
      if (response.auxiliaryUi && response.auxiliaryUi.messageRenderers) {
        if (response.auxiliaryUi.messageRenderers.enforcementMessageViewModel) {
          delete response.auxiliaryUi;
          hasAds = true;
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
          hasAds = true;
        }
      }
    } catch (err) {
      // Guard against object freeze or mutation errors
    }

    return hasAds;
  }

  /**
   * 2. INITIAL DATA STERILIZATION
   * Strips feed ads, mastheads, and sponsored items from ytInitialData / /next API.
   * Returns count of removed banner/feed ad renderers.
   */
  function cleanInitialData(data) {
    if (!config.enabled || !data || typeof data !== 'object') return 0;

    let removedCount = 0;
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
                removedCount++;
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
                removedCount++;
              } else {
                removeAdKeys(obj[key]);
              }
            }
          }
        };
        removeAdKeys(data);
      }
    } catch (err) { }

    return removedCount;
  }

  /**
   * 3. WINDOW VARIABLE HOOKS
   * Intercepts ytInitialPlayerResponse and ytInitialData before any YouTube player script runs.
   */
  let _ytInitialPlayerResponse = window.ytInitialPlayerResponse;
  if (_ytInitialPlayerResponse) {
    if (cleanPlayerResponse(_ytInitialPlayerResponse)) {
      sendStat('ad', 1);
    }
  }

  Object.defineProperty(window, 'ytInitialPlayerResponse', {
    get() {
      return _ytInitialPlayerResponse;
    },
    set(val) {
      _ytInitialPlayerResponse = val;
      if (cleanPlayerResponse(_ytInitialPlayerResponse)) {
        sendStat('ad', 1);
      }
    },
    configurable: true,
    enumerable: true
  });

  let _ytInitialData = window.ytInitialData;
  if (_ytInitialData) {
    const bannerCount = cleanInitialData(_ytInitialData);
    if (bannerCount > 0) {
      sendStat('banner', Math.min(bannerCount, 5));
    }
  }

  Object.defineProperty(window, 'ytInitialData', {
    get() {
      return _ytInitialData;
    },
    set(val) {
      _ytInitialData = val;
      const bannerCount = cleanInitialData(_ytInitialData);
      if (bannerCount > 0) {
        sendStat('banner', Math.min(bannerCount, 5));
      }
    },
    configurable: true,
    enumerable: true
  });

  // Hook ytplayer config args if set
  function sanitizePlayerArgs(args) {
    if (!config.enabled || !args || typeof args !== 'object') return;
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
    if (!config.enabled) {
      return originalFetch.apply(this, arguments);
    }

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
        const hadAds = cleanPlayerResponse(data);

        if (hadAds) {
          sendStat('ad', 1);
        }

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
        const bannerCount = cleanInitialData(data);
        if (bannerCount > 0) {
          sendStat('banner', Math.min(bannerCount, 5));
        }

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
    if (!config.enabled) {
      return originalXHRSend.apply(this, arguments);
    }

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
            const hadAds = cleanPlayerResponse(data);
            const cleanText = JSON.stringify(data);
            Object.defineProperty(this, 'responseText', { value: cleanText, writable: true });
            Object.defineProperty(this, 'response', { value: cleanText, writable: true });
            if (hadAds) {
              sendStat('ad', 1);
            }
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
    if (!config.enabled) return;

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
      if (config.autoSkip && typeof player.skipAd === 'function') {
        try {
          player.skipAd();
        } catch (e) { }
      }

      // 2. Mute and jump to end to instantly clear unskippable ads
      // SAFETY GUARD: NEVER seek currentTime to duration if video.duration > 60!
      // Real YouTube ads are max 15-30s. Legitimate music videos and content are minutes long.
      // Fast-forwarding or seeking duration > 60 skips the user's actual video and causes playlist skip loops.
      if (video && config.fastForward) {
        video.muted = true;
        if (isFinite(video.duration) && video.duration > 0 && video.duration <= 60) {
          video.currentTime = video.duration;
        }
        if (video.playbackRate !== 16.0) {
          video.playbackRate = 16.0;
        }
      }

      // 3. Immediately click any skip button in DOM
      if (config.autoSkip) {
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
    } else {
      // Ad has ended or is not playing: restore normal playback rate if accelerated
      if (video && video.playbackRate === 16.0) {
        video.playbackRate = 1.0;
      }
    }

    // Auto-resume video only if paused by YouTube's ad interruption or anti-adblock enforcement
    if (config.enabled && video && video.paused && !video.ended && !isNavigating) {
      const wasRecentAd = Date.now() - lastAdSkippedTime < 3000;
      const isAdClass = Boolean(player.classList?.contains?.('ad-showing') || player.classList?.contains?.('ad-interrupting'));
      const hasEnforcement = !!document.querySelector(
        'ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)'
      );

      // Only auto-resume if an ad was active or anti-adblock enforcement was detected
      // Never auto-resume if video was intentionally paused by the user or during playlist navigation
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
          } else if (!video.ended && !userIntentionallyPaused && !isNavigating) {
            // Script-induced pause without user interaction: auto-resume only if anti-adblock/inactivity dialog is active
            const hasConfirmation = !!document.querySelector(
              'tp-yt-paper-dialog:has(#confirm-button), yt-confirm-dialog-renderer, ytd-enforcement-message-view-model'
            );
            if (hasConfirmation) {
              dismissAllConfirmationDialogs();
              if (player && typeof player.playVideo === 'function') {
                player.playVideo();
              } else {
                video.play().catch(() => { });
              }
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
    if (!config.enabled || !config.bypassAntiAdblock) return;

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
