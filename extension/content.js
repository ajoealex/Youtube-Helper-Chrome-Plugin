// ============================================================
// YouTube Ad Helper - Content Script
// ============================================================

// --- Configuration ---
const AD_POLL_INTERVAL_MS = 2000;         // Poll for ad presence every 2 seconds
const SKIP_POLL_INTERVAL_MS = 500;        // Poll for skip button
const END_MARGIN_SECONDS = 0.1;           // Stay inside duration boundary

// --- State tracking ---
let wasAdPlaying = false;
let currentAdName = null;
let adReportedThisCycle = false;
let lastSkipAttempt = 0;
let wasAlreadyMuted = false;
let isEnabled = true;

// Load initial enabled state
chrome.runtime.sendMessage({ action: 'getEnabled' }, (response) => {
  if (!chrome.runtime.lastError && response) {
    isEnabled = response.enabled !== false;
    console.log("[YT Ad Helper] Enabled:", isEnabled);
  }
});

// Listen for enabled state changes
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'enabledChanged') {
    isEnabled = message.enabled;
    console.log("[YT Ad Helper] Enabled changed:", isEnabled);
    // If disabled while ad is playing, restore video state
    if (!isEnabled && wasAdPlaying) {
      const video = getVideo();
      restoreAudio(video);
      wasAdPlaying = false;
    }
  }
});

// ============================================================
// Ad Detection - Multiple selectors for reliability
// ============================================================

function getVideo() {
  return document.querySelector('video.html5-main-video') || document.querySelector('video');
}

function isAdPlaying() {
  // Primary detection - the ad info container (most reliable)
  if (document.querySelector('div.ytp-ad-player-overlay-layout__ad-info-container')) {
    return true;
  }

  // Check video player class for ad-showing
  const player = document.querySelector('.html5-video-player');
  if (player) {
    if (player.classList.contains('ad-showing')) return true;
    if (player.classList.contains('ad-interrupting')) return true;
  }

  // Fallback selectors
  const fallbackSelectors = [
    '.ytp-ad-player-overlay',
    '.ytp-ad-player-overlay-instream-info',
    '.ytp-ad-skip-button-container'
  ];

  for (const selector of fallbackSelectors) {
    if (document.querySelector(selector)) {
      return true;
    }
  }

  return false;
}

function getSkipButton() {
  // Try multiple selectors for skip button
  const selectors = [
    'button.ytp-skip-ad-button',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button',
    'button.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '[class*="skip-ad"]',
    '.videoAdUiSkipButton'
  ];

  for (const selector of selectors) {
    const btn = document.querySelector(selector);
    if (btn) return btn;
  }
  return null;
}

function getAdName() {
  const selectors = [
    '.ytp-visit-advertiser-link__text',
    '.ytp-ad-preview-text',
    '.ytp-ad-text',
    '.ytp-ad-button-text',
    '.ytp-ad-info-dialog-title'
  ];

  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el?.textContent?.trim()) {
      return el.textContent.trim();
    }
  }

  return 'Unknown Ad';
}

// ============================================================
// FEATURE 1: Hard-seek ads to the end
// ============================================================

function hardSeekToEnd(video) {
  if (!video || !isFinite(video.duration) || video.duration <= 0) return;

  const endTime = Math.max(0, video.duration - END_MARGIN_SECONDS);
  const currentTime = video.currentTime;
  const remaining = endTime - currentTime;

  // Skip if already near the end
  if (remaining <= 0.3) return;

  // More aggressive seeking - jump by 75% of remaining time
  const seekAmount = remaining * 0.75;
  const targetTime = Math.min(currentTime + seekAmount, endTime);

  console.log("[YT Ad Helper] Seeking ad:", currentTime.toFixed(2), "→", targetTime.toFixed(2), "(", remaining.toFixed(1) + "s left)");

  try {
    video.currentTime = targetTime;
    // Also speed up playback as backup
    if (video.playbackRate < 16) {
      video.playbackRate = 16;
    }
  } catch (e) {
    console.warn("[YT Ad Helper] Seek failed:", e);
  }
}

function muteAdAudio(video) {
  if (!video) return;
  // Remember if video was already muted before ad
  wasAlreadyMuted = video.muted;
  if (!video.muted) {
    video.muted = true;
    console.log("[YT Ad Helper] Ad muted");
  }
}

function restoreAudio(video) {
  if (!video) return;
  video.playbackRate = 1;
  // Only unmute if it wasn't already muted before the ad
  if (!wasAlreadyMuted && video.muted) {
    video.muted = false;
    console.log("[YT Ad Helper] Audio restored, playback normalized");
  } else {
    console.log("[YT Ad Helper] Playback normalized (kept muted)");
  }
}

function reportAdBlocked(adName, method) {
  if (adReportedThisCycle) return;
  adReportedThisCycle = true;

  console.log("[YT Ad Helper] Blocked:", adName, "via", method);
  chrome.runtime.sendMessage({
    action: "adBlocked",
    adName: adName,
    method: method,
    timestamp: Date.now()
  });
}

function monitorAds() {
  if (!isEnabled) return;

  const video = getVideo();
  if (!video) return;

  const adPlaying = isAdPlaying();

  // Ad just started
  if (adPlaying && !wasAdPlaying) {
    console.log("[YT Ad Helper] === AD DETECTED ===");
    currentAdName = getAdName();
    adReportedThisCycle = false;
    chrome.runtime.sendMessage({ action: "adDetected" });
    wasAdPlaying = true;
    muteAdAudio(video);
  }

  // Ad just ended
  if (!adPlaying && wasAdPlaying) {
    console.log("[YT Ad Helper] === AD CLEARED ===");
    if (!adReportedThisCycle && currentAdName) {
      reportAdBlocked(currentAdName, "seek");
    }
    chrome.runtime.sendMessage({ action: "adCleared" });
    restoreAudio(video);
    wasAdPlaying = false;
    currentAdName = null;
    adReportedThisCycle = false;
  }

  // Aggressively handle ad while playing
  if (adPlaying) {
    hardSeekToEnd(video);
  }
}

// ============================================================
// FEATURE 2: Click skip button
// ============================================================

function findAndSkip() {
  if (!isEnabled) return;
  if (!isAdPlaying()) return;

  // Rate limit skip attempts
  const now = Date.now();
  if (now - lastSkipAttempt < 500) return;

  const skipButton = getSkipButton();
  if (!skipButton) return;

  // Check if button is visible and has dimensions
  const rect = skipButton.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  lastSkipAttempt = now;

  // Calculate center coordinates for CDP click
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);

  const adName = currentAdName || getAdName();
  console.log("[YT Ad Helper] Skip button found at", x, y);

  // Send to background for trusted CDP click (only method that works)
  chrome.runtime.sendMessage(
    { action: "skipAd", coordinates: { x, y }, adName: adName },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[YT Ad Helper] Message error:", chrome.runtime.lastError.message);
        return;
      }
      if (response?.success) {
        console.log("[YT Ad Helper] Skip successful!");
        reportAdBlocked(adName, "skip");
      } else {
        console.warn("[YT Ad Helper] CDP skip failed:", response?.error);
      }
    }
  );
}

// ============================================================
// Start polling
// ============================================================

setInterval(monitorAds, AD_POLL_INTERVAL_MS);
setInterval(findAndSkip, SKIP_POLL_INTERVAL_MS);

console.log("[YT Ad Helper] Content script loaded");
console.log("[YT Ad Helper] - Ad polling:", AD_POLL_INTERVAL_MS + "ms");
console.log("[YT Ad Helper] - Skip polling:", SKIP_POLL_INTERVAL_MS + "ms");
