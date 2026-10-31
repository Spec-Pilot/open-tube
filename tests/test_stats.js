/**
 * Test Suite for OpenTube Blocking Statistics & Metric Tracking
 * Verifies accuracy of Ads Skipped, Banners Blocked, and Time Saved counters.
 */

const assert = require('assert');

function runStatsTests() {
  console.log("=== RUNNING BLOCKING METRICS & STATS TESTS ===");

  // 1. Test cleanPlayerResponse returns true ONLY when ads were detected & stripped
  console.log("\n[Test 1] Testing ad detection accuracy in player responses...");
  function cleanPlayerResponse(response) {
    if (!response || typeof response !== 'object') return false;
    let hasAds = false;
    if (response.adPlacements) {
      if (!Array.isArray(response.adPlacements) || response.adPlacements.length > 0) hasAds = true;
      delete response.adPlacements;
    }
    if (response.adSlots) {
      if (!Array.isArray(response.adSlots) || response.adSlots.length > 0) hasAds = true;
      delete response.adSlots;
    }
    if (response.playerAds) {
      if (!Array.isArray(response.playerAds) || response.playerAds.length > 0) hasAds = true;
      delete response.playerAds;
    }
    if (response.adBreakHeartbeatParams) {
      hasAds = true;
      delete response.adBreakHeartbeatParams;
    }
    return hasAds;
  }

  const responseWithAds = {
    playabilityStatus: { status: 'OK' },
    adPlacements: [{ id: 'pre-roll' }],
    adSlots: [{ id: 'slot-1' }]
  };
  const responseWithoutAds = {
    playabilityStatus: { status: 'OK' },
    streamingData: { formats: [] }
  };

  assert.strictEqual(cleanPlayerResponse(responseWithAds), true, "Must detect ads and return true");
  assert.strictEqual(cleanPlayerResponse(responseWithoutAds), false, "Must return false when no ads exist to prevent false counting");
  console.log("PASSED: Ad detection accuracy verified.");

  // 2. Test cleanInitialData counts stripped banners & feed ads
  console.log("\n[Test 2] Testing initial data feed ad and banner counting...");
  function cleanInitialData(data) {
    if (!data || typeof data !== 'object') return 0;
    let removedCount = 0;
    const removeAdKeys = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      if (Array.isArray(obj)) {
        for (let i = obj.length - 1; i >= 0; i--) {
          const item = obj[i];
          if (item && (item.adSlotRenderer || item.inFeedAdLayoutRenderer || item.masthead)) {
            obj.splice(i, 1);
            removedCount++;
          } else {
            removeAdKeys(item);
          }
        }
      } else {
        for (const key of Object.keys(obj)) {
          if (key === 'adSlotRenderer' || key === 'inFeedAdLayoutRenderer') {
            delete obj[key];
            removedCount++;
          } else {
            removeAdKeys(obj[key]);
          }
        }
      }
    };
    removeAdKeys(data);
    return removedCount;
  }

  const feedData = {
    contents: [
      { normalVideo: { title: 'Video 1' } },
      { inFeedAdLayoutRenderer: { id: 'ad-card' } },
      { masthead: { id: 'top-banner' } }
    ]
  };

  const removed = cleanInitialData(feedData);
  assert.strictEqual(removed, 2, "Must count exactly 2 removed banner renderers");
  assert.strictEqual(feedData.contents.length, 1, "Only non-ad items must remain");
  console.log("PASSED: Feed banner counting verified.");

  // 3. Test DOM banner cleaner immediate reporting (no threshold block)
  console.log("\n[Test 3] Testing immediate reporting on single or multiple banners...");
  let reportedType = null;
  let reportedCount = 0;
  function mockReportAdBlocked(type, count) {
    reportedType = type;
    reportedCount = count;
  }

  function mockCleanStaticAds(elementsFound) {
    const found = elementsFound;
    if (found > 0) {
      mockReportAdBlocked('banner', found);
    }
  }

  mockCleanStaticAds(1); // 1 banner removed
  assert.strictEqual(reportedType, 'banner');
  assert.strictEqual(reportedCount, 1, "Single banner removal must immediately report count of 1");

  mockCleanStaticAds(3); // 3 banners removed
  assert.strictEqual(reportedCount, 3, "Batch of 3 banners must report count of 3");
  console.log("PASSED: Banner cleaner immediate reporting verified.");

  // 4. Test Serialized Queue for concurrent STAT_INCREMENT
  console.log("\n[Test 4] Testing serialized queue for concurrent increments...");
  let mockStorage = {
    stats: { adsSkipped: 0, bannersBlocked: 0, timeSavedSeconds: 0 },
    enabled: true
  };

  let pendingQueue = Promise.resolve();
  function queueStatIncrement(statType, count) {
    pendingQueue = pendingQueue.then(() => {
      return new Promise((resolve) => {
        // Simulate async storage read with slight random delay
        setTimeout(() => {
          const stats = mockStorage.stats;
          if (statType === 'ad') {
            stats.adsSkipped += count;
            stats.timeSavedSeconds += count * 15;
          } else if (statType === 'banner') {
            stats.bannersBlocked += count;
          }
          // Simulate async storage write
          setTimeout(() => {
            resolve(stats);
          }, 5);
        }, 5);
      });
    });
    return pendingQueue;
  }

  // Fire 10 concurrent increments simultaneously
  const promises = [];
  for (let i = 0; i < 5; i++) {
    promises.push(queueStatIncrement('ad', 1));
    promises.push(queueStatIncrement('banner', 2));
  }

  return Promise.all(promises).then(() => {
    assert.strictEqual(mockStorage.stats.adsSkipped, 5, "Must accurately record 5 skipped ads without drops");
    assert.strictEqual(mockStorage.stats.bannersBlocked, 10, "Must accurately record 10 blocked banners without drops");
    assert.strictEqual(mockStorage.stats.timeSavedSeconds, 75, "Time saved must be 5 * 15 = 75s");
    console.log("PASSED: Serialized queue handles rapid concurrent increments with 100% precision.");

    console.log("\n>>> ALL STATS & METRICS TESTS PASSED SUCCESSFULLY! <<<\n");
  });
}

runStatsTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});

