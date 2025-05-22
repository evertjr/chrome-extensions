/* Tab Discard Helper – background service worker */

const DEFAULT_IDLE_MIN = 15;
let idleMinutes = DEFAULT_IDLE_MIN;

let paused = false; // true = nothing will be auto-discarded
let tempWhitelist = new Set(); // Set<tabId>
let permanentWhitelist = [];
let isProcessing = false; // Prevent concurrent alarm processing

/**
 * Check if a tab is whitelisted (paused, temp, or permanent).
 * @param {string} url - Tab URL
 * @param {number} tabId - Tab ID
 * @returns {boolean}
 */
function isWhitelisted(url, tabId) {
  if (paused) return true;
  if (tempWhitelist.has(tabId)) return true;
  if (!url) return false;
  return permanentWhitelist.some((p) => url.includes(p));
}

/**
 * Discard a tab if eligible (not active, not whitelisted, idle long enough).
 * @param {chrome.tabs.Tab} tab
 */
function maybeDiscard(tab) {
  if (tab.active) return;
  if (!tab || tab.discarded || !tab.url || tab.url.startsWith("chrome")) return;

  // Double-check whitelist status before discarding
  const whitelisted = isWhitelisted(tab.url, tab.id);
  if (whitelisted) return;

  const idleMs = idleMinutes * 60_000;
  const inactiveFor = Date.now() - tab.lastAccessed;
  if (inactiveFor >= idleMs) {
    // Final check before discarding - ensure tab is still not whitelisted
    if (!isWhitelisted(tab.url, tab.id)) {
      chrome.tabs.discard(tab.id).catch(() => {});
    }
  }
}

/**
 * Save temporary whitelist to storage.
 */
async function saveTempWhitelist() {
  await chrome.storage.local.set({ tempWhitelist: Array.from(tempWhitelist) });
}

/**
 * Clean up temporary whitelist by removing tabs that no longer exist.
 */
async function cleanupTempWhitelist() {
  if (tempWhitelist.size === 0) return;

  try {
    // Get all tabs from all windows to ensure we don't miss any
    const tabs = await chrome.tabs.query({});
    const existingTabIds = new Set(tabs.map((tab) => tab.id));
    const originalSize = tempWhitelist.size;
    const toRemove = [];

    // Check each tab ID individually to be extra sure
    for (const tabId of tempWhitelist) {
      if (!existingTabIds.has(tabId)) {
        // Double-check by trying to get the tab directly
        try {
          await chrome.tabs.get(tabId);
          // If we get here, the tab exists, so don't remove it
        } catch (tabError) {
          // Tab doesn't exist, safe to remove
          toRemove.push(tabId);
        }
      }
    }

    // Remove invalid tab IDs
    for (const tabId of toRemove) {
      tempWhitelist.delete(tabId);
    }

    // Save if we removed any invalid entries
    if (tempWhitelist.size !== originalSize) {
      await saveTempWhitelist();
    }
  } catch (error) {
    console.error("Error cleaning up temp whitelist:", error);
  }
}

/**
 * Start or restart the auto-discard alarm.
 */
function startAlarm() {
  chrome.alarms.clear("autoDiscard");
  chrome.alarms.create("autoDiscard", { periodInMinutes: 1 });
}

// Alarm handler: check all tabs for discard eligibility
chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "autoDiscard") return;
  if (isProcessing) return; // Prevent concurrent processing

  isProcessing = true;
  try {
    const tabs = await chrome.tabs.query({});
    tabs.forEach(maybeDiscard);

    // Clean up stale tab IDs from temp whitelist AFTER discard logic
    await cleanupTempWhitelist();
  } finally {
    isProcessing = false;
  }
});

// Remove temp whitelist entry when tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
  tempWhitelist.delete(tabId);
  await saveTempWhitelist();
});

/**
 * Load settings (idle time, whitelist, pause state) from storage.
 */
async function loadSettings() {
  const { idleMinutes: sIdle = DEFAULT_IDLE_MIN, whitelist = [] } =
    await chrome.storage.sync.get({
      idleMinutes: DEFAULT_IDLE_MIN,
      whitelist: [],
    });
  idleMinutes = Number(sIdle) || DEFAULT_IDLE_MIN;
  permanentWhitelist = Array.isArray(whitelist) ? whitelist : [];
  const {
    paused: storedPause = false,
    tempWhitelist: storedTempWhitelist = [],
  } = await chrome.storage.local.get({
    paused: false,
    tempWhitelist: [],
  });
  paused = storedPause;
  tempWhitelist = new Set(storedTempWhitelist);
}

// Sync settings on storage change
chrome.storage.onChanged.addListener((ch, areaName) => {
  if (ch.idleMinutes)
    idleMinutes = Number(ch.idleMinutes.newValue) || DEFAULT_IDLE_MIN;
  if (ch.whitelist) permanentWhitelist = ch.whitelist.newValue || [];
  if (areaName === "local" && ch.tempWhitelist) {
    tempWhitelist = new Set(ch.tempWhitelist.newValue || []);
  }
});

/**
 * Handle messages from popup (toggle pause, whitelist, status, etc).
 */
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  switch (msg.cmd) {
    case "togglePause":
      paused = !paused;
      chrome.storage.local.set({ paused });
      reply({ paused });
      break;
    case "toggleTempWhitelist":
      if (tempWhitelist.has(msg.tabId)) {
        tempWhitelist.delete(msg.tabId);
      } else {
        tempWhitelist.add(msg.tabId);
      }
      // Use async/await to ensure storage is saved before replying
      saveTempWhitelist().then(() => {
        reply({ tempWhitelisted: tempWhitelist.has(msg.tabId) });
      });
      return true; // keep port open for async reply
    case "getStatus":
      reply({
        paused,
        tempWhitelisted: tempWhitelist.has(msg.tabId),
        permanentlyWhitelisted: permanentWhitelist.some((p) =>
          msg.url.includes(p)
        ),
      });
      break;
    default:
      break;
  }
  return true; // keep port open for async replies
});

// Service worker startup event
chrome.runtime.onStartup.addListener(async () => {
  await loadSettings();
  await cleanupTempWhitelist();
  startAlarm();
});

// Extension installation/update event
chrome.runtime.onInstalled.addListener(async () => {
  await loadSettings();
  await cleanupTempWhitelist();
  startAlarm();
});

// Initialize settings and start alarm
loadSettings().then(async () => {
  await cleanupTempWhitelist();
  startAlarm();
});
