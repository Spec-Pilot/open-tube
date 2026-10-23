# Contributing to OpenTube AdShield

Thank you for your interest in contributing to OpenTube AdShield! As an open-source project, community contributions help keep this extension fast, reliable, and up-to-date with YouTube's player changes.

## Development Workflow

1. **Clone the repository**:
   ```bash
   git clone https://github.com/opentube/adshield.git
   cd adshield
   ```

2. **Load into Google Chrome**:
   * Open `chrome://extensions`.
   * Enable **Developer mode**.
   * Click **Load unpacked** and select the repository root directory.

3. **Making Changes**:
   * Ad skipper & speedup: `scripts/content.js`
   * Background service worker & badge: `scripts/background.js`
   * Cosmetic ad hiding rules: `styles/content.css`
   * Declarative network rules: `rules/rules.json`
   * Popup interface: `popup/popup.html`, `popup/popup.css`, `popup/popup.js`

4. **Testing**:
   * After modifying any file, click the **Reload icon (↻)** on the extension card in `chrome://extensions`.
   * Test on YouTube watch pages, home feed, shorts, and search results.

## Submitting Pull Requests

- Keep changes focused and atomic.
- Include a clear description of the fix or feature.
- Verify that video playback is smooth and unaffected when ads are not present.
- Ensure no console errors are thrown by extension scripts.
