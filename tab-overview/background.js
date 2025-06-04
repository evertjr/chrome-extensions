/* Tab Overview – background service worker */

const THUMB_OPTS = { format: "jpeg", quality: 40 };
const MAX_THUMBNAILS = 200;
const PREV_TAB_KEY = "tabOverview_prevTab";

/**
 * Capture a thumbnail for the given tab and window.
 * @param {number} tabId - The tab ID to capture.
 * @param {number} windowId - The window ID containing the tab.
 */
async function capture(tabId, windowId) {
  if (tabId === chrome.tabs.TAB_ID_NONE) return;
  let tabInfo;
  try {
    tabInfo = await chrome.tabs.get(tabId);
  } catch (e) {
    return;
  }
  const { url } = tabInfo;
  if (
    !url ||
    /^(chrome|edge|chrome-untrusted|chrome-extension|about|moz-extension|view-source):/i.test(
      url
    )
  )
    return;
  try {
    let dataUrl = await chrome.tabs.captureVisibleTab(windowId, THUMB_OPTS);
    if (!dataUrl || dataUrl.length <= 2000) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      try {
        const retryUrl = await chrome.tabs.captureVisibleTab(
          windowId,
          THUMB_OPTS
        );
        if (retryUrl && retryUrl.length > 2000) {
          dataUrl = retryUrl;
        } else {
          return;
        }
      } catch {
        return;
      }
    }
    if (!dataUrl || dataUrl.length <= 2000) return;
    await storeThumb(tabId, dataUrl);
    await maintainThumbnailLimit();
  } catch {}
}

/**
 * Capture a thumbnail with exponential backoff on failure.
 * @param {number} tabId - The tab ID to capture.
 * @param {number} windowId - The window ID containing the tab.
 * @param {number} [attempt=0] - Current retry attempt.
 */
async function captureWithBackoff(tabId, windowId, attempt = 0) {
  if (tabId === chrome.tabs.TAB_ID_NONE) return;
  let tabInfo;
  try {
    tabInfo = await chrome.tabs.get(tabId);
  } catch {
    return;
  }
  const { url } = tabInfo;
  if (
    !url ||
    /^(chrome|edge|chrome-untrusted|chrome-extension|about|moz-extension|view-source):/i.test(
      url
    )
  )
    return;
  try {
    let dataUrl = await chrome.tabs.captureVisibleTab(windowId, THUMB_OPTS);
    if (!dataUrl || dataUrl.length <= 2000) {
      if (attempt < 3) {
        setTimeout(
          () => captureWithBackoff(tabId, windowId, attempt + 1),
          200 * Math.pow(2, attempt)
        );
      }
      return;
    }
    await storeThumb(tabId, dataUrl);
    await maintainThumbnailLimit();
  } catch {
    if (attempt < 3) {
      setTimeout(
        () => captureWithBackoff(tabId, windowId, attempt + 1),
        200 * Math.pow(2, attempt)
      );
    }
  }
}

/**
 * Store a thumbnail (or batch of thumbnails) with timestamp.
 * @param {number|Object} tabIdOrObj - Tab ID for single, or object for batch.
 * @param {string} [dataUrl] - Data URL for single thumbnail.
 */
async function storeThumb(tabIdOrObj, dataUrl) {
  if (typeof tabIdOrObj === "object" && dataUrl === undefined) {
    await chrome.storage.local.set(tabIdOrObj);
    return;
  }
  const key = "thumb_" + tabIdOrObj;
  const value = {
    data: dataUrl,
    timestamp: Date.now(),
  };
  await chrome.storage.local.set({ [key]: value });
}

/**
 * Ensure the number of stored thumbnails does not exceed the limit.
 */
async function maintainThumbnailLimit() {
  try {
    const storage = await chrome.storage.local.get(null);
    const thumbKeys = Object.keys(storage).filter((key) =>
      key.startsWith("thumb_")
    );
    if (thumbKeys.length <= MAX_THUMBNAILS) return;
    const sortedThumbs = thumbKeys
      .map((key) => ({ key, timestamp: storage[key]?.timestamp || 0 }))
      .sort((a, b) => a.timestamp - b.timestamp);
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

// Remove thumbnail when its tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove("thumb_" + tabId);
});

