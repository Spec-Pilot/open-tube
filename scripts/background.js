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
  connectInternet: false,
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

// Security helper: verify if message sender is the extension's own popup/background UI (not a web tab or content script)
function isInternalExtensionSender(sender) {
  if (!sender) return false;
  // sender.tab is always defined when sent from a content script running in a web page
  if (sender.tab) return false;
  // sender.id must match this extension's runtime ID
  if (typeof chrome !== 'undefined' && chrome.runtime && sender.id !== chrome.runtime.id) return false;
  // sender.url must start with our extension origin
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    const extensionOrigin = chrome.runtime.getURL('');
    if (typeof sender.url !== 'string' || !sender.url.startsWith(extensionOrigin)) {
      return false;
    }
  }
  return true;
}

// Security helper: validate download URL to ensure it only targets trusted repository sources
function isTrustedDownloadUrl(url) {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'github.com' && parsed.pathname.startsWith('/Spec-Pilot/open-tube/')) return true;
    if (parsed.hostname === 'api.github.com' && parsed.pathname.startsWith('/repos/Spec-Pilot/open-tube/')) return true;
    return false;
  } catch (e) {
    return false;
  }
}

// Security helper: sanitize filename to prevent directory traversal or invalid extensions
function sanitizeFilename(name) {
  if (typeof name !== 'string') return 'open-tube-latest.zip';
  const base = name.replace(/^.*[\\\/]/, '').replace(/[^a-zA-Z0-9._-]/g, '');
  if (!base.endsWith('.zip')) {
    return 'open-tube-latest.zip';
  }
  return base;
}

// Handle messages from content script & popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false;

  if (message.action === 'STAT_INCREMENT') {
    const validTypes = ['ad', 'banner', 'dialog'];
    const statType = validTypes.includes(message.statType) ? message.statType : 'ad';
    const rawCount = parseInt(message.count, 10);
    const count = (!isNaN(rawCount) && rawCount > 0 && rawCount <= 10) ? rawCount : 1;

    chrome.storage.local.get(['stats', 'enabled'], (res) => {
      const stats = res.stats || { adsSkipped: 0, bannersBlocked: 0, timeSavedSeconds: 0 };

      if (statType === 'ad') {
        stats.adsSkipped += count;
        stats.timeSavedSeconds += count * 15; // Estimate 15 seconds saved per skipped ad
      } else if (statType === 'banner') {
        stats.bannersBlocked += count;
      } else if (statType === 'dialog') {
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
    if (!isInternalExtensionSender(sender)) {
      sendResponse({ error: 'Unauthorized: RESET_STATS is only allowed from the extension UI.' });
      return false;
    }
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
    if (!isInternalExtensionSender(sender)) {
      return false;
    }
    chrome.storage.local.get(null, (allData) => {
      updateBadge(allData);
    });
  }

  if (message.action === 'CHECK_GIT_UPDATES') {
    if (!isInternalExtensionSender(sender)) {
      sendResponse({ error: 'Unauthorized: CHECK_GIT_UPDATES is only allowed from the extension UI.' });
      return false;
    }
    chrome.storage.local.get(['connectInternet'], async (res) => {
      if (!res.connectInternet) {
        sendResponse({ error: 'Connect to Internet is disabled. Enable it first to check for updates.' });
        return;
      }
      try {
        const updateInfo = await checkForGitUpdates();
        sendResponse({ success: true, ...updateInfo });
      } catch (err) {
        sendResponse({ error: err.message || 'Failed to check for updates.' });
      }
    });
    return true;
  }

  if (message.action === 'DOWNLOAD_GIT_UPDATE') {
    if (!isInternalExtensionSender(sender)) {
      sendResponse({ error: 'Unauthorized: DOWNLOAD_GIT_UPDATE is only allowed from the extension UI.' });
      return false;
    }
    chrome.storage.local.get(['connectInternet'], (res) => {
      if (!res.connectInternet) {
        sendResponse({ error: 'Connect to Internet is disabled. Enable it first to download updates.' });
        return;
      }

      const rawUrl = message.downloadUrl;
      const downloadUrl = isTrustedDownloadUrl(rawUrl) ? rawUrl : REPO_ZIP_URL;
      const filename = sanitizeFilename(message.filename);

      if (typeof chrome.downloads !== 'undefined' && chrome.downloads.download) {
        chrome.downloads.download(
          {
            url: downloadUrl,
            filename: filename,
            saveAs: true
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              sendResponse({ fallbackUrl: downloadUrl });
            } else {
              sendResponse({ success: true, downloadId });
            }
          }
        );
      } else {
        sendResponse({ fallbackUrl: downloadUrl });
      }
    });
    return true;
  }
});

// Semantic version helper to ensure versions are compared in strictly correct numerical order
function parseSemver(v) {
  if (typeof v !== 'string') return [0, 0, 0];
  const clean = v.replace(/^v/i, '').trim();
  const mainPart = clean.split('-')[0].split('+')[0];
  const parts = mainPart.split('.').map((p) => parseInt(p, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return parts.slice(0, 3);
}

function compareVersions(v1, v2) {
  const [maj1, min1, pat1] = parseSemver(v1);
  const [maj2, min2, pat2] = parseSemver(v2);

  if (maj1 !== maj2) return maj1 > maj2 ? 1 : -1;
  if (min1 !== min2) return min1 > min2 ? 1 : -1;
  if (pat1 !== pat2) return pat1 > pat2 ? 1 : -1;
  return 0;
}

const GIT_REPO = 'Spec-Pilot/open-tube';
const RAW_MANIFEST_URL = `https://raw.githubusercontent.com/${GIT_REPO}/main/manifest.json`;
const RELEASES_API_URL = `https://api.github.com/repos/${GIT_REPO}/releases/latest`;
const REPO_ZIP_URL = `https://github.com/${GIT_REPO}/archive/refs/heads/main.zip`;

async function checkForGitUpdates() {
  const currentVersion = chrome.runtime.getManifest()?.version || '1.2.1';
  let remoteVersion = null;
  let downloadUrl = REPO_ZIP_URL;
  let releaseNotes = '';

  // 1. Check latest release from GitHub API
  try {
    const res = await fetch(RELEASES_API_URL, {
      headers: { Accept: 'application/vnd.github.v3+json' }
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.tag_name) {
        remoteVersion = data.tag_name.replace(/^v/i, '').trim();
        releaseNotes = data.body || '';
        if (data.zipball_url) downloadUrl = data.zipball_url;
      }
    }
  } catch (e) {
    // API failed, fallback to raw manifest
  }

  // 2. Fallback to raw manifest.json on main branch
  if (!remoteVersion) {
    try {
      const res = await fetch(RAW_MANIFEST_URL);
      if (res.ok) {
        const manifest = await res.json();
        if (manifest && manifest.version) {
          remoteVersion = manifest.version.trim();
        }
      }
    } catch (e) {
      // Fallback failed
    }
  }

  if (!remoteVersion) {
    throw new Error('Unable to fetch latest version from Git. Please check connection.');
  }

  // Compare versions in correct numerical order (e.g. 1.2.1 > 1.2.0, 1.10.0 > 1.2.0)
  const comparison = compareVersions(remoteVersion, currentVersion);
  const hasUpdate = comparison > 0;

  return {
    hasUpdate,
    currentVersion,
    latestVersion: remoteVersion,
    downloadUrl,
    releaseNotes
  };
}
