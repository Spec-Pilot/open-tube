/**
 * OpenTube AdShield - Popup Controller
 * Manages user toggles, statistics updates, and live status presentation.
 * Supports both Chrome extension storage and graceful local fallback for testing.
 */

document.addEventListener('DOMContentLoaded', () => {
  // UI Elements
  const statusPill = document.getElementById('statusPill');
  const statusLabel = document.getElementById('statusLabel');
  const masterCard = document.getElementById('masterCard');
  const masterSubtitle = document.getElementById('masterSubtitle');

  const toggleMaster = document.getElementById('toggleMaster');
  const toggleFastForward = document.getElementById('toggleFastForward');
  const toggleAutoSkip = document.getElementById('toggleAutoSkip');
  const toggleBlockBanners = document.getElementById('toggleBlockBanners');
  const toggleBypassAntiAdblock = document.getElementById('toggleBypassAntiAdblock');
  const toggleNonStop = document.getElementById('toggleNonStop');

  const statAdsSkipped = document.getElementById('statAdsSkipped');
  const statBannersBlocked = document.getElementById('statBannersBlocked');
  const statTimeSaved = document.getElementById('statTimeSaved');

  const btnResetStats = document.getElementById('btnResetStats');

  const subToggles = [
    toggleFastForward,
    toggleAutoSkip,
    toggleBlockBanners,
    toggleBypassAntiAdblock,
    toggleNonStop
  ];

  const DEFAULT_STATE = {
    enabled: true,
    fastForward: true,
    autoSkip: true,
    blockBanners: true,
    bypassAntiAdblock: true,
    nonStop: true,
    stats: {
      adsSkipped: 0,
      bannersBlocked: 0,
      timeSavedSeconds: 0
    }
  };

  // Format seconds into readable string (e.g. "45s", "3m 12s", "1.4h")
  function formatTime(totalSeconds) {
    if (!totalSeconds || totalSeconds <= 0) return '0s';
    if (totalSeconds < 60) return `${totalSeconds}s`;
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    }
    const hours = (totalSeconds / 3600).toFixed(1);
    return `${hours}h`;
  }

  // Update UI with latest state
  function updateUI(data) {
    const isEnabled = data.enabled !== false;

    // Master switch & indicators
    toggleMaster.checked = isEnabled;
    if (isEnabled) {
      statusPill.classList.remove('disabled');
      statusLabel.textContent = 'Active';
      masterCard.classList.add('active');
      masterSubtitle.textContent = 'Running smoothly on YouTube';
    } else {
      statusPill.classList.add('disabled');
      statusLabel.textContent = 'Paused';
      masterCard.classList.remove('active');
      masterSubtitle.textContent = 'Protection is paused';
    }

    // Sub toggles state
    subToggles.forEach(toggle => {
      toggle.disabled = !isEnabled;
      if (toggle.parentElement && toggle.parentElement.parentElement) {
        toggle.parentElement.parentElement.style.opacity = isEnabled ? '1' : '0.5';
        toggle.parentElement.parentElement.style.pointerEvents = isEnabled ? 'auto' : 'none';
      }
    });

    toggleFastForward.checked = data.fastForward !== false;
    toggleAutoSkip.checked = data.autoSkip !== false;
    toggleBlockBanners.checked = data.blockBanners !== false;
    toggleBypassAntiAdblock.checked = data.bypassAntiAdblock !== false;
    toggleNonStop.checked = data.nonStop !== false;

    // Stats
    const stats = data.stats || { adsSkipped: 0, bannersBlocked: 0, timeSavedSeconds: 0 };
    statAdsSkipped.textContent = (stats.adsSkipped || 0).toLocaleString();
    statBannersBlocked.textContent = (stats.bannersBlocked || 0).toLocaleString();
    statTimeSaved.textContent = formatTime(stats.timeSavedSeconds || 0);
  }

  // Load saved state with localStorage fallback
  function getState(callback) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(null, (data) => {
        callback({ ...DEFAULT_STATE, ...data });
      });
    } else {
      try {
        const stored = localStorage.getItem('opentube_settings');
        const parsed = stored ? JSON.parse(stored) : {};
        callback({ ...DEFAULT_STATE, ...parsed });
      } catch (e) {
        callback(DEFAULT_STATE);
      }
    }
  }

  // Refresh UI from storage
  function refreshState() {
    getState((data) => {
      updateUI(data);
    });
  }

  // Save changes to storage
  function saveOption(key, value) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      const update = { [key]: value };
      chrome.storage.local.set(update, () => {
        if (chrome.runtime && chrome.runtime.sendMessage) {
          chrome.runtime.sendMessage({ action: 'CONFIG_CHANGED' }, () => {
            if (chrome.runtime.lastError) { /* ignore */ }
          });
        }
      });
    } else {
      try {
        getState((current) => {
          current[key] = value;
          localStorage.setItem('opentube_settings', JSON.stringify(current));
          updateUI(current);
        });
      } catch (e) {
        // Ignored
      }
    }
  }

  // Event Listeners for Toggles
  toggleMaster.addEventListener('change', (e) => {
    const val = e.target.checked;
    saveOption('enabled', val);
    refreshState();
  });

  toggleFastForward.addEventListener('change', (e) => {
    saveOption('fastForward', e.target.checked);
  });

  toggleAutoSkip.addEventListener('change', (e) => {
    saveOption('autoSkip', e.target.checked);
  });

  toggleBlockBanners.addEventListener('change', (e) => {
    saveOption('blockBanners', e.target.checked);
  });

  toggleBypassAntiAdblock.addEventListener('change', (e) => {
    saveOption('bypassAntiAdblock', e.target.checked);
  });

  toggleNonStop.addEventListener('change', (e) => {
    saveOption('nonStop', e.target.checked);
  });

  // Reset Stats Button
  btnResetStats.addEventListener('click', () => {
    if (confirm('Reset all blocking statistics?')) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'RESET_STATS' }, (res) => {
          if (res && res.stats) {
            refreshState();
          }
        });
      } else {
        getState((current) => {
          current.stats = { adsSkipped: 0, bannersBlocked: 0, timeSavedSeconds: 0 };
          localStorage.setItem('opentube_settings', JSON.stringify(current));
          updateUI(current);
        });
      }
    }
  });

  // Listen for storage changes in real-time
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local') {
        refreshState();
      }
    });
  }

  // Initial load
  refreshState();
});
