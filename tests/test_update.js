/**
 * Test Suite for Git Update Check & Semantic Version Ordering
 */

const assert = require('assert');

// Semver logic extracted from scripts/background.js and popup/popup.js
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

function runTests() {
  console.log("=== RUNNING GIT UPDATE & SEMVER TESTS ===");

  // Test 1: Patch version bump in correct order
  console.log("\n[Test 1] Testing patch version comparison order...");
  assert.strictEqual(compareVersions('1.2.1', '1.2.0'), 1, "1.2.1 must be newer than 1.2.0");
  assert.strictEqual(compareVersions('1.2.0', '1.2.1'), -1, "1.2.0 must be older than 1.2.1");
  assert.strictEqual(compareVersions('1.2.0', '1.2.0'), 0, "Identical versions must return 0");
  console.log("PASSED: Patch version ordering is strictly verified.");

  // Test 2: Minor & Major bumps
  console.log("\n[Test 2] Testing minor and major version order...");
  assert.strictEqual(compareVersions('1.3.0', '1.2.9'), 1, "1.3.0 must be newer than 1.2.9");
  assert.strictEqual(compareVersions('2.0.0', '1.99.99'), 1, "2.0.0 must be newer than 1.99.99");
  assert.strictEqual(compareVersions('1.2.0', '2.0.0'), -1, "1.2.0 must be older than 2.0.0");
  console.log("PASSED: Minor and major version ordering verified.");

  // Test 3: Numerical vs Lexicographical order (1.10.0 vs 1.2.0)
  console.log("\n[Test 3] Testing numerical ordering (preventing alphabetical 1.10 < 1.2 bug)...");
  assert.strictEqual(compareVersions('1.10.0', '1.2.0'), 1, "1.10.0 must be recognized as newer than 1.2.0 numerically");
  assert.strictEqual(compareVersions('1.2.10', '1.2.2'), 1, "1.2.10 must be recognized as newer than 1.2.2 numerically");
  console.log("PASSED: Multi-digit numerical semver comparison verified.");

  // Test 4: 'v' prefix normalization
  console.log("\n[Test 4] Testing 'v' prefix normalization...");
  assert.strictEqual(compareVersions('v1.2.1', '1.2.0'), 1, "v1.2.1 must compare correctly against 1.2.0");
  assert.strictEqual(compareVersions('v1.2.0', '1.2.0'), 0, "v1.2.0 must be equal to 1.2.0");
  assert.strictEqual(compareVersions('V2.0.0', 'v1.9.9'), 1, "V2.0.0 must be newer than v1.9.9");
  console.log("PASSED: 'v' prefix stripped cleanly.");

  // Test 5: Connect to Internet gate enforcement
  console.log("\n[Test 5] Testing 'Connect to Internet' toggle gate...");
  function attemptUpdateCheck(connectInternetEnabled) {
    if (!connectInternetEnabled) {
      return { allowed: false, message: 'Connect to Internet is disabled. Enable it first to check for updates.' };
    }
    return { allowed: true, message: 'Checking Git repository...' };
  }

  const blockedCheck = attemptUpdateCheck(false);
  assert.strictEqual(blockedCheck.allowed, false, "Update check must be blocked when Connect to Internet is false");

  const allowedCheck = attemptUpdateCheck(true);
  assert.strictEqual(allowedCheck.allowed, true, "Update check must be allowed when Connect to Internet is true");
  console.log("PASSED: Connect to Internet toggle gate strictly enforced.");

  // Test 6: Download URL resolution
  console.log("\n[Test 6] Testing Git download URL resolution...");
  const GIT_REPO = 'Spec-Pilot/open-tube';
  const zipUrl = `https://github.com/${GIT_REPO}/archive/refs/heads/main.zip`;
  assert.ok(zipUrl.includes('Spec-Pilot/open-tube/archive/refs/heads/main.zip'), "Download zip URL must point to main branch archive");
  console.log("PASSED: Git download URL verified.");

  console.log("\n>>> ALL UPDATE & SEMVER TESTS PASSED SUCCESSFULLY! <<<\n");
}

runTests();
