chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== "grab-images") return;
  (async () => {
    // No autoScroll, user scrolls manually
    const { images, videos, failed } = await collectMedia();
    chrome.runtime.sendMessage({
      type: "images",
      images,
      videos,
      failed,
      galleryTabId: message.galleryTabId,
    });
  })();
});

async function collectMedia() {
  // Collect <img> sources
  const imgSrcs = Array.from(document.images).map((img) => img.src);

  // Collect network-loaded images via Performance entries
  const perfSrcs = performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((name) => /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(name));

  // Collect canvas data URLs (skip tainted canvases)
  const canvasData = [];
  document.querySelectorAll("canvas").forEach((cv) => {
    try {
      canvasData.push(cv.toDataURL());
    } catch (e) {
      console.warn("Skipping tainted canvas:", e);
    }
  });

  // Collect <video> sources
  const videoSrcs = Array.from(document.querySelectorAll("video")).flatMap(
    (video) => {
      const srcs = [];
      if (video.src) srcs.push(video.src);
      srcs.push(
        ...Array.from(video.querySelectorAll("source"))
          .map((s) => s.src)
          .filter(Boolean)
      );
      return srcs;
    }
  );
  const uniqueVideos = Array.from(new Set(videoSrcs)).filter(Boolean);

  // Combine and dedupe images
  const allSrcs = Array.from(new Set([...imgSrcs, ...perfSrcs, ...canvasData]));

  const images = [];
  const failed = [];

  for (const src of allSrcs) {
    if (src.startsWith("data:")) {
      images.push(src);
      continue;
    }
    try {
      const response = await fetch(src);
      const blob = await response.blob();
      images.push(
        await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.readAsDataURL(blob);
        })
      );
    } catch (e) {
      // Fallback: ask background to download directly
      failed.push(src);
    }
  }

  return { images, videos: uniqueVideos, failed };
}
