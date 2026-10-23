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
    bypassAntiAdblock: true
  };

  // State tracking
  let isAdActive = false;
  let normalPlaybackRate = 1.0;
  let mutedByExtension = false;
  let lastSkippedTime = 0;
  let lastShortSkippedTime = 0;
  let observer = null;
  let checkTimer = null;

  // Load configuration from storage
  function loadConfig() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(
          ['enabled', 'autoSkip', 'fastForward', 'blockBanners', 'bypassAntiAdblock'],
          (res) => {
            if (res) {
              config = {
                enabled: res.enabled !== false,
                autoSkip: res.autoSkip !== false,
                fastForward: res.fastForward !== false,
                blockBanners: res.blockBanners !== false,
                bypassAntiAdblock: res.bypassAntiAdblock !== false
              };
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
        }
      });
    }
  } catch (e) {
    // Ignore
  }

  // Report statistics back to background worker
  function reportAdBlocked(type = 'ad', count = 1) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          action: 'STAT_INCREMENT',
          statType: type,
          count: count
        }, () => {
          if (chrome.runtime.lastError) { /* ignore */ }
        });
      }
    } catch (e) {
      // Ignore
    }
  }

  /**
   * Main Ad Skipped & Accelerator Logic
   */
  function handleVideoAds() {
    if (!config.enabled) return;

    const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
    const player = document.querySelector('#movie_player') || document.querySelector('.html5-video-player');

    if (!video) return;

    // Detect if an ad is active
    const hasAdClass = player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'));
    const hasAdOverlay = !!document.querySelector('.ytp-ad-player-overlay, .ytp-ad-text, .ytp-ad-preview-container');
    const adCurrentlyShowing = hasAdClass || hasAdOverlay;

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
          if (isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.1) {
            video.currentTime = video.duration - 0.05;
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
      const isSponsored = currentShort.querySelector('ytd-ad-slot-renderer') ||
                          currentShort.querySelector('[aria-label*="Sponsored" i]') ||
                          currentShort.innerText.includes('Sponsored');

      if (isSponsored) {
        const now = Date.now();
        if (now - lastShortSkippedTime > 2000) {
          lastShortSkippedTime = now;
          const nextBtn = document.querySelector('#navigation-button-down button') ||
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
   */
  function handleAntiAdblockBypass() {
    if (!config.enabled || !config.bypassAntiAdblock) return;

    // Detect YouTube's enforcement modal
    const dialog = document.querySelector('tp-yt-paper-dialog:has(ytd-enforcement-message-view-model), ytd-enforcement-message-view-model');
    const backdrop = document.querySelector('tp-yt-iron-overlay-backdrop.opened');

    if (dialog) {
      dialog.remove();
      if (backdrop) backdrop.remove();

      // Resume video
      const video = document.querySelector('video.html5-main-video') || document.querySelector('video');
      if (video && video.paused) {
        video.play().catch(() => {});
      }
      reportAdBlocked('dialog', 1);
    }
  }

  /**
   * DOM Cleaner for Static and Feed Ads
   */
  let cleanedElementsCount = 0;
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
      cleanedElementsCount += found;
      if (cleanedElementsCount >= 3) {
        reportAdBlocked('banner', cleanedElementsCount);
        cleanedElementsCount = 0;
      }
    }
  }

  /**
   * Unified Engine Loop
   */
  function runEngine() {
    handleVideoAds();
    handleShortsAds();
    handleAntiAdblockBypass();
    cleanStaticAds();
  }

  // Setup interval loop (100ms)
  function initEngine() {
    loadConfig();

    if (checkTimer) clearInterval(checkTimer);
    checkTimer = setInterval(runEngine, 100);

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
    window.addEventListener('yt-navigate-finish', () => {
      isAdActive = false;
      normalPlaybackRate = 1.0;
      mutedByExtension = false;
      runEngine();
    });

    window.addEventListener('spfdone', () => {
      isAdActive = false;
      runEngine();
    });

    // Hook video play event directly
    document.addEventListener('play', (e) => {
      if (e.target && e.target.tagName === 'VIDEO') {
        handleVideoAds();
      }
    }, true);
  }

  // Initialize early
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEngine);
  } else {
    initEngine();
  }
})();
