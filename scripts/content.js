/**
 * OpenTube AdShield - Content Script
 * High-performance ad skipper, player accelerator, anti-adblock bypass, and DOM cleaner.
 */

(function () {
  'use strict';

  // Default configuration
  let config = {
    enabled: true,
    autoSkip: true,
    fastForward: true,
    blockBanners: true,
    bypassAntiAdblock: true,
    nonStop: true
  };

  // State tracking
  let isAdActive = false;
  let normalPlaybackRate = 1.0;
  let mutedByExtension = false;
  let lastSkippedTime = 0;
  let lastShortSkippedTime = 0;
  let observer = null;
  let checkTimer = null;
  let userIntentionallyPaused = false;
  let lastUserActionTime = 0;
  let lastPauseTime = 0;

  // Sync configuration to inject.js running in MAIN world
  function syncConfigToInject() {
    const targetOrigin =
      typeof window !== 'undefined' && window.location && typeof window.location.origin === 'string' && window.location.origin.startsWith('http')
        ? window.location.origin
        : '*';
    window.postMessage({ type: 'OPENTUBE_CONFIG_UPDATE', config }, targetOrigin);
  }

  // Load configuration from storage
  function loadConfig() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(
          ['enabled', 'autoSkip', 'fastForward', 'blockBanners', 'bypassAntiAdblock', 'nonStop'],
          (res) => {
            if (res) {
              config = {
                enabled: res.enabled !== false,
                autoSkip: res.autoSkip !== false,
                fastForward: res.fastForward !== false,
                blockBanners: res.blockBanners !== false,
                bypassAntiAdblock: res.bypassAntiAdblock !== false,
                nonStop: res.nonStop !== false
              };
              syncConfigToInject();
            }
          }
        );
      }
    } catch (e) {
      // Storage access error guard
    }
  }

  // Listen for real-time config updates from popup or background worker
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          for (const key of Object.keys(changes)) {
            if (key in config) {
              config[key] = changes[key].newValue;
            }
          }
          syncConfigToInject();
        }
      });
    }
  } catch (e) {
    // Ignore
  }

  // Track deliberate user pause actions vs automated script pauses
  function registerUserAction(e) {
    if (e && (e.isTrusted || e.isTrusted === undefined)) {
      lastUserActionTime = Date.now();
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

  // Report statistics back to background worker
  function reportAdBlocked(type = 'ad', count = 1) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(
          {
            action: 'STAT_INCREMENT',
            statType: type,
            count: count
          },
          () => {
            if (chrome.runtime.lastError) {
              /* ignore */
            }
          }
        );
      }
    } catch (e) {
      // Ignore
    }
  }

  // Listen for stat messages from inject.js
  window.addEventListener('message', (event) => {
    if (event.source !== window || !event.data) return;
    if (event.data.type === 'OPENTUBE_STAT') {
      const validTypes = ['ad', 'banner', 'dialog'];
      const statType = validTypes.includes(event.data.statType) ? event.data.statType : 'ad';
      const rawCount = parseInt(event.data.count, 10);
      const count = (!isNaN(rawCount) && rawCount > 0 && rawCount <= 10) ? rawCount : 1;
      reportAdBlocked(statType, count);
    }
  });

  /**
   * Main Ad Skipped & Accelerator Logic
   */
  function handleVideoAds() {
    if (!config.enabled) return;

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');

    if (!video) return;

    // Detect if an ad is actively playing
    const hasAdClass =
      player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));

    // Check for visible ad elements strictly when rendered
    let hasVisibleAdOverlay = false;
    if (hasAdClass) {
      hasVisibleAdOverlay = true;
    } else {
      const adOverlay = document.querySelector('.ytp-ad-player-overlay, .ytp-ad-preview-container');
      if (adOverlay && adOverlay.offsetParent !== null && adOverlay.getBoundingClientRect().height > 0) {
        hasVisibleAdOverlay = true;
      }
    }

    const adCurrentlyShowing = hasAdClass || hasVisibleAdOverlay;

    if (adCurrentlyShowing) {
      if (!isAdActive) {
        isAdActive = true;

        // Save normal user playback rate
        if (video.playbackRate > 0 && video.playbackRate <= 4.0 && video.playbackRate !== 16.0) {
          normalPlaybackRate = video.playbackRate;
        }

        // Mute video to prevent ad audio bursts
        if (!video.muted) {
          video.muted = true;
          mutedByExtension = true;
        }
      }

      // Fast-forward video to end
      if (config.fastForward) {
        try {
          if (video.playbackRate !== 16.0) {
            video.playbackRate = 16.0;
          }
          // SAFETY GUARD: NEVER seek to duration if video.duration > 60!
          // Real YouTube unskippable ads are strictly <= 15-30s. Seeking duration > 60
          // skips legitimate music videos and causes an infinite playlist loop.
          if (isFinite(video.duration) && video.duration > 0 && video.duration <= 60) {
            video.currentTime = video.duration;
          }
        } catch (err) {
          // Seeking guard
        }
      }

      // Auto-click skip buttons
      if (config.autoSkip) {
        const skipSelectors = [
          '.ytp-ad-skip-button-modern',
          '.ytp-ad-skip-button',
          '.ytp-skip-ad-button',
          'button.ytp-ad-skip-button-text',
          '.ytp-ad-overlay-close-button',
          'button[aria-label*="Skip ad" i]',
          'button[aria-label*="Skip" i]',
          '.ytp-ad-preview-container',
          '.ytp-ad-image-overlay button'
        ];

        for (const selector of skipSelectors) {
          const skipBtn = document.querySelector(selector);
          if (skipBtn) {
            skipBtn.click();
            const now = Date.now();
            if (now - lastSkippedTime > 1500) {
              lastSkippedTime = now;
              reportAdBlocked('ad', 1);
            }
            break;
          }
        }
      }

      // Ensure video is not left paused during an ad
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      // Ad has ended
      if (isAdActive) {
        isAdActive = false;

        // Restore playback rate
        if (video.playbackRate === 16.0) {
          video.playbackRate = normalPlaybackRate || 1.0;
        }

        // Restore audio unmute
        if (mutedByExtension) {
          video.muted = false;
          mutedByExtension = false;
        }

        // Record stat if not already logged via skip button
        const now = Date.now();
        if (now - lastSkippedTime > 1500) {
          lastSkippedTime = now;
          reportAdBlocked('ad', 1);
        }

        // Keep video playing seamlessly
        if (video.paused) {
          video.play().catch(() => {});
        }
      } else {
        // Track normal user speed changes
        if (video.playbackRate > 0 && video.playbackRate <= 4.0 && video.playbackRate !== 16.0) {
          normalPlaybackRate = video.playbackRate;
        }
      }
    }
  }

  /**
   * Auto-Skip Sponsored YouTube Shorts
   */
  function handleShortsAds() {
    if (!config.enabled) return;

    const currentShort = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (currentShort) {
      const isSponsored =
        currentShort.querySelector('ytd-ad-slot-renderer') ||
        currentShort.querySelector('[aria-label*="Sponsored" i]') ||
        currentShort.innerText.includes('Sponsored');

      if (isSponsored) {
        const now = Date.now();
        if (now - lastShortSkippedTime > 2000) {
          lastShortSkippedTime = now;
          const nextBtn =
            document.querySelector('#navigation-button-down button') ||
            document.querySelector('button[aria-label*="Next video" i]');
          if (nextBtn) {
            nextBtn.click();
          } else {
            window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
          }
          reportAdBlocked('ad', 1);
        }
      }
    }
  }

  /**
   * Anti-Adblock & Inactivity Confirmation Dialog Dismissal
   */
  function handleAntiAdblockBypass() {
    if (!config.enabled) return;

    // Detect YouTube's enforcement modal or opened inactivity confirmation dialog
    const dialog = document.querySelector(
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model), ytd-enforcement-message-view-model, tp-yt-paper-dialog[opened]:has(yt-confirm-dialog-renderer), tp-yt-paper-dialog.opened:has(yt-confirm-dialog-renderer)'
    );
    const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop.opened');

    if (!dialog && !backdrop) return;

    // Click confirm button if present inside the dialog
    const confirmBtn = dialog ? dialog.querySelector('#confirm-button button, #confirm-button, button') : null;
    if (confirmBtn) {
      try { confirmBtn.click(); } catch (e) {}
    }

    if (dialog) {
      dialog.remove();
    }
    if (backdrop) {
      backdrop.remove();
    }

    // Resume video only if user didn't intentionally pause
    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
    if (video && video.paused && !userIntentionallyPaused) {
      if (player && typeof player.playVideo === 'function') {
        player.playVideo();
      } else {
        video.play().catch(() => {});
      }
    }
    reportAdBlocked('dialog', 1);
  }

  /**
   * Non-Stop Auto-Pause Prevention
   * Ensures unattended music/autoplay playlists continue uninterrupted.
   */
  function handleAutoPausePrevention() {
    if (!config.enabled || !config.nonStop) return;

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');

    if (!video) return;

    const hasEnforcement = !!document.querySelector(
      'ytd-enforcement-message-view-model, tp-yt-paper-dialog:has(ytd-enforcement-message-view-model)'
    );

    // Only unpause if enforcement modal is present and user did not intentionally pause
    if (hasEnforcement && !userIntentionallyPaused) {
      handleAntiAdblockBypass();
      if (player && typeof player.playVideo === 'function') {
        player.playVideo();
      } else {
        video.play().catch(() => {});
      }
    }
  }

  /**
   * DOM Cleaner for Static and Feed Ads
   */
  function cleanStaticAds() {
    if (!config.enabled || !config.blockBanners) return;

    const bannerSelectors = [
      'ytd-ad-slot-renderer',
      '#masthead-ad',
      'ytd-banner-promo-renderer',
      'ytd-in-feed-ad-layout-renderer',
      '#player-ads',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-compact-promoted-video-renderer',
      'ytd-action-companion-ad-renderer',
      '.ytp-ad-overlay-container'
    ];

    let found = 0;
    for (const sel of bannerSelectors) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (el && el.parentNode) {
          el.remove();
          found++;
        }
      }
    }

    if (found > 0) {
      reportAdBlocked('banner', found);
    }
  }

  /**
   * Unified Engine Loop
   */
  function runEngine() {
    handleVideoAds();
    handleShortsAds();
    handleAntiAdblockBypass();
    handleAutoPausePrevention();
    cleanStaticAds();
  }

  // Setup interval loop (50ms)
  function initEngine() {
    loadConfig();

    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(runEngine, 50);

    // MutationObserver for zero-delay reaction
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      runEngine();
    });

    observer.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'src']
    });

    // Reset state on YouTube navigation events (SPA)
    window.addEventListener('yt-navigate-start', () => {
      isAdActive = false;
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (video && video.playbackRate === 16.0) {
        video.playbackRate = normalPlaybackRate || 1.0;
      }
      userIntentionallyPaused = false;
      lastUserActionTime = 0;
    });

    window.addEventListener('yt-navigate-finish', () => {
      isAdActive = false;
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (video && video.playbackRate === 16.0) {
        video.playbackRate = normalPlaybackRate || 1.0;
      }
      normalPlaybackRate = 1.0;
      mutedByExtension = false;
      userIntentionallyPaused = false;
      lastUserActionTime = 0;
      lastPauseTime = 0;
      runEngine();
    });

    window.addEventListener('spfdone', () => {
      isAdActive = false;
      userIntentionallyPaused = false;
      lastUserActionTime = 0;
      lastPauseTime = 0;
      runEngine();
    });

    // Hook video pause event directly to record user intentional pause
    document.addEventListener(
      'pause',
      (e) => {
        if (e.target && e.target.tagName === 'VIDEO') {
          lastPauseTime = Date.now();
          const timeSinceUser = Date.now() - lastUserActionTime;
          if (timeSinceUser < 1000) {
            userIntentionallyPaused = true;
          }
        }
      },
      true
    );

    // Hook video play event directly
    document.addEventListener(
      'play',
      (e) => {
        if (e.target && e.target.tagName === 'VIDEO') {
          const timeSinceUser = Date.now() - lastUserActionTime;
          if (timeSinceUser < 1000 || e.target.ended) {
            userIntentionallyPaused = false;
          }
          handleVideoAds();
          handleAutoPausePrevention();
        }
      },
      true
    );
  }

  // Initialize early
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngine);
  } else {
    initEngine();
  }
})();
