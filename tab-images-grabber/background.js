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
