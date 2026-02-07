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

// Listen for messages from the content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!sender.tab) return;

  const tabId = sender.tab.id;

  // Handle ad state changes
  if (message.action === "adDetected") {
    setIconActive(tabId, true);
    sendResponse({ success: true });
    return;
  }

  if (message.action === "adCleared") {
    setIconActive(tabId, false);
    sendResponse({ success: true });
    return;
  }

  // Handle skip ad request
  if (message.action === "skipAd") {
    const { x, y } = message.coordinates;
    dispatchTrustedClick(tabId, x, y)
      .then(() => {
        blinkBadge(tabId);
        sendResponse({ success: true });
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // keep the message channel open for async response
  }
});

// Set the icon to active (color) or inactive (grayscale)
function setIconActive(tabId, active) {
  chrome.action.setIcon({
    tabId,
    path: active ? ICON_ACTIVE : ICON_INACTIVE,
  });
}

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

// Blink the extension badge when an ad is skipped
function blinkBadge(tabId) {
  let visible = true;
  let blinks = 0;
  const maxBlinks = 6; // 3 on + 3 off cycles

  chrome.action.setBadgeBackgroundColor({ color: "#FF0000", tabId });

  const interval = setInterval(() => {
    if (blinks >= maxBlinks) {
      clearInterval(interval);
      chrome.action.setBadgeText({ text: "", tabId });
      return;
    }
    chrome.action.setBadgeText({ text: visible ? "SKIP" : "", tabId });
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