/**
 * Open (or focus) the Overview as a pinned tab. Captures the current tab before opening.
 */
async function openOrFocusOverview() {
  const [current] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (current) {
    await chrome.storage.local.set({
      [PREV_TAB_KEY]: { id: current.id, windowId: current.windowId },
    });
    try {
      await capture(current.id, current.windowId);
    } catch {}
  }
  const overviewURL = chrome.runtime.getURL("overview.html");
  const [existing] = await chrome.tabs.query({
    url: overviewURL,
    windowId: current?.windowId,
  });
  if (existing) {
    try {
      await chrome.windows.update(existing.windowId, { focused: true });
      await chrome.tabs.update(existing.id, { active: true });
      chrome.tabs.reload(existing.id);
    } catch (e) {
      console.warn("Could not focus/reload overview tab:", e.message);
    }
    return;
  }
  try {
    await chrome.tabs.create({
      url: overviewURL,
      pinned: true,
      active: true,
      index: current ? current.index + 1 : 0,
      windowId: current?.windowId,
    });
  } catch (e) {
    console.warn("Could not create overview tab:", e.message);
  }
}

/**
 * Switch back to the previous tab if possible, closing the overview tab.
 * @param {Object} overviewTab - The overview tab object.
 * @returns {Promise<boolean>} True if switched, false otherwise.
 */
async function switchBackToPreviousTab(overviewTab) {
  const prev = (await chrome.storage.local.get(PREV_TAB_KEY))[PREV_TAB_KEY];
  if (prev && prev.id !== overviewTab.id) {
    try {
      await chrome.tabs.update(prev.id, { active: true });
      await chrome.windows.update(prev.windowId, { focused: true });
      await chrome.tabs.remove(overviewTab.id);
      return true;
    } catch {}
  }
  return false;
}

// Handle browser action click
chrome.action.onClicked.addListener(async () => {
  const [current] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  const overviewURL = chrome.runtime.getURL("overview.html");
  const [overviewTab] = current
    ? await chrome.tabs.query({ url: overviewURL, windowId: current.windowId })
    : [];
  if (overviewTab) {
    const win = await chrome.windows.get(overviewTab.windowId);
    if (win.focused && overviewTab.active) {
      if (await switchBackToPreviousTab(overviewTab)) return;
    }
  }
  openOrFocusOverview();
});

// Handle keyboard shortcut command
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd === "open-overview") {
    const [current] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const overviewURL = chrome.runtime.getURL("overview.html");
    const [overviewTab] = current
      ? await chrome.tabs.query({
          url: overviewURL,
          windowId: current.windowId,
        })
      : [];
    if (overviewTab) {
      const win = await chrome.windows.get(overviewTab.windowId);
      if (win.focused && overviewTab.active) {
        if (await switchBackToPreviousTab(overviewTab)) return;
      }
    }
    openOrFocusOverview();
  }
});

// Listen for messages from overview.js (e.g., for Esc key)
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === "tabOverview:switchBack" && sender.tab) {
    switchBackToPreviousTab(sender.tab);
  }
});

// Auto-close overview tab in the current window when user activates another tab
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  const overviewURL = chrome.runtime.getURL("overview.html");
  const [overviewTab] = await chrome.tabs.query({ url: overviewURL, windowId });
  if (overviewTab && overviewTab.id !== tabId) {
    chrome.tabs.remove(overviewTab.id).catch(() => {});
  }
  // Hold the worker alive for 100ms, then capture
  return new Promise((resolve) => {
    setTimeout(async () => {
      await capture(tabId, windowId);
      resolve();
    }, 100);
  });
});

// Capture active tab on window focus change
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId: winId });
  if (tab) {
    return new Promise((resolve) => {
      setTimeout(async () => {
        await capture(tab.id, winId);
        resolve();
      }, 100);
    });
  }
});

// Capture on tab update (status complete)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    await new Promise((r) => setTimeout(r, 50));
    await captureWithBackoff(tabId, tab.windowId);
  }
});
