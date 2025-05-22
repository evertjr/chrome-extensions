/* Tab Overview – background service worker */

const THUMB_OPTS = { format: "jpeg", quality: 70 }; // tweak as you like
const MAX_THUMBNAILS = 50; // Limit to prevent storage issues

let userHasInteracted = false; // Set to true after popup or shortcut is used

/* --- keep a fresh thumbnail for the active tab ------------------------ */
async function capture(tabId, windowId) {
  if (!userHasInteracted) return; // only after popup used
  if (tabId === chrome.tabs.TAB_ID_NONE) return;

  /* 1 ── check the tab's URL; bail out on schemes we can't capture */
  const { url } = await chrome.tabs.get(tabId);
  if (
    !url ||
    /^(chrome|edge|chrome-untrusted|chrome-extension|about|moz-extension|view-source):/i.test(
      url
    )
  ) {
    return; // skip forbidden pages
  }

  try {
    /* 2 ── safe to capture */
    const dataUrl = await chrome.tabs.captureVisibleTab(windowId, THUMB_OPTS);

    await storeThumb(tabId, dataUrl); // save + prune
    await maintainThumbnailLimit();
  } catch (err) {
    /* 3 ── ignore the expected permission error; log anything else */
    if (!/permission/i.test(err?.message)) {
      console.error("Error capturing tab:", err);
    }
  }
}

// Store a thumbnail with timestamp
async function storeThumb(tabId, dataUrl) {
  const key = "thumb_" + tabId;
  const value = {
    data: dataUrl,
    timestamp: Date.now(),
  };

  // Store as object to avoid any potential string size limits
  await chrome.storage.local.set({ [key]: value });
}

// Ensure we don't exceed storage limits
async function maintainThumbnailLimit() {
  try {
    // Get all thumbnails
    const storage = await chrome.storage.local.get(null);
    const thumbKeys = Object.keys(storage).filter((key) =>
      key.startsWith("thumb_")
    );

    // If we're under the limit, no need to clean up
    if (thumbKeys.length <= MAX_THUMBNAILS) return;

    // Sort thumbnails by timestamp (oldest first)
    const sortedThumbs = thumbKeys
      .map((key) => ({
        key,
        timestamp: storage[key]?.timestamp || 0,
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // Remove oldest thumbnails to get under the limit
    const toRemove = sortedThumbs.slice(
      0,
      sortedThumbs.length - MAX_THUMBNAILS
    );
    if (toRemove.length > 0) {
      await chrome.storage.local.remove(toRemove.map((item) => item.key));
    }
  } catch (err) {
    console.error("Error maintaining thumbnails:", err);
  }
}

/* --- Event listeners for tab activity -------------------------------- */
// When a tab is activated, capture it immediately
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  capture(tabId, windowId);
});

// When window focus changes, capture the active tab
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId: winId });
  if (tab) capture(tab.id, winId);
});

// Also update thumbnail when a tab is updated (URL changes, page loads, etc.)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only capture when the tab has completed loading and is the active tab
  if (changeInfo.status === "complete" && tab.active) {
    capture(tabId, tab.windowId);
  }
});

/* --- remove thumbnail when its tab closes ---------------------------- */
chrome.tabs.onRemoved.addListener((tabId /*, removeInfo */) => {
  chrome.storage.local.remove("thumb_" + tabId);
});

/* --- keyboard shortcut opens the same popup -------------------------- */
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "open-overview") chrome.action.openPopup();
});
