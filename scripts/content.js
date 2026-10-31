/**
 * OpenTube AdShield - Content Script
 * High-performance ad skipper, player accelerator, anti-adblock bypass, and DOM cleaner.
 * Runs in isolated world: zero JS prototype tampering, zero detection surface.
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

  // Precise user pause intent tracking (Fixes the video unpausable bug)
  let userPaused = false;
  let lastUserActionTime = 0;

  // Apply or remove root class on <html> to dynamically activate/deactivate cosmetic CSS filters
  function applyRootClasses() {
    const root = document.documentElement;
    if (!root) return;
    if (config.enabled) {
      root.classList.remove('opentube-disabled');
      root.classList.add('opentube-enabled');
    } else {
      root.classList.remove('opentube-enabled');
      root.classList.add('opentube-disabled');
    }
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
              applyRootClasses();
            }
          }
        );
      }
    } catch (e) {
      // Storage access error guard
    }
  }

  // Listen for real-time config updates from popup
  try {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
          for (const key of Object.keys(changes)) {
            if (key in config) {
              config[key] = changes[key].newValue;
            }
          }
          applyRootClasses();

          // If toggled off while an ad was being fast-forwarded/muted, restore immediately
          if (!config.enabled && isAdActive) {
            isAdActive = false;
            const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
            if (video) {
              if (video.playbackRate === 16.0) {
                video.playbackRate = normalPlaybackRate || 1.0;
              }
              if (mutedByExtension) {
                video.muted = false;
                mutedByExtension = false;
              }
            }
          }
        }
      });
    }
  } catch (e) {
    // Ignore
  }

  // Track deliberate user pause actions vs automated script actions
  function registerUserGesture(e) {
    if (!e || (e.isTrusted === false)) return; // Ignore synthetic script events

    const isKey = e.type === 'keydown' && (e.key === ' ' || e.key === 'k' || e.key === 'K' || e.code === 'Space' || e.key === 'MediaPlayPause');
    const target = e.target;
    const isPlayerClick = (e.type === 'click' || e.type === 'pointerdown' || e.type === 'mousedown') && target && (
      target.closest?.('#movie_player') ||
      target.closest?.('.html5-video-player') ||
      target.closest?.('.html5-main-video') ||
      target.closest?.('.ytp-play-button') ||
      target.closest?.('button[aria-label*="Play" i]') ||
      target.closest?.('button[aria-label*="Pause" i]') ||
      target.tagName === 'VIDEO'
    );

    if (isKey || isPlayerClick) {
      lastUserActionTime = Date.now();
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (video) {
        if (!video.paused) {
          // Video was playing, user intended to pause!
          userPaused = true;
        } else {
          // Video was paused, user intended to play!
          userPaused = false;
        }
      }
    }
  }

  window.addEventListener('click', registerUserGesture, true);
  window.addEventListener('keydown', registerUserGesture, true);
  window.addEventListener('pointerdown', registerUserGesture, true);
  window.addEventListener('mousedown', registerUserGesture, true);

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

  /**
   * Determine whether an ad is actively playing without false positives
   */
  function isAdShowing(player) {
    if (!player) return false;
    if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) {
      return true;
    }
    // Visible skip button or visible ad text in DOM
    const skipBtn = document.querySelector(
      '.ytp-ad-skip-button-modern, .ytp-ad-skip-button, .ytp-skip-ad-button, button.ytp-ad-skip-button-text'
    );
    if (skipBtn && (skipBtn.offsetParent !== null || skipBtn.getClientRects().length > 0)) {
      return true;
    }
    const adText = document.querySelector('.ytp-ad-text');
    if (adText && (adText.offsetParent !== null || adText.getClientRects().length > 0) && adText.textContent.trim().length > 0) {
      return true;
    }
    return false;
  }

  /**
   * Main Ad Skipped & Accelerator Logic
   */
  function handleVideoAds() {
    if (!config.enabled) return;

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');

    if (!video) return;

    const adCurrentlyShowing = isAdShowing(player);

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
          // skips legitimate content videos and causes an infinite playlist loop.
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
          'button[aria-label="Skip ad" i]',
          'button[aria-label="Skip Ad" i]',
          '.ytp-ad-image-overlay button'
        ];

        for (const selector of skipSelectors) {
          const skipBtn = document.querySelector(selector);
          if (skipBtn && (skipBtn.offsetParent !== null || skipBtn.getClientRects().length > 0)) {
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

      // Ensure ad doesn't remain paused
      if (video.paused) {
        video.play().catch(() => {});
      }
    } else {
      // Ad has ended or no ad is playing
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

        // Keep video playing seamlessly ONLY if user did not intentionally pause!
        if (video.paused && !userPaused) {
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
    if (typeof window !== 'undefined' && window.location && !window.location.pathname.startsWith('/shorts')) return;

    const currentShort = document.querySelector('ytd-reel-video-renderer[is-active]');
    if (currentShort) {
      const isSponsored =
        currentShort.querySelector('ytd-ad-slot-renderer') ||
        currentShort.querySelector('[aria-label*="Sponsored" i]') ||
        (currentShort.innerText && currentShort.innerText.includes('Sponsored'));

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
   * Anti-Adblock Warning & Enforcement Dialog Dismissal
   * Cleans up both enforcement modals and error-screen overlays.
   */
  function handleAntiAdblockBypass() {
    if (!config.enabled || !config.bypassAntiAdblock) return;

    let recovered = false;

    // 1. Detect and remove enforcement modal dialogs
    const dialog = document.querySelector(
      'tp-yt-paper-dialog:has(ytd-enforcement-message-view-model), ytd-enforcement-message-view-model, #dialog:has(ytd-enforcement-message-view-model)'
    );
    const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop.opened');

    if (dialog) {
      dialog.remove();
      if (backdrop) backdrop.remove();
      recovered = true;
      reportAdBlocked('dialog', 1);
    }

    // 2. Clear playability error overlay and restore video player visibility
    const errorScreen = document.querySelector('#error-screen:not([hidden]), yt-playability-error-supported-renderers:not([hidden])');
    if (errorScreen) {
      errorScreen.setAttribute('hidden', '');
      errorScreen.style.display = 'none';
      const playerContainer = document.querySelector('#player-container');
      if (playerContainer) {
        playerContainer.removeAttribute('hidden');
        playerContainer.style.display = '';
      }
      recovered = true;
      reportAdBlocked('dialog', 1);
    }

    // 3. Resume playback if error was cleared and user didn't deliberately pause
    if (recovered && !userPaused) {
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
      if (player && typeof player.playVideo === 'function') {
        player.playVideo();
      } else if (video && video.paused) {
        video.play().catch(() => {});
      }
    }
  }

  /**
   * Inactivity Auto-Pause Dismissal ("Video paused. Continue watching?")
   */
  function handleInactivityConfirmation() {
    if (!config.enabled || !config.nonStop) return;

    const confirmBtn = document.querySelector(
      'tp-yt-paper-dialog[opened] yt-confirm-dialog-renderer #confirm-button button, yt-confirm-dialog-renderer #confirm-button button'
    );
    if (confirmBtn) {
      try {
        confirmBtn.click();
        const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
        if (video && video.paused && !userPaused) {
          video.play().catch(() => {});
        }
      } catch (e) {}
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
    if (!config.enabled) return;
    handleVideoAds();
    handleShortsAds();
    handleAntiAdblockBypass();
    handleInactivityConfirmation();
    cleanStaticAds();
  }

  // Setup interval loop (50ms)
  function initEngine() {
    loadConfig();
    applyRootClasses();

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

    // Helper to ensure natural video playback without false pauses
    function ensurePlayback() {
      if (!config.enabled || userPaused) return;
      const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
      const p = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
      if (v && v.paused && !isAdShowing(p)) {
        if (p && typeof p.playVideo === 'function') {
          p.playVideo();
        } else {
          v.play().catch(() => {});
        }
      }
    }

    // Ensure initial playback when loading directly into a video
    setTimeout(ensurePlayback, 300);
    setTimeout(ensurePlayback, 800);

    // Reset state on YouTube navigation events (SPA)
    window.addEventListener('yt-navigate-start', () => {
      isAdActive = false;
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (video && video.playbackRate === 16.0) {
        video.playbackRate = normalPlaybackRate || 1.0;
      }
      userPaused = false;
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
      userPaused = false;
      lastUserActionTime = 0;
      runEngine();

      // Ensure next video in playlist or autoplay starts playing automatically
      setTimeout(ensurePlayback, 200);
      setTimeout(ensurePlayback, 600);
    });

    window.addEventListener('spfdone', () => {
      isAdActive = false;
      userPaused = false;
      lastUserActionTime = 0;
      runEngine();

      setTimeout(() => {
        const v = document.querySelector('video.html5-main-video') || document.querySelector('video');
        const p = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');
        if (v && v.paused && !userPaused && !isAdShowing(p)) {
          if (p && typeof p.playVideo === 'function') {
            p.playVideo();
          } else {
            v.play().catch(() => {});
          }
        }
      }, 300);
    });

    // Hook video pause event directly to confirm user intentional pause
    document.addEventListener(
      'pause',
      (e) => {
        if (e.target && e.target.tagName === 'VIDEO') {
          const timeSinceUser = Date.now() - lastUserActionTime;
          if (timeSinceUser < 1000) {
            userPaused = true;
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
            userPaused = false;
          }
          handleVideoAds();
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
