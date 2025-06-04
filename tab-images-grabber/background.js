// In-memory buffer for images, videos, and failed URLs per gallery tab
const galleryData = {};

// Listen for toolbar button click to trigger image grabbing
chrome.action.onClicked.addListener((tab) => {
  // Always open a new gallery tab
  chrome.tabs.create(
    { url: chrome.runtime.getURL("images.html") },
    (galleryTab) => {
      // Store the source tab ID for this gallery tab
      galleryData[galleryTab.id] = { status: "loading", sourceTabId: tab.id };
      // Start grabbing images/videos from the source tab
      chrome.scripting.executeScript(
        { target: { tabId: tab.id }, files: ["content.js"] },
        () => {
          if (chrome.runtime.lastError) {
            console.warn(
              "Error injecting content script:",
              chrome.runtime.lastError
            );
            galleryData[galleryTab.id].status = "error";
          } else {
            chrome.tabs.sendMessage(
              tab.id,
              { type: "grab-images", galleryTabId: galleryTab.id },
              () => {
                if (chrome.runtime.lastError) {
                  console.warn(
                    "Error sending grab-images message:",
                    chrome.runtime.lastError
                  );
                  galleryData[galleryTab.id].status = "error";
                }
              }
            );
          }
        }
      );
    }
  );
});

// Receive collected images/videos from content script and store by gallery tab ID
chrome.runtime.onMessage.addListener((message, sender) => {
  if (
    message.type === "images" &&
    Array.isArray(message.images) &&
    message.galleryTabId
  ) {
    galleryData[message.galleryTabId] = {
      status: "ready",
      images: message.images,
      videos: Array.isArray(message.videos) ? message.videos : [],
      failed: Array.isArray(message.failed) ? message.failed : [],
    };
    // Send data to gallery tab immediately if it exists
    chrome.tabs
      .sendMessage(message.galleryTabId, {
        type: "init-images",
        images: message.images,
        videos: Array.isArray(message.videos) ? message.videos : [],
        failed: Array.isArray(message.failed) ? message.failed : [],
        status: "ready",
      })
      .catch(() => {
        // Gallery tab might not be ready yet, that's ok
      });
  }
  // When gallery page is ready, send images, videos, and failed list for that tab
  if (message.type === "gallery-ready" && sender.tab) {
    const data = galleryData[sender.tab.id] || {
      status: "loading",
      images: [],
      videos: [],
      failed: [],
    };
    chrome.tabs.sendMessage(sender.tab.id, {
      type: "init-images",
      images: data.images || [],
      videos: data.videos || [],
      failed: data.failed || [],
      status: data.status || "loading",
    });
  }
});

// Clean up gallery data when a gallery tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (galleryData[tabId]) {
    delete galleryData[tabId];
  }
});

/* ---------- NEW: capture as soon as a tab becomes active ---------- */
chrome.tabs.onActivated.addListener(({ tabId, windowId }) => {
  scheduleCapture(tabId, windowId, 100);
});

/* ---------- NEW: second chance right after the tab finishes loading ---------- */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.active) {
    captureWithBackoff(tabId, tab.windowId);
  }
});

/* ---------- (optional) when a brand-new tab is opened and is immediately active ---------- */
chrome.tabs.onCreated.addListener((tab) => {
  if (tab.active && tab.id !== chrome.tabs.TAB_ID_NONE) {
    scheduleCapture(tab.id, tab.windowId, 400);
  }
});

// Debounce map to avoid duplicate captures
const captureTimeouts = {};

function scheduleCapture(tabId, windowId, delay) {
  clearTimeout(captureTimeouts[tabId]);
  captureTimeouts[tabId] = setTimeout(() => {
    captureWithBackoff(tabId, windowId);
  }, delay);
}

// Exponential backoff for capture retries
function captureWithBackoff(tabId, windowId, attempt = 0) {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab || !tab.active) return;
    chrome.tabs.captureVisibleTab(
      windowId,
      { format: "jpeg", quality: 45 },
      (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          if (attempt < 3) {
            setTimeout(
              () => captureWithBackoff(tabId, windowId, attempt + 1),
              150 * (attempt + 1)
            );
          }
          return;
        }
        const key = `thumb_${tabId}`;
        const now = Date.now();
        chrome.storage.local.set({ [key]: { dataUrl, timestamp: now } });
      }
    );
  });
}
