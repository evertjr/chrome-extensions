/* Tab Overview – background service worker */

const THUMB_OPTS = { format: "jpeg", quality: 70 }; // tweak as you like
const MAX_THUMBNAILS = 50; // Limit to prevent storage issues

let userHasInteracted = false; // Set to true after popup or shortcut is used

/* --- keep a fresh thumbnail for the active tab ------------------------ */
async function capture(tabId, windowId) {
  if (!userHasInteracted) {
    // console.log(`Capture for tab ${tabId} skipped: user has not interacted yet.`);
    return;
  }
  if (tabId === chrome.tabs.TAB_ID_NONE) {
    // console.log(`Capture for tab ${tabId} skipped: TAB_ID_NONE.`);
    return;
  }

  let tabInfo;
  try {
    tabInfo = await chrome.tabs.get(tabId);
  } catch (e) {
    // console.warn(`Capture for tab ${tabId} failed: could not get tab info (possibly closed). Error: ${e.message}`);
    return; // Tab may have been closed
  }

  const { url } = tabInfo;
  if (
    !url ||
    /^(chrome|edge|chrome-untrusted|chrome-extension|about|moz-extension|view-source):/i.test(
      url
    )
  ) {
    // console.log(`Capture for tab ${tabId} (URL: ${url}) skipped: forbidden page.`);
    // Optional: remove existing thumbnail if page becomes forbidden
    // await chrome.storage.local.remove("thumb_" + tabId);
    return;
  }

  // console.log(`Attempting capture for tab ${tabId} (URL: ${url}, Window: ${windowId})`);

  try {
    let dataUrl = await chrome.tabs.captureVisibleTab(windowId, THUMB_OPTS);
    // console.log(`Initial capture for tab ${tabId}: dataUrl length ${dataUrl ? dataUrl.length : 'undefined'}`);

    if (!dataUrl || dataUrl.length <= 2000) {
      // Screenshot is too small or capture failed to return data
      // console.warn(`Tab ${tabId} (URL: ${url}): initial screenshot small (length ${dataUrl ? dataUrl.length : 'undefined'}). Scheduling retry.`);

      await new Promise((resolve) => setTimeout(resolve, 700)); // Wait 700ms

      try {
        // console.log(`Tab ${tabId}: attempting retry capture.`);
        const retryUrl = await chrome.tabs.captureVisibleTab(
          windowId,
          THUMB_OPTS
        );
        // console.log(`Retry capture for tab ${tabId}: retryUrl length ${retryUrl ? retryUrl.length : 'undefined'}`);

        if (retryUrl && retryUrl.length > 2000) {
          dataUrl = retryUrl; // Retry was successful and larger
          // console.log(`Tab ${tabId}: retry successful, using new dataUrl (length ${dataUrl.length}).`);
        } else {
          // console.warn(`Tab ${tabId} (URL: ${url}): retry screenshot also small (length ${retryUrl ? retryUrl.length : 'undefined'}) or failed. Not storing thumbnail.`);
          return; // Exit without storing if retry is also bad or failed
        }
      } catch (retryErr) {
        // console.warn(`Tab ${tabId} (URL: ${url}): capture retry failed: ${retryErr.message}. Not storing original small image.`);
        // if (!/permission/i.test(retryErr?.message)) {
        //   console.error(`Non-permission error during capture retry for tab ${tabId}:`, retryErr);
        // }
        return; // Exit without storing if retry capture fails
      }
    }

    // If we reach here, dataUrl should be from a successful initial capture or a successful retry.
    if (!dataUrl || dataUrl.length <= 2000) {
      // console.warn(`Tab ${tabId} (URL: ${url}): final dataUrl still too small or undefined (length ${dataUrl ? dataUrl.length : 'N/A'}). Not storing.`);
      return;
    }

    // console.log(`Tab ${tabId} (URL: ${url}): storing thumbnail (length ${dataUrl.length}).`);
    await storeThumb(tabId, dataUrl);
    await maintainThumbnailLimit();
  } catch (initialErr) {
    // Error from the *initial* chrome.tabs.captureVisibleTab call
    // console.warn(`Initial capture for tab ${tabId} (URL: ${url}) failed: ${initialErr.message}.`);
    // if (!/permission/i.test(initialErr?.message)) {
    //   console.error(`Non-permission error during initial capture for tab ${tabId}:`, initialErr);
    // }
    // If initial capture fails, don't store anything.
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
// The listeners below are intentionally removed as they are redundant
// with the ones using scheduleCapture further down.

// // When a tab is activated, capture it immediately
// chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
//   capture(tabId, windowId);
// });
//
// // When window focus changes, capture the active tab
// chrome.windows.onFocusChanged.addListener(async (winId) => {
//   if (winId === chrome.windows.WINDOW_ID_NONE) return;
//   const [tab] = await chrome.tabs.query({ active: true, windowId: winId });
//   if (tab) capture(tab.id, winId);
// });
//
// // Also update thumbnail when a tab is updated (URL changes, page loads, etc.)
// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//   // Only capture when the tab has completed loading and is the active tab
//   if (changeInfo.status === "complete" && tab.active) {
//     capture(tabId, tab.windowId);
//   }
// });

/* --- remove thumbnail when its tab closes ---------------------------- */
chrome.tabs.onRemoved.addListener((tabId /*, removeInfo */) => {
  chrome.storage.local.remove("thumb_" + tabId);
});

/* ---------------------------------------------------
   Open (or focus) the Overview as a pinned tab
   – wait 500 ms, capture, then open
--------------------------------------------------- */
async function openOrFocusOverview() {
  userHasInteracted = true;

  // 1️⃣ Get the tab that's visible right now
  const [current] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (current) {
    // 3️⃣ Take one shot at capturing it
    try {
      await capture(current.id, current.windowId);
    } catch (e) {
      /* ignore any errors */
    }
  }

  const overviewURL = chrome.runtime.getURL("overview.html");
  // 4️⃣ If it's already open, focus & reload
  const [existing] = await chrome.tabs.query({ url: overviewURL });
  if (existing) {
    await chrome.windows.update(existing.windowId, { focused: true });
    await chrome.tabs.update(existing.id, { active: true });
    chrome.tabs.reload(existing.id);
    return;
  }
  // 5️⃣ Otherwise create it
  await chrome.tabs.create({
    url: overviewURL,
    pinned: true,
    active: true,
    index: current ? current.index + 1 : 0,
  });
}

// --- keyboard shortcut or toolbar icon -------------------------------
chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "open-overview") openOrFocusOverview();
});

chrome.action.onClicked.addListener(() => openOrFocusOverview());

// helper: schedule capture with a slight delay -----------------------
function scheduleCapture(tabId, windowId, delay = 250) {
  setTimeout(() => capture(tabId, windowId), delay);
}

// onActivated --------------------------------------------------------
chrome.tabs.onActivated.addListener(({ tabId, windowId }) =>
  scheduleCapture(tabId, windowId)
);

// onFocusChanged -----------------------------------------------------
chrome.windows.onFocusChanged.addListener(async (winId) => {
  if (winId === chrome.windows.WINDOW_ID_NONE) return;
  const [tab] = await chrome.tabs.query({ active: true, windowId: winId });
  if (tab) scheduleCapture(tab.id, winId);
});

// onUpdated – keep as is but call the helper
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    scheduleCapture(tabId, tab.windowId);
  }
});
