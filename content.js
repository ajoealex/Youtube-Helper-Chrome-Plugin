// ============================================================
// YouTube Ad Helper - Content Script
// ============================================================

// --- Configuration ---
const SKIP_POLL_INTERVAL_MS = 3000;       // Poll for skip button
const HARD_SEEK_INTERVAL_MS = 500;        // Poll for ad hard-seek
const END_MARGIN_SECONDS = 0.25;          // Stay inside duration boundary

// --- State tracking ---
let wasAdPlaying = false;

// ============================================================
// FEATURE 1: Hard-seek ads to the end until Skip appears
// ============================================================

function getVideo() {
  return document.querySelector('video');
}

function isAdPlaying() {
  return Boolean(
    document.querySelector('.ytp-visit-advertiser-link__text') ||
    document.querySelector('.ytp-visit-advertiser-link.ytp-ad-component--clickable')
  );
}

function isSkipAvailable() {
  return Boolean(document.querySelector('.ytp-skip-ad-button'));
}

function hardSeekToEnd(video) {
  if (!video || !isFinite(video.duration)) return;

  const targetTime = Math.max(0, video.duration - END_MARGIN_SECONDS);

  if (video.currentTime < targetTime) {
    console.log("[YT Ad Helper] Hard-seeking ad from", video.currentTime.toFixed(2), "to", targetTime.toFixed(2));
    video.currentTime = targetTime;
  }
}

function monitorAds() {
  const video = getVideo();
  if (!video) return;

  const adPlaying = isAdPlaying();

  // Notify background of ad state changes
  if (adPlaying && !wasAdPlaying) {
    console.log("[YT Ad Helper] Ad detected - activating icon");
    chrome.runtime.sendMessage({ action: "adDetected" });
    wasAdPlaying = true;
  } else if (!adPlaying && wasAdPlaying) {
    console.log("[YT Ad Helper] Ad cleared - deactivating icon");
    chrome.runtime.sendMessage({ action: "adCleared" });
    wasAdPlaying = false;
  }

  // Hard-seek if ad is playing but skip not available yet
  if (adPlaying && !isSkipAvailable()) {
    hardSeekToEnd(video);
  }
}

// ============================================================
// FEATURE 2: Click skip button via trusted CDP click
// ============================================================

function findAndSkip() {
  // Look for the skip button by class name
  const skipButton = document.querySelector("button.ytp-skip-ad-button");
  if (!skipButton) return;

  // Verify it contains the "Skip" text
  const textEl = skipButton.querySelector(".ytp-skip-ad-button__text");
  if (!textEl || !textEl.textContent.trim().toLowerCase().includes("skip")) return;

  // Make sure the button is visible and has dimensions
  const rect = skipButton.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  // Calculate center coordinates of the button
  const x = Math.round(rect.left + rect.width / 2);
  const y = Math.round(rect.top + rect.height / 2);

  console.log("[YT Ad Helper] Skip button found, sending trusted click at", x, y);

  // Send coordinates to background script for CDP click
  chrome.runtime.sendMessage(
    { action: "skipAd", coordinates: { x, y } },
    (response) => {
      if (chrome.runtime.lastError) {
        console.warn("[YT Ad Helper] Message error:", chrome.runtime.lastError.message);
        return;
      }
      if (response?.success) {
        console.log("[YT Ad Helper] Ad skipped successfully");
      } else {
        console.warn("[YT Ad Helper] Skip failed:", response?.error);
      }
    }
  );
}

// ============================================================
// Start polling
// ============================================================

setInterval(monitorAds, HARD_SEEK_INTERVAL_MS);
setInterval(findAndSkip, SKIP_POLL_INTERVAL_MS);

console.log("[YT Ad Helper] Content script loaded");
console.log("[YT Ad Helper] - Hard-seek polling every", HARD_SEEK_INTERVAL_MS, "ms");
console.log("[YT Ad Helper] - Skip button polling every", SKIP_POLL_INTERVAL_MS, "ms");
