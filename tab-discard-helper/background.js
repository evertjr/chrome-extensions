/* Tab Discard Helper – background service worker */

const DEFAULT_IDLE_MIN = 15;
let idleMinutes = DEFAULT_IDLE_MIN;

let paused = false; // true = nothing will be auto-discarded
let tempWhitelist = new Set(); // Set<tabId>
let permanentWhitelist = [];
let isProcessing = false; // Prevent concurrent alarm processing
let lastCleanupTime = 0; // Track when we last cleaned up the temp whitelist

/** Helper: make a tab (non-)discardable at the browser level */
async function setAutoDiscardable(tabId, canDiscard) {
  try {
    await chrome.tabs.update(tabId, { autoDiscardable: canDiscard });
  } catch (e) {
    // Tab may have gone, ignore.
  }
}

/** Restore autoDiscardable flags for all protected tabs */
async function restoreProtectionFlags() {
  // Restore temporary whitelist flags
  for (const id of tempWhitelist) {
    setAutoDiscardable(id, false);
  }

  // Restore permanent whitelist flags
  chrome.tabs.query({}).then((tabs) => {
    for (const t of tabs) {
      if (permanentWhitelist.some((p) => t.url.includes(p))) {
        setAutoDiscardable(t.id, false);
      }
    }
  });
}

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
  // If the tab is explicitly marked non-discardable, honour it.
  if (tab.autoDiscardable === false) return;
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
 * This function is more conservative to avoid false positives.
 */
async function cleanupTempWhitelist() {
  if (tempWhitelist.size === 0) return;

  try {
    const originalSize = tempWhitelist.size;
    const toRemove = [];

    // Only check each tab ID individually using chrome.tabs.get
    // This is more reliable than chrome.tabs.query which might miss discarded tabs
    for (const tabId of tempWhitelist) {
      try {
        await chrome.tabs.get(tabId);
        // If we get here, the tab exists, so keep it
      } catch (tabError) {
        // Tab doesn't exist, safe to remove
        toRemove.push(tabId);
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
    // Silently handle errors to avoid noise in logs
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

    // Clean up stale tab IDs from temp whitelist less frequently (every 5 minutes)
    // to reduce the chance of false positives
    const now = Date.now();
    if (now - lastCleanupTime > 5 * 60 * 1000) {
      await cleanupTempWhitelist();
      lastCleanupTime = now;
    }
  } finally {
    isProcessing = false;
  }
});

// Remove temp whitelist entry when tab closes
chrome.tabs.onRemoved.addListener(async (tabId) => {
  tempWhitelist.delete(tabId);
  await saveTempWhitelist();
  setAutoDiscardable(tabId, true); // might be stale but harmless
});

// Restore protection when tabs are updated (e.g., when restored from discard)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only act when the tab is loading or complete (restored from discard)
  if (changeInfo.status === "loading" || changeInfo.status === "complete") {
    // Restore temporary protection if this tab is in the temp whitelist
    if (tempWhitelist.has(tabId)) {
      setAutoDiscardable(tabId, false);
    }
    // Restore permanent protection if this tab matches the permanent whitelist
    if (tab.url && permanentWhitelist.some((p) => tab.url.includes(p))) {
      setAutoDiscardable(tabId, false);
    }
  }
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
      // First verify the tab exists
      chrome.tabs
        .get(msg.tabId)
        .then(() => {
          if (tempWhitelist.has(msg.tabId)) {
            tempWhitelist.delete(msg.tabId);
            // Allow future discards
            setAutoDiscardable(msg.tabId, true);
          } else {
            tempWhitelist.add(msg.tabId);
            // Block all discards (ours or Chrome's)
            setAutoDiscardable(msg.tabId, false);
          }
          // Use async/await to ensure storage is saved before replying
          saveTempWhitelist().then(() => {
            reply({ tempWhitelisted: tempWhitelist.has(msg.tabId) });
          });
        })
        .catch(() => {
          // Tab doesn't exist, remove from temp whitelist if present and report as not protected
          tempWhitelist.delete(msg.tabId);
          saveTempWhitelist();
          reply({ tempWhitelisted: false });
        });
      return true; // keep port open for async reply
    case "getStatus":
      // Validate that the tab still exists before reporting its status
      chrome.tabs
        .get(msg.tabId)
        .then(() => {
          reply({
            paused,
            tempWhitelisted: tempWhitelist.has(msg.tabId),
            permanentlyWhitelisted: permanentWhitelist.some((p) =>
              msg.url.includes(p)
            ),
          });
        })
        .catch(() => {
          // Tab doesn't exist, remove it from temp whitelist and report as not protected
          tempWhitelist.delete(msg.tabId);
          saveTempWhitelist();
          reply({
            paused,
            tempWhitelisted: false,
            permanentlyWhitelisted: permanentWhitelist.some((p) =>
              msg.url.includes(p)
            ),
          });
        });
      return true; // keep port open for async reply
    default:
      break;
  }
  return true; // keep port open for async replies
});

// Service worker startup event
chrome.runtime.onStartup.addListener(async () => {
  await loadSettings();
  await cleanupTempWhitelist();
  await restoreProtectionFlags();
  startAlarm();
});

// Extension installation/update event
chrome.runtime.onInstalled.addListener(async () => {
  await loadSettings();
  await cleanupTempWhitelist();
  await restoreProtectionFlags();
  startAlarm();
});

// Initialize settings and start alarm
loadSettings().then(async () => {
  await cleanupTempWhitelist();
  await restoreProtectionFlags();
  startAlarm();
});
