# 🛡️ OpenTube AdShield

> **A high-performance, open-source YouTube ad blocker and accelerator built for Chrome Manifest V3.**  
> Blazingly fast, undetectable, 100% client-side, and zero telemetry.

---

## 🚀 Key Features

* **⚡ Ultra Fast-Forward (16x)**: Instantly accelerates unskippable video ads to 16x speed and mutes audio, clearing them in milliseconds.
* **⏭️ Auto-Click Skip**: Automatically finds and clicks skip buttons (`.ytp-ad-skip-button-modern`, `.ytp-skip-ad-button`) the instant they appear.
* **🛡️ Anti-Adblock Modal Bypass**: Automatically detects and dismisses YouTube's *"Ad blockers violate YouTube's Terms of Service"* enforcement popup and restores playback seamlessly.
* **🧹 Cosmetic Filtering**: Strips home feed ads, masthead promotions, sidebar companion ads, search promos, and video overlays with zero layout shifts.
* **📱 Sponsored Shorts Auto-Skip**: Detects sponsored clips in the YouTube Shorts feed and automatically scrolls to the next reel.
* **📊 Live Dashboard**: Sleek dark-mode popup displaying live stats on ads skipped, banners blocked, and estimated time saved.
* **🔒 100% Privacy & Open Source**: No external tracking, no servers, zero telemetry. All code runs locally in your browser.

---

## 📥 Installation (Load Unpacked in Chrome / Brave / Edge)

Since OpenTube AdShield is an open-source project, you can load it directly into any Chromium browser in seconds:

1. **Clone or Download** this repository:
   ```bash
   git clone https://github.com/opentube/adshield.git
   ```
   *(Or download the ZIP file from GitHub and extract it)*

2. Open your browser and navigate to the extensions page:
   * **Chrome**: `chrome://extensions`
   * **Brave**: `brave://extensions`
   * **Edge**: `edge://extensions`

3. Turn **ON** the **"Developer mode"** toggle in the top-right corner.

4. Click the **"Load unpacked"** button in the top-left toolbar.

5. Select the project directory (`d:\youtube` or the folder containing `manifest.json`).

6. Open [YouTube](https://www.youtube.com) and enjoy uninterrupted, ad-free video streaming!

---

## 🛠️ Architecture & How It Works

Traditional ad blockers that block all YouTube network requests often trigger YouTube's anti-adblock detection or playback errors. OpenTube AdShield uses a modern **hybrid evasion architecture**:

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenTube AdShield                       │
├─────────────────────────┬───────────────────────────────────┤
│ 1. DeclarativeNetRequest│ Blocks 3rd-party tracking         │
│    (Manifest V3)        │ (doubleclick, pagead, telemetry)  │
├─────────────────────────┼───────────────────────────────────┤
│ 2. Video Accelerator    │ Speeds unskippable ads to 16x     │
│    & Instant Skipper    │ & clicks skip buttons immediately │
├─────────────────────────┼───────────────────────────────────┤
│ 3. Enforcement Bypass   │ Dismisses "Ad blocker violation"  │
│                         │ popups & auto-resumes playback    │
├─────────────────────────┼───────────────────────────────────┤
│ 4. Cosmetic Filters     │ CSS-level hiding of mastheads,    │
│                         │ feed promos & sponsored cards     │
└─────────────────────────┴───────────────────────────────────┘
```

1. **Network Filtering (`rules/rules.json`)**: Uses Manifest V3's `declarativeNetRequest` API to block external tracking and analytics domains (`doubleclick.net`, `googleadservices.com`, `youtube.com/api/stats/ads`, `youtube.com/pagead/*`) without breaking player media buffers.
2. **Dynamic Video Manipulation (`scripts/content.js`)**: Employs high-speed event monitoring (100ms interval + `MutationObserver`) on `.html5-video-player`. When an ad state (`.ad-showing`) is detected, it mutes audio, sets `playbackRate = 16.0`, and seeks to the ad's end while firing programmatic clicks on skip targets.
3. **Popup Interface (`popup/`)**: Provides an interactive dashboard using vanilla HTML5, CSS custom properties, and `chrome.storage.local` to toggle features and view real-time blocked statistics.

---

## 📁 Project Structure

```
d:/youtube/
├── manifest.json              # Chrome Manifest V3 configuration
├── README.md                  # Project documentation & installation guide
├── LICENSE                    # MIT open-source license
├── CONTRIBUTING.md            # Guidelines for open-source contributors
├── rules/
│   └── rules.json             # DeclarativeNetRequest ruleset
├── scripts/
│   ├── content.js             # Core ad-skipping, speedup & anti-adblock bypass
│   ├── background.js          # Service worker for metrics & badge counters
│   └── generate_icons.ps1     # High-resolution icon generator
├── styles/
│   └── content.css            # High-performance cosmetic ad hiding rules
├── popup/
│   ├── popup.html             # Popup dashboard interface
│   ├── popup.css              # Modern dark-mode styling
│   └── popup.js               # Reactive settings and stats controller
└── icons/
    ├── icon.svg               # Vector shield emblem
    ├── icon16.png             # 16x16 icon
    ├── icon32.png             # 32x32 icon
    ├── icon48.png             # 48x48 icon
    └── icon128.png            # 128x128 high-res icon
```

---

## ⚙️ Configurable Options

Click the extension icon in your browser toolbar to access the control panel:

| Setting | Default | Description |
| :--- | :--- | :--- |
| **Ad Protection (Master)** | `ON` | Master toggle to enable or pause all ad blocking functions. |
| **Ultra Fast-Forward** | `ON` | Speeds unskippable pre-roll and mid-roll ads up to 16x. |
| **Auto-Click Skip** | `ON` | Clicks skip buttons the moment they are rendered by the player. |
| **Block Banners & Feeds** | `ON` | Hides feed ads, mastheads, and sponsored search results. |
| **Bypass Adblock Popups** | `ON` | Dismisses YouTube's anti-adblock enforcement dialogs. |

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Test your changes locally in Chrome via `chrome://extensions`.
4. Commit your changes (`git commit -m "Add amazing feature"`).
5. Push to the branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for more information.
