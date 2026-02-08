# YouTube Ad Skipper

A Chrome extension that automatically skips YouTube ads when the skip button becomes available.

## Features

- **Auto-skip ads**: Automatically clicks the "Skip Ad" button when it appears
- **Ad fast-forward**: Seeks ads to the end while waiting for the skip button
- **Visual feedback**: Icon changes color when an ad is detected, badge blinks when an ad is skipped

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the `extension` folder from this repository

## How It Works

The extension uses two main mechanisms:

1. **Content Script** (`content.js`): Monitors YouTube pages for ads and detects when the skip button appears
2. **Background Service Worker** (`background.js`): Uses Chrome's debugger API to dispatch trusted click events that bypass YouTube's click detection

## Permissions

- `debugger`: Required to dispatch trusted mouse events
- `scripting`: Required for content script injection
- `activeTab`: Required for interacting with the current tab
- `host_permissions` for `youtube.com`: Required to run on YouTube pages

## Project Structure

```
Youtube-Helper-Chrome-Plugin/
  manifest.json    # Extension manifest
  background.js    # Service worker for handling debugger clicks
  content.js       # Content script for ad detection
  icons/           # Extension icons
```

## License

MIT
