/**
 * OpenTube AdShield - Background Service Worker
 * Manages configuration state, blocking metrics, and badge presentation.
 */

const DEFAULT_CONFIG = {
  enabled: true,
  autoSkip: true,
  fastForward: true,
  blockBanners: true,
  bypassAntiAdblock: true,
  nonStop: true,
  stats: {
    adsSkipped: 0,
    bannersBlocked: 0,
    timeSavedSeconds: 0
  }
};

// Initialize settings on install
chrome.runtime.onInstalled.addListener((details) => {
  chrome.storage.local.get(null, (existing) => {
    const updated = { ...DEFAULT_CONFIG, ...existing };
    if (!updated.stats) {
      updated.stats = { ...DEFAULT_CONFIG.stats };
    }
    chrome.storage.local.set(updated, () => {
      updateBadge(updated);
    });
  });
});

// Update extension action badge
function updateBadge(data) {
  if (!data || !data.enabled) {
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#6b7280' });
    return;
  }

  const total = (data.stats?.adsSkipped || 0) + (data.stats?.bannersBlocked || 0);
  let text = '';
  if (total > 999) {
    text = (total / 1000).toFixed(1) + 'k';
  } else if (total > 0) {
    text = total.toString();
  } else {
    text = 'ON';
  }

  chrome.action.setBadgeText({ text: text });
  chrome.action.setBadgeBackgroundColor({ color: '#10b981' }); // Vibrant emerald green
}

// Handle messages from content script & popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'STAT_INCREMENT') {
    chrome.storage.local.get(['stats', 'enabled'], (res) => {
      const stats = res.stats || { adsSkipped: 0, bannersBlocked: 0, timeSavedSeconds: 0 };
      const count = message.count || 1;

      if (message.statType === 'ad') {
        stats.adsSkipped += count;
        stats.timeSavedSeconds += count * 15; // Estimate 15 seconds saved per skipped ad
      } else if (message.statType === 'banner') {
        stats.bannersBlocked += count;
      } else if (message.statType === 'dialog') {
        stats.adsSkipped += count;
      }

      chrome.storage.local.set({ stats }, () => {
        updateBadge({ enabled: res.enabled !== false, stats });
        sendResponse({ success: true, stats });
      });
    });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'GET_STATS') {
    chrome.storage.local.get(['stats', 'enabled'], (res) => {
      sendResponse({ stats: res.stats, enabled: res.enabled });
    });
    return true;
  }

  if (message.action === 'RESET_STATS') {
    const freshStats = { adsSkipped: 0, bannersBlocked: 0, timeSavedSeconds: 0 };
    chrome.storage.local.set({ stats: freshStats }, () => {
      chrome.storage.local.get(['enabled'], (res) => {
        updateBadge({ enabled: res.enabled !== false, stats: freshStats });
        sendResponse({ success: true, stats: freshStats });
      });
    });
    return true;
  }

  if (message.action === 'CONFIG_CHANGED') {
    chrome.storage.local.get(null, (allData) => {
      updateBadge(allData);
    });
  }
});
