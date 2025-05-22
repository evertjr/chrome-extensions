/* Tab Discard Helper – background service worker */

const DEFAULT_IDLE_MIN = 15;
let idleMinutes = DEFAULT_IDLE_MIN;

let paused = false; // true = nothing will be auto-discarded
const tempWhitelist = new Set(); // Set<tabId>
let permanentWhitelist = [];

/**
 * Check if a tab is whitelisted (paused, temp, or permanent).
 * @param {string} url - Tab URL
 * @param {number} tabId - Tab ID
 * @returns {boolean}
 */
function isWhitelisted(url, tabId) {
  if (paused) return true;
  if (tempWhitelist.has(tabId)) return true;
  return permanentWhitelist.some((p) => url.includes(p));
}

/**
 * Discard a tab if eligible (not active, not whitelisted, idle long enough).
 * @param {chrome.tabs.Tab} tab
 */
function maybeDiscard(tab) {
  if (tab.active) return;
  if (!tab || tab.discarded || !tab.url || tab.url.startsWith("chrome")) return;
  if (isWhitelisted(tab.url, tab.id)) return;
  const idleMs = idleMinutes * 60_000;
  const inactiveFor = Date.now() - tab.lastAccessed;
  if (inactiveFor >= idleMs) {
    chrome.tabs.discard(tab.id).catch(() => {});
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
  const tabs = await chrome.tabs.query({});
  tabs.forEach(maybeDiscard);
});

// Remove temp whitelist entry when tab closes
chrome.tabs.onRemoved.addListener((tabId) => tempWhitelist.delete(tabId));

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
  const { paused: storedPause = false } = await chrome.storage.local.get({
    paused: false,
  });
  paused = storedPause;
}

// Sync settings on storage change
chrome.storage.onChanged.addListener((ch) => {
  if (ch.idleMinutes)
    idleMinutes = Number(ch.idleMinutes.newValue) || DEFAULT_IDLE_MIN;
  if (ch.whitelist) permanentWhitelist = ch.whitelist.newValue || [];
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
      reply({ tempWhitelisted: tempWhitelist.has(msg.tabId) });
      break;
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

// Initialize settings and start alarm
loadSettings().then(startAlarm);
