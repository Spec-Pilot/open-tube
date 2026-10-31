# 📖 How to Install OpenTube AdShield

A step-by-step beginner's guide to installing and using **OpenTube AdShield** on any Chromium-based browser (Google Chrome, Microsoft Edge, Brave, Opera, Vivaldi).

<p align="center">
  <img src="assets/banner.png" alt="OpenTube AdShield Banner" width="100%" style="border-radius: 10px;" />
</p>

---

## ⚡ Quick 60-Second Setup

1. **Download & Extract** the repository.
2. Open your browser's extension page (`chrome://extensions` or `edge://extensions`).
3. Turn **ON** **Developer mode**.
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Open YouTube and enjoy uninterrupted, ad-free streaming!

---

## 🖥️ Browser-Specific Instructions

### 1. Google Chrome

1. **Download the Extension**:
   * Click the green **Code** button at [github.com/Spec-Pilot/open-tube](https://github.com/Spec-Pilot/open-tube) and select **Download ZIP**.
   * Extract the downloaded `.zip` file to a permanent folder on your computer (e.g. `C:\Users\YourName\Documents\open-tube` or `D:\open-tube`).  
     *(⚠️ Do not delete this folder after installing, as Chrome runs the extension directly from it).*

2. **Open Extensions Page**:
   * In Chrome's address bar, type:
     ```text
     chrome://extensions
     ```
     and press **Enter**.
   * Alternatively, click the **Three Dots Menu (⋮)** in the top-right corner $\rightarrow$ **Extensions** $\rightarrow$ **Manage Extensions**.

3. **Enable Developer Mode**:
   * Look in the **top-right corner** of the Extensions page.
   * Switch the toggle for **Developer mode** to **ON** (turns blue).

4. **Load the Unpacked Folder**:
   * Click the **"Load unpacked"** button that appears in the top-left toolbar.
   * In the folder picker dialog, navigate to the folder where you extracted the project (the folder containing `manifest.json`) and click **Select Folder**.

5. **Pin to Toolbar (Optional but Recommended)**:
   * Click the **Puzzle Piece icon (🧩)** in the top-right of your Chrome toolbar.
   * Find **OpenTube AdShield** and click the **Pin icon (📌)** to keep the live stats and controls easily accessible.

---

### 2. Microsoft Edge

1. **Download and Extract**:
   * Download the repository from GitHub and extract it to a permanent folder on your PC.

2. **Open Edge Extensions**:
   * Type into Edge's address bar:
     ```text
     edge://extensions
     ```
     and press **Enter**.

3. **Enable Developer Mode**:
   * In the **left sidebar** (or bottom-left depending on your Edge version), toggle **Developer mode** to **ON**.

4. **Load the Extension**:
   * Click the **"Load unpacked"** button in the top toolbar.
   * Select the folder containing `manifest.json` and confirm.

5. **Pin to Edge Toolbar**:
   * Click the **Puzzle icon (🧩)** on Edge's toolbar $\rightarrow$ click the **Eye icon** next to OpenTube AdShield to show it on the toolbar.

---

### 3. Brave Browser

1. Open `brave://extensions` in your address bar.
2. Toggle **Developer mode** in the top-right corner to **ON**.
3. Click **Load unpacked** in the top-left toolbar.
4. Select the folder containing `manifest.json`.
5. *(Optional)* You can keep Brave Shields enabled or disabled for YouTube—OpenTube AdShield works independently and eliminates the 5-second pauses and anti-adblock popups automatically.

---

### 4. Opera / Opera GX

1. In Opera's address bar, navigate to:
   ```text
   opera://extensions
   ```
2. Turn **ON** the **Developer Mode** toggle in the top-right.
3. Click **Load unpacked** and select the folder containing `manifest.json`.

---

### 5. Mozilla Firefox

1. Open Firefox and type into the address bar:
   ```text
   about:debugging#/runtime/this-firefox
   ```
   and press **Enter**.
2. Under the **Temporary Extensions** section, click the **"Load Temporary Add-on..."** button.
3. In the file picker, select the `manifest.json` file inside the OpenTube AdShield directory.
4. The extension loads immediately with full Manifest V3 ad-blocking and pre-emptive ad elimination.

---

## 🎯 How to Verify It's Working

1. Open **[YouTube](https://www.youtube.com)** in a new tab.
2. Click the **OpenTube AdShield** icon on your browser toolbar.
3. You will see the sleek control panel:
   * **Status Badge**: Displays a vibrant green **Active** pill.
   * **Live Stats**: Counters for *Ads Skipped*, *Banners Blocked*, and *Time Saved*.
   * **Non-Stop Music & Autoplay**: Turned **ON** by default so videos transition seamlessly without pausing.
4. Play any video or music playlist. Notice:
   * Zero pre-roll or mid-roll ads.
   * Any ads attempt to open are fast-forwarded at 16x and closed in 0 milliseconds.
   * When stepping away from your PC, continuous autoplay remains active without triggering "Video paused. Continue watching?" interruptions.

---

## 🔄 How to Update When New Changes Are Released

Whenever an update is released on GitHub:

1. **Download/Pull the latest files**:
   * If using Git:
     ```bash
     git pull origin main
     ```
   * If downloaded via ZIP: Download the new ZIP from GitHub and replace the files in your folder.
2. Go to `chrome://extensions` or `edge://extensions`.
3. Find the **OpenTube AdShield** card.
4. Click the **Reload icon (🔄)** on the card.
5. The extension is instantly updated to the latest version with no reinstall required!

---

## ❓ Frequently Asked Questions (FAQ)

#### Q: Why can't I install it directly from the Chrome Web Store?
> Google frequently restricts or delays YouTube ad blockers on the Chrome Web Store. By loading it as an open-source unpacked extension, you have complete control over the code running on your browser, with 0% risk of automatic store takedowns or silent tracking.

#### Q: Why does Chrome say "Manifest v3"?
> OpenTube AdShield is built natively for Chrome **Manifest V3**—the modern extension standard required by Google Chrome, Edge, and Brave. It will continue working permanently without compatibility warnings.

#### Q: Error: "Manifest file is missing or unreadable"?
> When selecting the folder in "Load unpacked", ensure you select the root folder that directly contains `manifest.json`, not a parent folder or nested subfolder.

#### Q: Does this extension collect my data or passwords?
> **Never.** OpenTube AdShield is 100% open-source and client-side. It does not send a single byte of telemetry or network requests to any third-party server. You can inspect all files in the repository to verify this yourself.
