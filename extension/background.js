// Track which tabs currently have the debugger attached
const attachedTabs = new Set();

// Icon paths
const ICON_ACTIVE = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

const ICON_INACTIVE = {
  16: "icons/icon16-gray.png",
  32: "icons/icon32-gray.png",
  48: "icons/icon48-gray.png",
  128: "icons/icon128-gray.png",
};

// ============================================================
// Enabled State
// ============================================================

async function isEnabled() {
  const result = await chrome.storage.local.get(['enabled']);
  return result.enabled !== false; // Default to true
}

async function setEnabled(enabled) {
  await chrome.storage.local.set({ enabled: enabled });
  updateBadgeState(enabled);
  // Notify all YouTube tabs about the state change
  const tabs = await chrome.tabs.query({ url: 'https://www.youtube.com/*' });
  for (const tab of tabs) {
    chrome.tabs.sendMessage(tab.id, { action: 'enabledChanged', enabled: enabled }).catch(() => {});
  }
}

async function updateBadgeState(enabled) {
  if (enabled) {
    const stats = await getStats();
    updateBadgeCount(stats.todayAdsBlocked);
    // Always use red icon when enabled
    chrome.action.setIcon({ path: ICON_ACTIVE });
  } else {
    // Gray icon only when disabled
    chrome.action.setBadgeBackgroundColor({ color: '#888888' });
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setIcon({ path: ICON_INACTIVE });
  }
}

// ============================================================
// Statistics Storage
// ============================================================

async function getStats() {
  const result = await chrome.storage.local.get(['totalAdsBlocked', 'blockedAds', 'todayAdsBlocked', 'lastResetDate']);
  const today = new Date().toDateString();

  // Reset daily counter if it's a new day
  if (result.lastResetDate !== today) {
    await chrome.storage.local.set({ todayAdsBlocked: 0, lastResetDate: today });
    result.todayAdsBlocked = 0;
  }

  return {
    totalAdsBlocked: result.totalAdsBlocked || 0,
    todayAdsBlocked: result.todayAdsBlocked || 0,
    blockedAds: result.blockedAds || []
  };
}

async function recordBlockedAd(adName, method) {
  const stats = await getStats();
  const today = new Date().toDateString();

  const newAd = {
    name: adName,
    method: method,
    timestamp: Date.now(),
    date: new Date().toLocaleString()
  };

  // Add to blocked ads list (keep last 100)
  const blockedAds = [newAd, ...stats.blockedAds].slice(0, 100);

  await chrome.storage.local.set({
    totalAdsBlocked: stats.totalAdsBlocked + 1,
    todayAdsBlocked: stats.todayAdsBlocked + 1,
    blockedAds: blockedAds,
    lastResetDate: today
  });

  // Update badge with today's count
  updateBadgeCount(stats.todayAdsBlocked + 1);
}

function updateBadgeCount(count) {
  const text = count > 0 ? String(count) : '';
  chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  chrome.action.setBadgeText({ text: text });
  // Don't set icon here - icon state is managed separately per-tab
}

// ============================================================
// Message Handling
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle enabled state requests
  if (message.action === "getEnabled") {
    isEnabled().then(enabled => sendResponse({ enabled: enabled }));
    return true;
  }

  if (message.action === "setEnabled") {
    setEnabled(message.enabled).then(() => sendResponse({ success: true }));
    return true;
  }

  // Handle popup requests for stats
  if (message.action === "getStats") {
    getStats().then(stats => sendResponse(stats));
    return true;
  }

  // Handle clear stats request
  if (message.action === "clearStats") {
    chrome.storage.local.set({
      totalAdsBlocked: 0,
      todayAdsBlocked: 0,
      blockedAds: [],
      lastResetDate: new Date().toDateString()
    }).then(() => {
      updateBadgeCount(0);
      sendResponse({ success: true });
    });
    return true;
  }

  if (!sender.tab) return;

  const tabId = sender.tab.id;

  // Handle ad state changes (icon stays red, no change needed)
  if (message.action === "adDetected") {
    sendResponse({ success: true });
    return;
  }

  if (message.action === "adCleared") {
    sendResponse({ success: true });
    return;
  }

  // Handle ad blocked notification
  if (message.action === "adBlocked") {
    isEnabled().then(enabled => {
      if (enabled) {
        recordBlockedAd(message.adName, message.method);
      }
    });
    sendResponse({ success: true });
    return;
  }

  // Handle skip ad request
  if (message.action === "skipAd") {
    isEnabled().then(async (enabled) => {
      if (!enabled) {
        sendResponse({ success: false, error: 'Extension disabled' });
        return;
      }
      const { x, y } = message.coordinates;
      try {
        await dispatchTrustedClick(tabId, x, y);
        blinkBadge();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true;
  }
});

async function dispatchTrustedClick(tabId, x, y) {
  // Attach debugger if not already attached
  if (!attachedTabs.has(tabId)) {
    await chrome.debugger.attach({ tabId }, "1.3");
    attachedTabs.add(tabId);
  }

  // Send mousePressed then mouseReleased via CDP Input.dispatchMouseEvent
  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });

  await chrome.debugger.sendCommand({ tabId }, "Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });

  // Detach debugger after click to remove the yellow bar quickly
  try {
    await chrome.debugger.detach({ tabId });
  } catch (_) {
    // ignore if already detached
  }
  attachedTabs.delete(tabId);
}

// Blink the extension badge when an ad is skipped (uses global badge, not per-tab)
function blinkBadge() {
  let visible = true;
  let blinks = 0;
  const maxBlinks = 6;

  chrome.action.setBadgeBackgroundColor({ color: "#2196F3" }); // Blue color

  const interval = setInterval(() => {
    if (blinks >= maxBlinks) {
      clearInterval(interval);
      // Restore the count badge
      getStats().then(stats => updateBadgeCount(stats.todayAdsBlocked));
      return;
    }
    chrome.action.setBadgeText({ text: visible ? "SKIP" : "" });
    visible = !visible;
    blinks++;
  }, 300);
}

// Clean up when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
});

chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    attachedTabs.delete(source.tabId);
  }
});

// Initialize badge on startup
isEnabled().then(enabled => updateBadgeState(enabled));
