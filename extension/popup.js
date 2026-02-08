document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadEnabledState();

  document.getElementById('clearBtn').addEventListener('click', clearStats);
  document.getElementById('enableToggle').addEventListener('change', toggleEnabled);
});

function loadEnabledState() {
  chrome.runtime.sendMessage({ action: 'getEnabled' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading enabled state:', chrome.runtime.lastError);
      return;
    }
    const enabled = response?.enabled !== false; // Default to true
    document.getElementById('enableToggle').checked = enabled;
    document.body.classList.toggle('disabled', !enabled);
  });
}

function toggleEnabled() {
  const enabled = document.getElementById('enableToggle').checked;
  document.body.classList.toggle('disabled', !enabled);

  chrome.runtime.sendMessage({ action: 'setEnabled', enabled: enabled }, (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error setting enabled state:', chrome.runtime.lastError);
    }
  });
}

function loadStats() {
  chrome.runtime.sendMessage({ action: 'getStats' }, (stats) => {
    if (chrome.runtime.lastError) {
      console.error('Error loading stats:', chrome.runtime.lastError);
      return;
    }

    document.getElementById('totalAds').textContent = formatNumber(stats.totalAdsBlocked);
    document.getElementById('todayAds').textContent = formatNumber(stats.todayAdsBlocked);

    renderAdList(stats.blockedAds);
  });
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function renderAdList(ads) {
  const listEl = document.getElementById('adList');

  if (!ads || ads.length === 0) {
    listEl.innerHTML = '<div class="empty-state">No ads blocked yet</div>';
    return;
  }

  listEl.innerHTML = ads.map(ad => `
    <div class="ad-item">
      <div class="ad-icon ${ad.method}">
        ${ad.method === 'skip' ? '⏭' : '⏩'}
      </div>
      <div class="ad-info">
        <div class="ad-name" title="${escapeHtml(ad.name)}">${escapeHtml(ad.name)}</div>
        <div class="ad-time">${formatTime(ad.timestamp)}</div>
      </div>
    </div>
  `).join('');
}

function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) {
    return 'Just now';
  }
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000);
    return `${mins}m ago`;
  }
  if (diff < 86400000) {
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  }

  const date = new Date(timestamp);
  return date.toLocaleDateString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function clearStats() {
  if (confirm('Clear all statistics?')) {
    chrome.runtime.sendMessage({ action: 'clearStats' }, () => {
      loadStats();
    });
  }
}
