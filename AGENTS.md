# Agent Instructions - OpenTube AdShield

Canonical instructions for AI coding assistants working in this repository.

## Project Overview & Architecture
- **Type**: Chrome Manifest V3 Browser Extension.
- **Zero Dependencies**: Pure vanilla JavaScript (ES6+), CSS, and HTML. Do NOT install npm packages or build toolchains.
- **Script Boundaries & Execution Worlds**:
  - `scripts/inject.js`: Executes in `MAIN` world at `document_start`. Handles pre-emptive `ytInitialPlayerResponse` sterilization, stealth `fetch` mocking, player engine API hooks, and auto-pause prevention.
  - `scripts/content.js`: Executes in isolated content script world. Handles cosmetic DOM cleanup, sponsored Shorts skipping, and communication with the background worker.
  - `scripts/background.js`: Background Service Worker for badge counters, storage persistence, and DNR ruleset management.
  - `rules/rules.json`: DeclarativeNetRequest rules blocking 3rd-party tracking networks.
  - `popup/`: Extension popup UI (`popup.html`, `popup.css`, `popup.js`).

## Verification & Test Commands
Always run the test suite to verify changes before completing tasks:

| Target | Command | Purpose |
|--------|---------|---------|
| Unit Tests | `node tests/test_inject.js` | Validates player sterilization, mock fetch, and pause protection |
| CDP E2E | `node tests/test_extension.js` | Automated Chrome DevTools Protocol verification with live profile |

## Core Coding Rules
- **Non-Destructive Playback**: Video and music playback must never be interrupted. Wrap fragile DOM/API hooks in defensive `try/catch` blocks.
- **Anti-Detection & Stealth**: Never simply reject or block YouTube internal tracking endpoints (`/api/stats/ads`, `/pagead/`); always return synthetic `200 OK` responses to avoid anti-adblock detection.
- **Preserve Existing Code & Comments**: Maintain existing comments, structure, and naming conventions.
- **Atomic & Focused Changes**: Keep commits and edits minimal, targeted, and directly related to the task.

## Commit Attribution
AI commits must include:
```
Co-Authored-By: Antigravity <noreply@google.com>
```
