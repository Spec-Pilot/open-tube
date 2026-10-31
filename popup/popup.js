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
  const toggleConnectInternet = document.getElementById('toggleConnectInternet');

  const btnCheckUpdate = document.getElementById('btnCheckUpdate');
  const lblCheckUpdate = document.getElementById('lblCheckUpdate');
  const btnDownloadUpdate = document.getElementById('btnDownloadUpdate');
  const lblDownloadUpdate = document.getElementById('lblDownloadUpdate');
  const updateStatusText = document.getElementById('updateStatusText');
  const currentVersionBadge = document.getElementById('currentVersionBadge');
  const headerVersionBadge = document.getElementById('headerVersionBadge');

  const statAdsSkipped = document.getElementById('statAdsSkipped');
  const statBannersBlocked = document.getElementById('statBannersBlocked');
  const statTimeSaved = document.getElementById('statTimeSaved');

  const btnResetStats = document.getElementById('btnResetStats');

  const CURRENT_VERSION = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '1.2.1';
  if (currentVersionBadge) currentVersionBadge.textContent = `v${CURRENT_VERSION}`;
  if (headerVersionBadge) headerVersionBadge.textContent = `Shield v${CURRENT_VERSION}`;

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
    connectInternet: false,
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

    // Connect to Internet toggle & Update check button state
    const isInternetAllowed = data.connectInternet === true;
    if (toggleConnectInternet) {
      toggleConnectInternet.checked = isInternetAllowed;
    }
    if (btnCheckUpdate) {
      btnCheckUpdate.disabled = !isInternetAllowed;
    }
    if (!isInternetAllowed) {
      if (updateStatusText) {
        updateStatusText.textContent = 'Turn on "Connect to Internet" to check for updates';
        updateStatusText.style.color = 'var(--text-muted)';
      }
      if (btnDownloadUpdate) {
        btnDownloadUpdate.classList.add('hidden');
      }
    }

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

  // Connect to Internet Toggle
  if (toggleConnectInternet) {
    toggleConnectInternet.addEventListener('change', (e) => {
      const allowed = e.target.checked;
      saveOption('connectInternet', allowed);
      if (btnCheckUpdate) {
        btnCheckUpdate.disabled = !allowed;
      }
      if (!allowed) {
        if (btnDownloadUpdate) btnDownloadUpdate.classList.add('hidden');
        if (updateStatusText) {
          updateStatusText.textContent = 'Turn on "Connect to Internet" to check for updates';
          updateStatusText.style.color = 'var(--text-muted)';
        }
      } else {
        if (updateStatusText) {
          updateStatusText.textContent = 'Ready to check for updates from Git.';
          updateStatusText.style.color = 'var(--accent-emerald)';
        }
      }
    });
  }

  // Version Comparison Helper (Strict Numerical Semantic Ordering: Major.Minor.Patch)
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

  let latestUpdateData = null;

  // Safe status message renderer without innerHTML to prevent DOM XSS
  function setUpdateStatus(prefix, boldText, suffix, color) {
    if (!updateStatusText) return;
    updateStatusText.textContent = '';
    if (prefix) {
      updateStatusText.appendChild(document.createTextNode(prefix));
    }
    if (boldText) {
      const strong = document.createElement('strong');
      strong.textContent = boldText;
      updateStatusText.appendChild(strong);
    }
    if (suffix) {
      updateStatusText.appendChild(document.createTextNode(suffix));
    }
    if (color) {
      updateStatusText.style.color = color;
    }
  }

  function handleUpdateCheckResult(res) {
    if (btnCheckUpdate) {
      btnCheckUpdate.disabled = !toggleConnectInternet.checked;
    }
    if (lblCheckUpdate) {
      lblCheckUpdate.textContent = 'Check for Update';
    }

    if (!res || res.error) {
      if (updateStatusText) {
        updateStatusText.textContent = `❌ ${res?.error || 'Update check failed. Check internet.'}`;
        updateStatusText.style.color = 'var(--accent-red)';
      }
      return;
    }

    latestUpdateData = res;

    if (res.hasUpdate) {
      setUpdateStatus('✨ Update found: ', `v${res.latestVersion}`, ` (current: v${res.currentVersion})`, 'var(--accent-emerald)');
      if (lblDownloadUpdate) {
        lblDownloadUpdate.textContent = `Download v${res.latestVersion} (Git)`;
      }
      if (btnDownloadUpdate) {
        btnDownloadUpdate.classList.remove('hidden');
      }
    } else {
      if (updateStatusText) {
        updateStatusText.textContent = `✅ Up to date! Version v${res.currentVersion} is the latest.`;
        updateStatusText.style.color = 'var(--accent-emerald)';
      }
      if (btnDownloadUpdate) {
        btnDownloadUpdate.classList.add('hidden');
      }
    }
  }

  // Check for Update Button
  if (btnCheckUpdate) {
    btnCheckUpdate.addEventListener('click', async () => {
      if (!toggleConnectInternet.checked) {
        if (updateStatusText) {
          updateStatusText.textContent = '⚠️ Enable "Connect to Internet" toggle first!';
          updateStatusText.style.color = 'var(--accent-red)';
        }
        return;
      }

      btnCheckUpdate.disabled = true;
      if (lblCheckUpdate) lblCheckUpdate.textContent = 'Checking Git...';
      if (updateStatusText) {
        updateStatusText.textContent = 'Querying Git repository for updates...';
        updateStatusText.style.color = 'var(--text-secondary)';
      }
      if (btnDownloadUpdate) btnDownloadUpdate.classList.add('hidden');

      // 1. Try background service worker
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'CHECK_GIT_UPDATES' }, (res) => {
          if (chrome.runtime.lastError) {
            checkDirectFallback();
          } else {
            handleUpdateCheckResult(res);
          }
        });
      } else {
        checkDirectFallback();
      }

      async function checkDirectFallback() {
        try {
          const res = await fetch('https://raw.githubusercontent.com/Spec-Pilot/open-tube/main/manifest.json');
          if (res.ok) {
            const data = await res.json();
            const remoteVersion = data.version;
            const comparison = compareVersions(remoteVersion, CURRENT_VERSION);
            handleUpdateCheckResult({
              success: true,
              hasUpdate: comparison > 0,
              currentVersion: CURRENT_VERSION,
              latestVersion: remoteVersion,
              downloadUrl: 'https://github.com/Spec-Pilot/open-tube/archive/refs/heads/main.zip'
            });
          } else {
            handleUpdateCheckResult({ error: 'Failed to reach GitHub.' });
          }
        } catch (err) {
          handleUpdateCheckResult({ error: err.message || 'Network error.' });
        }
      }
    });
  }

  // Download Update Button
  if (btnDownloadUpdate) {
    btnDownloadUpdate.addEventListener('click', () => {
      if (!toggleConnectInternet.checked) {
        if (updateStatusText) {
          updateStatusText.textContent = '⚠️ Enable "Connect to Internet" toggle first!';
          updateStatusText.style.color = 'var(--accent-red)';
        }
        return;
      }

      const downloadUrl =
        latestUpdateData?.downloadUrl || 'https://github.com/Spec-Pilot/open-tube/archive/refs/heads/main.zip';
      const version = latestUpdateData?.latestVersion || 'latest';
      const filename = `open-tube-v${version}.zip`;

      if (updateStatusText) {
        updateStatusText.textContent = `⏳ Downloading v${version}...`;
        updateStatusText.style.color = 'var(--accent-blue)';
      }

      if (typeof chrome !== 'undefined' && chrome.downloads && chrome.downloads.download) {
        chrome.downloads.download(
          {
            url: downloadUrl,
            filename: filename,
            saveAs: true
          },
          (downloadId) => {
            if (chrome.runtime.lastError) {
              window.open(downloadUrl, '_blank');
            }
            setUpdateStatus('📦 Downloaded! Extract zip into extension folder & reload at ', 'chrome://extensions', '', 'var(--accent-emerald)');
          }
        );
      } else if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'DOWNLOAD_GIT_UPDATE', downloadUrl, filename }, (res) => {
          if (res?.fallbackUrl) {
            window.open(res.fallbackUrl, '_blank');
          }
          setUpdateStatus('📦 Downloaded! Extract zip into extension folder & reload at ', 'chrome://extensions', '', 'var(--accent-emerald)');
        });
      } else {
        window.open(downloadUrl, '_blank');
        setUpdateStatus('📦 Download started! Extract zip into extension folder & reload at ', 'chrome://extensions', '', 'var(--accent-emerald)');
      }
    });
  }

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

  // GitHub Repository Link Handler
  const githubLink = document.querySelector('.github-link');
  if (githubLink) {
    githubLink.addEventListener('click', (e) => {
      e.preventDefault();
      const repoUrl = 'https://github.com/Spec-Pilot/open-tube';
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: repoUrl });
      } else {
        window.open(repoUrl, '_blank');
      }
    });
  }

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
