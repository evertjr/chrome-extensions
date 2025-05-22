/* Tab Discard Helper – background service worker (v1.2) */

const DEFAULT_IDLE_MIN = 15;
let idleMinutes = DEFAULT_IDLE_MIN;

/* ----- runtime state ---------------------------------------------------- */
let paused = false; // true = nothing will be auto-discarded
const tempWhitelist = new Set(); // Set<tabId>

/* ----- helper ----------------------------------------------------------- */
function isWhitelisted(url, tabId) {
  if (paused) return true;
  if (tempWhitelist.has(tabId)) return true;
  return permanentWhitelist.some((p) => url.includes(p));
}

let permanentWhitelist = []; // loaded from storage

/* ----- auto-discard loop (alarm) --------------------------------------- */
function maybeDiscard(tab) {
  /* NEW: never discard the tab that is currently visible (active) */
  if (tab.active) return;

  if (!tab || tab.discarded || !tab.url || tab.url.startsWith("chrome")) return;
  if (isWhitelisted(tab.url, tab.id)) return;

  const idleMs = idleMinutes * 60_000;
  const inactiveFor = Date.now() - tab.lastAccessed;

  if (inactiveFor >= idleMs) {
    chrome.tabs.discard(tab.id).catch(() => {});
  }
}

function startAlarm() {
  chrome.alarms.clear("autoDiscard");
  chrome.alarms.create("autoDiscard", { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== "autoDiscard") return;
  const tabs = await chrome.tabs.query({});
  tabs.forEach(maybeDiscard);
});

/* ----- temp whitelist → clean-up when tab closes ----------------------- */
chrome.tabs.onRemoved.addListener((tabId) => tempWhitelist.delete(tabId));

/* ----- storage sync (permanent list + idle minutes) -------------------- */
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

chrome.storage.onChanged.addListener((ch) => {
  if (ch.idleMinutes)
    idleMinutes = Number(ch.idleMinutes.newValue) || DEFAULT_IDLE_MIN;
  if (ch.whitelist) permanentWhitelist = ch.whitelist.newValue || [];
});

/* ----- messaging API for popup ---------------------------------------- */
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
  return true; // keep port open for async replies (best practice)
});

/* ----- init ------------------------------------------------------------ */
loadSettings().then(startAlarm);
