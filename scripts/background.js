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

  if (message.action === 'CHECK_GIT_UPDATES') {
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
    chrome.storage.local.get(['connectInternet'], (res) => {
      if (!res.connectInternet) {
        sendResponse({ error: 'Connect to Internet is disabled. Enable it first to download updates.' });
        return;
      }

      const downloadUrl = message.downloadUrl || REPO_ZIP_URL;
      const filename = message.filename || 'open-tube-latest.zip';

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
